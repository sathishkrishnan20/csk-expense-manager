# Architecture and decision log

Read this first. It explains what the app is, why it is built this way, and which
earlier ideas were dropped, so a new contributor (human or LLM) does not
re-propose them without new information.

## 1. What the app is

A personal, single-user iOS expense manager. It looks and behaves like the web
"Expense Manager" the owner built earlier (React, Material UI, Google Sheets;
repo `csk-expense-manager`), but everything is stored on the phone.

Pages: **Home**, **Transactions**, **Charts**, **Config**, and a centre **+**
button that opens **Credit**, **Debit** and **Import**.

The main idea: the owner downloads a bank statement CSV, imports it, and an LLM
files each transaction under one of **the owner's own categories** (read from
Config), falling back to **Others : Uncategorised** when nothing fits. Anything
typed by hand (cash) is entered with the Credit/Debit form.

## 2. Design

```
bank CSV --> expo-document-picker --> expo-file-system File.text()
          --> statementParser    (pure, tested)
          --> importStatement    (dedupe, batching; pure, tested)
                 |-- store: expo-sqlite  (src/db)
                 `-- classify: LLM       (src/llm), given the CURRENT categories from Config
Screens (src/app, Expo Router) read SQLite.
```

| Concern | Choice |
|---|---|
| App | Expo SDK 58, React Native 0.88, TypeScript. iOS is the target; a web build is supported in code but untested (see "Web" in section 3) |
| Navigation | Expo Router 58. Tabs come from `expo-router/js-tabs` with a custom `tabBar`; Add/Edit and Import are root-stack screens above the tabs |
| Look | Theme values copied from the web app (`src/ui/theme.ts`): primary `#7F3DFF`, gradient `#9061ed` to `#5d3ba2`, income `#00A86B`, expense `#FD3C4A`, Roboto, Georgia for the Home numbers, MUI-style outlined fields and bottom bar |
| Storage | `expo-sqlite`, file `expenses.db`, schema version 8 |
| Money | Integer paise; `amount_paise` is always positive and `direction` says which way |
| API key | iOS Keychain via `expo-secure-store`; AES-GCM-encrypted in browser `localStorage` on web, with the key derived from a passkey (WebAuthn PRF) (`src/platform/secureStorage*.ts`) |
| LLM | One active provider chosen in Config > AI: Gemini (default, `gemini-3.5-flash-lite`), Claude (`claude-haiku-5-5`), ChatGPT / OpenAI (`gpt-6-luna`, Chat Completions with strict `json_schema`) or Ollama (`llama3.2`, `POST {address}/api/chat` with the schema in `format`, no key). The model name is editable per provider; defaults live in `src/llm/providers.ts` (`MODELS`) |
| Charts | `react-native-gifted-charts` |

Layout: `src/domain` (categories, parser, formatting; pure), `src/llm`, `src/import`,
`src/db`, `src/settings`, `src/ui` (shared components), `src/app` (routes).
Everything under `domain`, `llm`, and `import` (except `services.ts`) is plain
TypeScript with unit tests that run under Node. All tests live in `tests/`, mirroring `src/` (for example `src/domain/backup.ts` is tested by `tests/domain/backup.test.ts`); fixtures are in `tests/fixtures/`.

## 3. Decisions and why

**CSV import, not email/SMS/Shortcuts capture.** Those cannot reliably see the UPI
note, which is what makes categorisation meaningful. A statement row has the note,
amount, date and a unique UPI reference.

**Everything on the phone; no backend.** The earlier AWS Lambda / Turso / Redis
design was dropped. The user's own API key sits in the Keychain; the cost is that
payee, note, narration and amount of new transactions go to the chosen provider
(stated in Config). If a backend is ever added, move the LLM call there.

**Categories are user data.** Seeded once from the web app's live Config (17
categories including Payment, Savings and Car, spelling kept as-is; some entries
are personal, so review `src/domain/masterData.ts` before publishing the repo).
Config lets the owner add, rename, edit and delete categories and subcategories
and payment modes. Each subcategory can also carry an optional **description** (what
belongs in it, at most `MAX_SUBCATEGORY_DESCRIPTION` = 200 characters, one line; schema version 6,
`categories.description`, `CategoryDef.descriptions` keyed by subcategory). `listCategories` in
`src/llm/classify.ts` sends it as `Name (description)` and the prompt tells the model to treat bracketed
text as a strong hint, so local-language product names can be placed; subcategories without one cost
nothing extra. It is edited in Config > Categories, carried in the backup file (the "Subcategory
Description" column after "Subcategory List"; JSON `description`), and on restore fills only a
description that is empty here. Renaming also updates existing transactions; deleting leaves
existing transactions with their old label.

**Fallback.** `Others : Uncategorised` is always present and cannot be renamed or
deleted. `Income` cannot be renamed or deleted (income logic keys off it). The model
may only choose categories that exist now; answers are validated case-insensitively.
A known category with an unknown subcategory falls to that category's own
"Others"/"Other", otherwise to the fallback. Credits are classified only into
`Income` subcategories, and fall back to `Others : Uncategorised` like debits: `Income` has no
"Others" of its own (the fallback category is always allowed in the answer schema, for credits too).

**Re-classify.** After adding categories, Config > "Re-classify Uncategorised"
re-runs the model on imported rows sitting in the fallback (and rows migrated from
the first version). Rows the owner categorised by hand (`classified_by = 'manual'`)
are never touched; editing a row's category marks it manual.

**Hand entries are for cash.** They are never matched against the import, so the
"Add & Open GPay" button from the web app was dropped (it would create duplicates).
New hand entries default to Payment Method "Cash".

**Account balance** on Home is income minus expenses over everything stored, like the
web app. Imported rows also show the bank's own balance on their list line.

**Classify before saving, per batch of 20.** If a batch fails, nothing from it is
saved, the import stops (a bad key or quota error would fail later batches too), and
the summary says how many rows were not saved. Uploading the same file again resumes.

**De-duplication.** UPI rows: `upi:<12-digit ref>:<D|C>` (the direction matters
because a refund can reuse the original reference). Other rows:
`row:<date>|<D|C>|<paise>|<balance>|<narration>`. The key is unique in SQLite.

**Delete is soft.** `status = 'DELETED'`; the bank key stays, so importing the same
statement again does not bring a deleted row back on its own. Instead the import summary
(`ImportSummary.deletedEarlier`, found via `TransactionStore.deletedKeys`) lists up to five of
them and offers "Add them back and categorise", which re-activates those rows
(`restoreDeleted` in `src/db/transactions.ts`) and then categorises them afresh with the selected
AI through the Re-classify pipeline (`restoreDeletedRows` in `src/import/services.ts`, using the
fields from the file). Rows whose category the owner chose by hand (`classified_by = 'manual'`)
are restored with it unchanged. If the AI step fails, the rows are still restored and keep the
categories they had. The owner decides, so an
overlapping statement never resurrects a deliberate delete by accident. Deleted rows are
excluded from lists, totals and charts.

**Migration.** `PRAGMA user_version` 2. Data from the first release (single table,
old built-in categories) is carried over: rows become `Others : Uncategorised`
(debits and credits), `classified_by = 'migrated'`, ready for re-classify.

**Transaction filters** (Transactions tab, a collapsible "Filters" bar above the list):
date range (inclusive, either end can be left open), type (all / debit / credit), category,
sub category (enabled once a category is chosen; changing the category clears it), and
All / Categorised / Uncategorised, where "Categorised" hides the `Others : Uncategorised`
rows. Filtering happens in memory on the loaded list. The category and sub category choices are
the owner's current Config categories plus any label that only exists on old transactions,
so those stay filterable. Filters are not remembered between visits. Code:
`src/domain/transactionFilters.ts` (logic, tested), `src/ui/TransactionFilters.tsx`.

**Several AI providers.** Exactly one is active (`llm_provider`); each keeps its own API
key (secure storage), model name and, for Ollama, address (plain storage,
`src/settings/settings.ts`). Only the active one is ever called and there is deliberately **no
automatic fallback** to another provider: a silent switch would send the owner's transactions to
a service they did not choose for that run, change the cost, and mix labels. The model that
labelled a row is stored in `classified_by`. Ollama needs no key, and the app only sends data to
the owner's own server. iOS needs `NSAllowsLocalNetworking` and a local-network usage string
(`app.json` `ios.infoPlist`, so a changed development build is needed); a browser needs Ollama to
allow the page's origin (`OLLAMA_ORIGINS`). Not built, possible later: a cascade (Ollama first,
a cloud AI only for rows it leaves uncategorised).

**"Couldn't categorise" list.** The AI is not asked forever. Each time it answers a debit with the
fallback (Others : Uncategorised) that is one failed attempt, counted in `transactions.ai_attempts`
(schema version 3, added by `migrate`); the import is attempt 1 and each Re-classify another. At
`MAX_AI_ATTEMPTS` (3, in `src/domain/classificationOutcome.ts`) the row gets
`classified_by = 'unresolved'`: Re-classify no longer selects it, the transaction list shows "Couldn't
categorise · tap to choose", Home shows a card with the count that opens Transactions with the filter
`uncategorised: "unresolved"`, and the filter panel has a matching option. Choosing a category by hand
makes the row `'manual'`, which removes it from the list. Config > Re-classify offers "try again", which
sets the rows back to `pending` with fresh attempts. Rows the AI did not answer for (errors, omitted
ids) are not counted. Debits and credits are treated alike (older credits labelled `Income : Others` are
ordinary Income entries and are not retried). `ai_attempts` is not exported in the CSV backup; `Classified By = unresolved` is, so the
list survives a restore.

**"Recategorise with AI".** The Update form (not Add) lists a built-in extra subcategory under Others,
"Recategorise with AI" (`RECATEGORISE` in `src/domain/masterData.ts`). It is not in the `categories`
table, so it is not in Config, filters, charts or the prompt, and the AI can never answer with it
(`normalizeClassification` would turn it into the fallback). Choosing it on an expense or a credit saves the row as pending (`categoriseLater`) with `ai_attempts` set to
`RECATEGORISE_ATTEMPTS_USED` (`MAX_AI_ATTEMPTS - 1`, `updateTransaction`'s `recategorise` flag). The
next Re-classify sends it with the user's current categories; one failed answer reaches `MAX_AI_ATTEMPTS`,
so the row returns to Others : Uncategorised as `unresolved` (the "Couldn't categorise" list) and is not
sent again until the owner chooses the option again. Because `ai_attempts` is not in the CSV backup, a
pending row restored from a backup gets the normal 3 attempts.

**AI suggestions for entries it cannot place.** Besides the fallback answer, the model
returns `suggestedCategory` / `suggestedSubcategory` (empty strings when not needed; both are required
in the response schema). `classifyBatch` keeps them only with a fallback answer and only when
`acceptSuggestion` (`src/domain/suggestions.ts`) accepts them: names are tidied to one line, at most
40 characters, case snapped to existing spelling, a debit may not use Income or Others, and a credit's
category is forced to Income. **They are kept in memory only** (`src/import/suggestionStore.ts`, a map of
entry id to suggestion, in the same style as `pendingDuplicate`): `insert` (import) and
`applyClassifications` (Re-classify) add to it, a new import or Re-classify empties it first
(`startSuggestions`), and it is gone when the app closes. Nothing is written to the database, and the
entry stays in Others : Uncategorised; nothing is added to the category list until the owner approves.
(Version 7 stored them as `suggested_category`, `suggested_subcategory` and `suggestion_rejected` columns;
version 8 dropped those, so an unanswered suggestion cannot be reviewed on another day and a rejected one
can be suggested again by a later Re-classify, until the entry has used its 3 attempts.)
The **AI suggestions** screen (`src/app/suggestions.tsx`) is opened automatically at the end of Config >
Re-classify when entries stayed uncategorised and have suggestions (the run's counts go as route params for
the "X categorised out of Y" banner), from a "Review N AI suggestions" button on the import result and in
the Re-classify section of Config. `listSuggestions` (`src/db/suggestions.ts`) loads the waiting entries
from the database and drops from memory any that were categorised or deleted since. The screen groups
entries with the same suggestion in one card with editable names and a status (new category, new
subcategory, already in your list). Approve (one entry or all in the card; `approveSuggestions`) adds the
category and subcategory to `categories` if missing and files the entries under them as `manual`. Reject
just forgets the suggestion. When none are left the screen says "All reviewed" with Home and Config
buttons. Both lists are shared by all groups, and suggestions are not part of the backup file.

**PDF statements** (import, on the device). A PDF statement is read with `pdfjs-dist` 3.11 (legacy
CommonJS build; version pinned) in `src/pdf/readPdf.ts`: it opens the file with each saved password in
turn (`PdfPasswordError` says "needed" or "wrong"), then returns every piece of text with its x/y position.
`src/pdf/polyfills.ts` adds the four things React Native's engine lacks (`DOMException`,
`Promise.withResolvers`, `structuredClone`, `ReadableStream`); `metro.config.js` maps pdf.js's Node-only
`require`s (`canvas`, `fs`, `http`, `https`, `url`, `zlib`, `path2d-polyfill`) to empty modules; pdf.js's
worker code runs on the main thread (`globalThis.pdfjsWorker`). The reader is loaded lazily, so CSV and Excel
imports never touch it. `src/domain/pdfStatement.ts` (`parseStatementPdf`) turns the positioned text into the
same `ParsedTransaction` rows the CSV importer produces, so dedupe keys match across sources (checked: the
same bank rows give the same `upi:<ref>:D` keys from PDF and CSV). Columns come from the header row
(DATE, PARTICULARS, DEPOSITS, WITHDRAWALS, BALANCE; amounts are matched by right edge); one transaction is
several text lines with the date and amounts in the middle, so lines are shared out between the dated rows
by a small dynamic program that centres each group on its row. **Trust checks:** each balance must follow
from the previous one and the sums must equal the printed TOTAL row, otherwise the import is refused with
the reasons (`services.ts`); nothing is half-saved. Saved PDF passwords live in
`src/settings/statementPasswords.ts` (same secure storage as the AI key) and Config > Statement passwords.
A statement shared from Mail/Files ("Open in") arrives through `CFBundleDocumentTypes` in `app.json` and
`src/app/+native-intent.tsx`, which redirects to `/import?file=...`; this needs a rebuilt app, not Expo Go.
Not verified: pdf.js under real Hermes (speed, memory, bundling through Metro), the share sheet, other banks.
Fixtures: `tests/fixtures/*.pdf` are synthetic (invented data); never commit a real statement.
Layouts for other banks are added the same way (a header row with these column names works as is).

**In-app guide** (its own page, `src/app/help.tsx`, opened from a "How it works" row at the bottom of Config, a menu item in the browser sidebar, and a button on a first-run welcome card on Home that shows only while there are no transactions): collapsible topics (what it does, getting
started, importing, adding by hand, categories, views, where data is stored, what leaves the
device, whether the API key is safe, backup, troubleshooting). Text is plain data in
`src/domain/helpContent.ts` (`helpTopics(platform)`, wording differs for iPhone and web,
tested in `tests/domain/helpContent.test.ts`), rendered by `src/ui/HelpSection.tsx`. It is a root-stack screen like `add` and `import`. When behaviour
changes (storage, key handling, what is sent to the AI), update that file too.

**"Categorise later" for hand entries.** On the Add form the category is optional: tick
"Categorise later with AI" and the row is stored in the fallback (Others : Uncategorised
for a debit or a credit) with `classified_by = 'pending'`
(`PENDING_AI` in `src/domain/taxonomy.ts`), not `'manual'`; the list shows it as "Waiting
for AI". **Re-classify Uncategorised** includes pending rows and sends the payee,
description, amount and type (hand entries have no bank narration); the result replaces
`pending` with the model id. Choosing a category on a pending row (or editing it by hand)
makes it `'manual'`, so the AI never overwrites it; unticking the box on a pending row
requires a category again. Imported rows cannot be set to pending. Deliberately not done:
categorising on save. One call per entry is wasteful, and Re-classify batches 20 per call;
revisit if waiting turns out to be annoying. Code: `categoryFor` / `updateTransaction` /
`CANDIDATE_WHERE` in `src/db/transactions.ts`, `src/app/add.tsx`.

**Export and import of all data** (Config > "Export and Import"). Export writes one CSV
(UTF-8 with a BOM so Excel reads it correctly, `expense-manager-backup-YYYY-MM-DD.csv`) and
opens the iOS share sheet (Save to Files, AirDrop) or downloads it in a browser. One header
row, then blocks side by side: **transactions** (readable columns first: Date as `23-Oct-2026`,
Type, Amount in rupees, Category, Subcategory, Payee, Payment Method, Description, Balance,
Status; then Classified By, Source and the bank details; then Id, Bank Key, Created,
Updated, which restore needs), **5 empty columns**, **Category List / Subcategory List / Subcategory Description**,
**5 empty columns**, **Payment Mode List**. It includes soft-deleted rows (Status =
Deleted) so a restore keeps deleted bank rows from coming back. The AI key is never
included. Import finds columns by header name (order does not matter), accepts day-first
dates in several styles, amounts with commas, comma or semicolon separators and a BOM, and
still reads the JSON files of the first version. Rows typed into Excel need no Id (a stable
one is made from the row), and an empty Category and Subcategory means "Categorise later"
(`pending`). Text cells starting with `= + - @` get a leading `'` on export (and lose it on
import) so Excel never runs bank text as a formula. Import is a merge, never an overwrite:
rows already on the device (same id or same bank key) are left untouched and only missing
transactions, categories and payment modes are added; damaged rows are skipped and counted,
and a file that is not a backup or comes from a newer version is rejected with a message.
Known limit: if the file is saved from Excel with a regional date style that is month-first
and has no month name (for example `10/05/2026`), it is read day-first. Code:
`src/domain/backup.ts` (format and validation, tested), `src/db/backup.ts`,
`src/ui/DataBackupSection.tsx`, `src/platform/files*.ts`. Uses `papaparse` and `expo-sharing`.

**Groups** (schema version 4; design and reasoning in `docs/GROUPS_DESIGN.md`). A group is a separate ledger with
its own incomes and expenses and balance. `Main` (id `main`) is the built-in group that holds everything from before
groups existed; every transaction has a `group_id` (default `main`), and `expense_groups` holds `name`, optional
`start_date` / `end_date` (labels only, they never limit what a group can hold) and `status` (`ACTIVE`, `CLOSED`,
`DELETED`; deleting a group soft-deletes its transactions). Groups are created only by the owner. **A group is used exactly like Main**: Home, Transactions and Charts are
shared views (`src/ui/HomeView.tsx`, `TransactionsView.tsx`, `ChartsView.tsx`) that take a `groupId`; Main's tab
files render them with `main`, and a group's pages (`src/app/groups/[id]/`, its own `js-tabs` navigator with the same
`Footer`) render the same views with the group's id. The group's Overview has no title bar, like Main's Home: its purple block carries a
back button, the name and an options button (edit name and dates, close or reopen, delete; `useGroupActions` in
`src/ui/GroupHeader.tsx`); its Transactions and Charts have a title bar (`GroupHeader`) with the same back and options. A group's
tabs are opened by path, because switching by route key lost the group's id and sent Charts back to the Groups list. The
`Footer` and the web `Sidebar` take the group from the route, so the + menu (Credit, Debit, Import) adds to the group
you are in. Totals are per group and `groupId` is a **required** parameter of the db queries, so a missed call
site is a type error; Home's Account Balance is Main only and there is deliberately no combined total (a transfer
from Main to a group is a debit in one and a credit in the other). **Importing goes into a chosen group**: the
Import screen has an "Import into" picker (a group's own Import button presets it) and every row of the file goes
there, whatever it is. The importer itself is unchanged; `src/import/scopedStore.ts` wraps the store so the dedupe
key (which is also the row id) is `<groupId>|<bankKey>` for a group and the plain bank key for Main, so existing
data is untouched and the same file can be imported into Main and a group without colliding. The key is fixed at
import time. `scopedKey` is in `src/domain/groups.ts`; the CSV backup derives the UPI reference from a key with or
without that prefix. Migration: `ALTER TABLE ... ADD COLUMN group_id` guarded by `pragma_table_info`, and the index
on `group_id` is created after it (not in `SCHEMA`, which also runs on old databases). Backup version 2 adds a
`Group Id` column and a Groups block; version 1 files restore into Main, and a transaction whose group is missing
from the file falls back to Main. Not built: moving existing rows to another group, and a "Reopen and import"
prompt (importing into a closed group simply works).

**Create a group for an entry** (schema version 5). A new entry in Main (Add form; not edits, not inside a group) has a "Create a
group for this entry" option. The entry stays in Main, and `addEntries` (`src/db/transactions.ts`) saves, in one db transaction,
the group, an opening income in it equal to the amount (Income : Account Transfer if the owner still has it, otherwise
the first Income subcategory; `src/domain/entryGroup.ts`) and the entry, which remembers the group in `transactions.created_group_id`
(also in the CSV backup as `Created Group Id`). The group is prefilled, all editable: name `Category - Subcategory` (else
the description, else the payee), start = the entry's date, end = the last day of that month. Duplicate uses the link:
a copy of an entry that created a group offers its own new group (only for copies going into Main), with the name, dates
and income shown upfront in the preview; the name is the original group's name with the copy's month added
(`copyGroupName`), a name that already exists, or repeats within the copies, is an error to fix before creating, and
a banner warns that N groups will be created. Unticking it copies just the entry. The entry creating its group does not
delete or change the group if the entry is later edited or deleted.

**Add a list** (`src/app/bulk.tsx`, "Add list" in the + menu and the web sidebar; opened inside a group it is preset to that group).
Many hand entries from rows pasted out of Excel, or from a CSV or Excel file (`excelToCSV`, as for statements), plus a downloadable
CSV template (`saveCsvFile`). `src/domain/bulkList.ts` (`parseBulkList`, tested) reads the text: only Payee and Amount are needed; a
header row (default: Payee, Amount, Date, Category, Subcategory, Description; also Type and Payment Method if present) maps columns by
name in any order, a header without a Payee or Amount column flags every row, otherwise (no header of their own) the columns follow the default order, so a line of just payee and amount is complete. The default header is shown as a fixed strip above the paste box, so pasting can never replace it. A lone cell "Room Rent 24000" is split at the amount. Tabs, commas and semicolons are all accepted
(an unquoted thousands comma in a comma-separated line is ambiguous; quote it, as Excel does). A row with a missing or zero amount, a
bad date or type, or a category that is not one of the owner's is flagged and left out. The screen has a default date, type and group
for rows without their own, a preview with a tick per row, and saves with `addEntries`; rows without a category are Categorise
later. Like duplicates they are hand entries, so future-dated ones added to Main are counted twice once the real statement is imported
(the screen warns; a group avoids it). Not built: choosing one category for all rows without one.

**Duplicate** (select, then copy with new dates). Touch and hold a row in Transactions or a group page to start
selecting; "Select all" takes everything the filters show. Duplicate opens `src/app/duplicate.tsx` (a screen, not a
dialog, so the date and group pickers are not nested modals): a date rule (`shiftMonths` by N months, clamped to the
month's last day, or one date for all), a target group (the original's group by default), and a preview where each
amount can be edited and a row left out. The rows travel through `src/ui/pendingDuplicate.ts` (memory only; bank keys
can be too long for a route). A copy is a new **hand entry** (`src/domain/duplicate.ts`, `addTransactions` in one
db transaction): category and readable fields are copied, bank-only fields are not, and a source row that is
uncategorised, pending or unresolved is copied as "Categorise later" so Re-classify can place it. Hand entries are never
matched against a statement import, so a future-dated copy in Main would be counted twice once the real statement is
imported; the screen warns about it, and duplicating into a group avoids it.

**Embeddings, vector search and RAG were dropped** (an earlier learning goal; not
needed for classifying a short note into a list). They can return later, for example
for "ask questions about my spending".

**Web** (`npm run web`; code written, never run). SQLite was not the only blocker. What
differs per platform lives behind `.web.ts(x)` files so the phone code is unchanged:
`src/platform/secureStorage` (Keychain vs passkey-encrypted `localStorage`, see below), `src/platform/files` (share
sheet vs browser download, and reading the picked file), `src/platform/dialogs`
(`Alert.alert` does nothing on web, so confirmations use `window.confirm`), and
`src/ui/CalendarPicker` (`@react-native-community/datetimepicker` has no web build, so on web
`DateField` is the browser's own `<input type="date">` inside the field, picked in one step; the
phone keeps the tap, pick, OK sheet). `inTransaction` in `src/db/database.ts` uses an exclusive
transaction on the phone and a plain transaction on web (expo-sqlite web has no exclusive
ones), and WAL is not requested on web. `expo-sqlite` on web runs wa-sqlite in a worker with
`SharedArrayBuffer`, so the page must be cross-origin isolated: `metro.config.js` adds the
`wasm` asset type and the COOP/COEP headers for the dev server (any host would need the
same headers; `public/_headers`, `_redirects` and `serve.json` carry them into `dist/` for
`npm run web:build`, and `npm run web:serve` serves it locally). `app.json` uses `web.output: "single"` (not static rendering, which cannot
run SQLite). Layout in a browser follows the web Expense Manager: below 768px wide it is the phone layout
(bottom bar and + button) as a centred column of at most 480px; from 768px up the bottom bar
is hidden (`Footer` returns null) and `src/ui/Sidebar.tsx` shows the permanent left drawer
(pages, plus Credit / Debit / Import in place of the + menu) with the page filling all
the space to its right, as in the web app. The breakpoint and widths are in `src/ui/useLayout.ts`, which also
gives `useContentWidth()` for pixel-sized content (the bar chart). Phones never reach the
breakpoint, so the iPhone layout is unchanged. Dialogs (`Sheet`) are at most 420px wide.
Web data is separate from phone data; Export/Import moves it.

**Web API key protection.** `secureStorage.web.ts` encrypts the key with AES-GCM; the
AES key is derived (HKDF) from the WebAuthn **PRF** output of a platform passkey, so it
exists only in memory after the user verifies with Touch ID / PIN, once per page load
("Unlock"). The passkey is only a local key source (no server, so the challenge is never
verified). `UnlockGate` shows an Unlock button in place of the key field, the import button
and the re-classify button while locked; browsers only show the prompt from a tap, which is
why unlocking is its own button. The provider choice is stored unencrypted (`plainStorage`).
First save creates the passkey; if the browser only returns the secret on a second call,
Save asks to be pressed again. Limits: needs PRF support (recent Safari/Chrome); a deleted
passkey makes the stored key unreadable ("Forget saved key" resets); malware or a malicious
extension running while unlocked can still read the key.

### Cloud backup (Config > Cloud backup)

An encrypted copy of the same data as Export, kept on a free Cloudflare Worker + KV (`server/`). Chosen
for: free without a card, never pauses when idle, a tiny server we control, works from Expo Go.

- **Identity is one random secret per owner**, made on the phone (`expo-crypto` `getRandomBytesAsync`;
  the synchronous version falls back to `Math.random` in dev builds, so it is not used), shown as a
  34-character Crockford base32 **recovery code** with a 1-byte check so typos are caught
  (`src/domain/cloudBackup.ts`). It is kept in the Keychain (`secureStorage`), not SQLite: the Keychain
  usually survives a reinstall, and it must not be in a backup file. No user id column was added.
- **Two values are derived from it with HKDF-SHA256** and cannot be turned back into the secret: the backup
  **id** (64 hex characters, the KV key) and the AES **key**. Backing up again computes the same id, so the
  server replaces that one blob; nothing links the id to a person.
- **Sealed on the phone:** CSV (`serializeBackup`) -> gzip -> AES-256-GCM with a fresh 12-byte nonce and the
  header `EMB\x01` as associated data -> base64 text. Compression comes first because ciphertext does not
  compress. The server holds only that text and an `updatedAt`.
- **Protocol** (`server/src/worker.ts`, client `src/cloud/client.ts`): `PUT|GET|DELETE /backup/<id>`. The
  Worker accepts only ids of 64 lowercase hex, bodies that start like a sealed backup (`RU1CA`) and at most
  10,000,000 characters (`MAX_UPLOAD_CHARS`, the same in the app, checked before upload; KV allows 25 MiB).
  CORS is open so the web build can call it.
- **Restore is the same merge as Import** (`restoreBackup`): it never changes what is on the phone. A code
  typed on a new phone is saved only after it opened a backup. Delete removes the server copy; Turn off
  forgets the code on this phone and leaves the server copy.
- **Skip unchanged:** a keyed fingerprint of the CSV is kept in plain storage; if it equals the last upload,
  nothing is sent. The free tier allows about 1,000 KV writes a day for the whole account (one backup = one
  write); D1 (100,000 a day) is the upgrade path, with no change to the app.
- **Server address:** `EXPO_PUBLIC_BACKUP_URL` in `.env` (see `server/README.md`). Without it the section says
  cloud backup is not set up.
- **Limits, stated honestly:** whoever has the id can read the (encrypted) blob, replace or delete it, and the
  id is unguessable but there are no accounts, so anyone who finds the address can store junk under random ids
  (size cap + shape check only). A lost recovery code means a lost cloud copy. Stored data never expires.
- Unit tests: `tests/domain/cloudBackup.test.ts` (code, keys against Node's own HKDF, AES-GCM against Node's
  own decipher, tamper detection), `tests/server/worker.test.ts`, `tests/cloud/client.test.ts` (app and
  Worker together with an in-memory store). **Not verified:** the code in the app on an iPhone, Metro bundling
  of `@noble/*` and `fflate`, real Cloudflare KV, and speed of the pure-JS AES on a multi-megabyte backup.

## 4. Differences from the web app (deliberate)

- No login, no Google Sheet, no "Paid By Karthika/Sathish" special case.
- Transactions are sorted by date, newest first (the web app lists newest-added first).
- The Expenses card on Home shows a positive amount; the web app shows it negative.
- Add form: amount must be a positive number; Payment Method defaults to Cash.
- Config also has Payment Mode add/remove, an AI section (key, provider), and separate Export and Import and Re-classify Uncategorised sections.
- Empty states say what to do instead of "Not Found".

## 5. Things learned (do not undo)

- **`metro.config.js` forces the CommonJS build of `@anthropic-ai/sdk`.** Its ESM
  build has an import cycle that crashes at startup under Metro
  ("Cannot read property 'BetaToolRunner' of undefined"). Only this package is
  redirected; disabling package exports globally breaks React Native itself.
- **Expo Router 58 no longer ships React Navigation.** Import `Tabs` and the
  `BottomTabBarProps` type from `expo-router/js-tabs` (importing `Tabs` from
  `expo-router` is deprecated). A custom bar receives `state` and
  `navigateToTab(routeKey)`, not a `navigation` object.
- **Keep `slug` as `ai-expense-manager` in `app.json`.** Expo Go stores app data
  per slug; changing it makes existing data look lost.
- **`react` stays at 19.3.0.** The React Native 0.88 renderer is pinned to it.
  TypeScript 7 is used though Expo lists ~6.0.3 (`expo.install.exclude` keeps
  `expo-doctor` green; it only type-checks).
- **`keyboardShouldPersistTaps="handled"`** on scroll views containing inputs, or the
  first tap on a button only dismisses the keyboard.
- The **+** menu opens in a `Modal` so every action is tappable; the closed button
  sits in a wrapper that extends 24px above the bar (`pointerEvents="box-none"`)
  because iOS ignores touches outside a parent's bounds.
- Gemini free-tier access changes per model (`gemini-2.5-flash` is now limited to
  existing users). Check AI Studio if calls fail with quota errors.

## 6. What was verified, and what was not

Verified: 66 unit tests (latest run; the web changes were checked with typecheck and unit tests only), typecheck, `expo-doctor`, a production iOS bundle, and a
run in the iOS 26.2 simulator covering every page; the **+** menu; adding, editing
and soft-deleting; adding a category; the data migration from the first version;
real requests reaching Google and Anthropic (rejected for a fake key, as expected);
and, against a local mock of Gemini, a full import with debits and credits, the
re-classify flow, and re-importing a statement that includes a deleted row.

Not verified: the whole web build (never started in a browser: SQLite wasm loading,
the isolation headers, the date input, download/upload, charts on web, and above all the
passkey create/unlock flow, which depends on browser and authenticator PRF support), a real classification by Gemini or Claude (no key was available), a
real bank CSV with a header row, a physical iPhone, and statements with hundreds of
rows. The simulator's fast keyboard injection sometimes dropped characters on some
forms (and once left the app); fields accepted full text in other runs, so this was
treated as a simulator artefact, but typing on a real phone is untested.

## 7. Experiment (finished and removed): offline-first classification

Idea: classify a transaction on the phone first, and ask the LLM only when the offline
answer is not confident. Two ways were measured on the owner's exported sheet
(`expense.tsv`: 159 distinct active descriptions, 12 categories, 39 category/sub
labels, 18 of which appear on only one row):

| approach | category right | category + sub right |
|---|---|---|
| Sentence embeddings + nearest past description (`react-native-executorch` 0.10.7, `all-MiniLM-L6-v2`, about 2 ms each, leave-one-out) | 74% | 47% |
| Apple Create ML text classifier, BERT transfer learning (10-fold, Mac) | 65% | 16% |
| Apple Create ML text classifier, maxEnt (10-fold, Mac) | 57% | 38% |

With the embedding match, results above similarity 0.7 covered 34% of rows with 93%
category accuracy and 70% full-label accuracy. Create ML's confident cases were
similar for category (about 40% of rows at 90%+) and poor for subcategory.

Conclusion: the limit is the amount and consistency of labelled history, not the
model. Subcategories used once cannot be learned, and categories change over time.
A custom Create ML model would also need native Swift code and retraining on every
category change. Decision: keep the LLM as the classifier; do not ship an offline
classifier. A cheaper idea left open: pass the few most similar past transactions to the
LLM as examples (retrieval-augmented prompting).

The experiment code (screen, tested scoring module, route) was removed. A backup of it
was kept outside the repo; it is easy to recreate from this description. Two bugs found
in the first version of the evaluation are worth remembering if it is rebuilt: the
description must be read from the Description column only (not every column after it),
and the hidden row must be excluded from its own top-3.

Installing the library fails with ERESOLVE unless `react-dom` matches `react`
(npm otherwise pulls `react-dom@19.3.1` as an optional peer); `react-dom` is therefore
pinned to 19.3.0 in `package.json`.

Offline need, decided: importing and re-classifying require internet (the owner imports
when online), everything else already works offline, and no on-device model is needed
today. Apple's built-in model needs an iPhone 15 Pro or newer (the owner has an iPhone 14),
so only downloaded small models would be possible. **Revisit in 3-6 months** with the
real data collected by then (every imported row keeps its payee, UPI note and category,
and rows the owner corrected are marked `classified_by = 'manual'`, which makes them the
best-quality labels): use Config > Export and Import (see section 3), then repeat the
leave-one-out comparison above.

## 8. Possible next steps

Spending trends by month, a "transfer to self" rule, move existing transactions into a group, and a natural-language question box over the local data.

## 9. Working agreement with the owner

- Code changes only. Do not run or test the app (no dev server, simulator, Expo Go,
  native builds or screenshots); the owner tests the app on their own iPhone.
- `npm run typecheck` and `npm test` (Node unit tests) may be run but are not required.
- At the end of a change, state what was changed and that it was not run in the app.

(The same rules are in `AGENTS.md`, which coding agents read first.)
