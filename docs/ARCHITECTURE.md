# Architecture and decision log

Read this first. It explains what the app is, why it is built this way, and which
earlier ideas were dropped, so a new contributor (human or LLM) does not
re-propose them without new information.

## 1. What the app is

A personal, single-user iOS app (**CSK Manager**; it started as an expense manager and is meant to cover the owner's other day-to-day
needs too: gifts, assets, train alarms). The expense part looks and behaves like the web
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
| Navigation | Expo Router 58. **One flat root `Stack`** (`src/app/_layout.tsx`): every page, including Home, Transactions, Charts, Config and a group's pages, is a screen of it and slides in like any other (no tab navigator, no bottom bar). Pages are reached from the menu drawer, and the floating + button is `AddMenu` (`WithAddButton` puts it on each page). Add/Edit and Import are screens of the same stack |
| Look | Theme values copied from the web app (`src/ui/theme.ts`): primary `#7F3DFF`, gradient `#9061ed` to `#5d3ba2`, income `#00A86B`, expense `#FD3C4A`, Roboto, Georgia for the Home numbers, MUI-style outlined fields and bottom bar |
| Storage | `expo-sqlite`, file `expenses.db`, schema version 18 |
| Money | Integer paise; `amount_paise` is always positive and `direction` says which way |
| API key | iOS Keychain via `expo-secure-store`; AES-GCM-encrypted in browser `localStorage` on web, with the key derived from a passkey (WebAuthn PRF) (`src/platform/secureStorage*.ts`) |
| LLM | One active provider chosen in Config > AI: Gemini (default, `gemini-3.5-flash-lite`), Claude (`claude-haiku-5-5`), ChatGPT / OpenAI (`gpt-6-luna`, Chat Completions with strict `json_schema`) or Ollama (`llama3.2`, `POST {address}/api/chat` with the schema in `format`, no key). The model name is editable per provider; defaults live in `src/llm/providers.ts` (`MODELS`) |
| Charts | `react-native-gifted-charts`. Under the expenses bar chart (`src/ui/ChartsView.tsx`) a table lists the same rows the chart has, for whichever grouping is chosen (Category, Sub Category, Payment Method or Payer): the name, the amount, and its percentage of all the expenses shown, with a Total row (`src/domain/expenseTable.ts`) |

Layout: `src/domain` (categories, parser, formatting; pure), `src/llm`, `src/import`,
`src/db`, `src/settings`, `src/ui` (shared components), `src/app` (routes).
Everything under `domain`, `llm`, and `import` (except `services.ts`) is plain
TypeScript with unit tests that run under Node. All tests live in `tests/`, mirroring `src/` (for example `src/domain/backup.ts` is tested by `tests/domain/backup.test.ts`); fixtures are in `tests/fixtures/`.

## 3. Decisions and why

**CSV import first; SMS capture as an addition.** SMS and email cannot see the UPI
note, which is what makes categorisation meaningful. A statement row has the note,
amount, date and a unique UPI reference. A bank SMS has the amount, date, a cut-short
payee and the same UPI reference, so it is used as an *additional*, automatic way in
(see "Bank SMS" below); the statement import stays and completes those entries.

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
**Ask AI (chat about your data).** A page in the menu and a **round sparkle button floating just above the + button on Home and on a group's Overview** (`AskAiButton`, `src/ui/AddMenu.tsx`, switched on with `<WithAddButton askAi>`; it opens `/chat`, or `/groups/<id>/chat` from a group page, and a wide browser window has it in the Sidebar instead) (`/chat`, and `/groups/<id>/chat` inside a group; `src/ui/ChatView.tsx`, with the same Group filter as Charts and a period: this month,
last month, last 3 months, this year, all time). It is **an agent over a registry of capabilities**, not one big prompt: the AI is told what it may look up, asks for it, the app runs the lookup on the
phone, and the AI answers from what came back. **No provider's tool-calling API is used.** Every round the AI answers one JSON object (`AGENT_SCHEMA`, `src/llm/chatAgent.ts`): either
`action: "call_tools"` with `calls` (each a tool `name` and `argsJson`, the arguments as JSON text, because a strict schema cannot describe each tool's own arguments) or `action: "answer"` with
the reply and an optional proposal. That is the same one-shot JSON call every provider already has (`LlmCall`), so all four work with one code path; native tool calling can replace the transport
later without touching a capability. **A capability** (`src/domain/chatTools.ts`) is one feature's part of Ask AI: `id`, `title`, a one-line `description`, and `tools` (name, description, argument
specs, `run`). The list is `CAPABILITIES` in `src/chat/capabilities/index.ts`: **Expenses** (`expense_totals`, `expense_entries`), **Assets** (`assets_list`, `assets_totals`),
**Gifts** (`gifts_list`, `gifts_totals`), **Train journeys** (`train_journeys`) and **Groups** (`groups_list`). **To put a new feature in Ask AI, add one file there and one line in the list** (the
rule is in `AGENTS.md`). Capability files import no database: they read through `ChatData` (`src/chat/types.ts`), implemented by `src/chat/data.ts` (`src/db/chatQueries.ts` for expenses, and the
existing `listAssets`, `listGifts`, `listJourneys`, `listGroupsWithBalances`), so `tests/chat/capabilities.test.ts` runs every tool with fake data.

**One question, step by step** (`src/chat/ask.ts`, `runAgent`). The system prompt (`buildAgentSystemPrompt`) holds the role and rules, the page's groups and period, the expense category names (and
the subcategory descriptions in a separate block, as for the categoriser), and the description of each **offered** tool. The first request therefore carries **no data**, only the question and the
last 12 turns. The AI asks for up to 3 tools per round, up to 4 rounds, then one last round in which it must answer. Each call is looked up by name, its arguments are checked by `validateArgs`
against the tool's own spec (unknown arguments are ignored, a wrong one comes back as a message), and `run` returns data that is turned into text and cut at 6,000 characters (20,000 per question).
Anything that goes wrong (unknown tool, bad arguments, a failing tool, too much data) is **given back to the AI as text** to correct, never thrown. Only a model that does not keep to the format
(`ProtocolError`: not an object, no answer, still asking for tools after its last round) ends the exchange; then, if Expenses is on, the question is asked **the earlier way**, one request with a
summary of the expenses (`getSpendingSummary`) and, with sharing on, the newest entries (`listChatEntries`, 600, or 100 for Ollama), `askExpenseChat` in `src/llm/chat.ts`. Provider errors (no
internet, a quota) are not format errors and are shown as they are. The reply says which kinds of data were looked at ("Looked at: Expenses, Gifts"). Ollama gets `LlmDeps.numCtx` (16384) because its
own window is about 4,000 tokens.

**The expense tools never get SQL from the AI.** `src/domain/chatQuery.ts` builds the statements from fixed pieces with every value as a parameter: type (spent, received, both), dates (default: the
page's period), category, subcategory, payee (contains), words (any of them in the description, the UPI note or the payee, with LIKE wildcards escaped), and a `groupBy` from a whitelist of
expressions (category, subcategory, month, payee, payment method, or what was written). The statements are tested against a real SQLite (`tests/domain/chatQuery.test.ts`), including
injection-style input. Totals are computed by the database, so the AI is told never to add up numbers itself. The tools return the description and UPI note of an entry as text but **never the bank
narration, UPI id, balance or any internal id**.

**Privacy.** **There are no switches.** An earlier version had a "Share every transaction" switch and one switch per capability (stored in `src/settings/chat.ts`, a `sensitivity` on each tool); both were removed on the
owner's decision: the owner is the one asking, so the AI may look in any part of the app's data that the question needs, and the page says plainly where the data goes. `offeredTools` returns every tool of every
capability. What keeps the exchange narrow is the design, not a setting: the first request holds no data, the AI gets only what a tool returns for the question, each tool is capped (a few dozen rows, 50 entries), and tools
never return the bank narration, UPI id, balance or any internal id. `privacyNote` (`src/domain/expenseChat.ts`) tells the owner on the page which AI gets what; for full privacy the owner uses Ollama, and what a cloud
AI company does with data is governed by its own account settings, which the app cannot change. What leaves the device with a question: the question and recent turns, the category names and descriptions, the tool
descriptions, and **only what the lookups return** (or, in the fallback when a model cannot keep to the format, a summary of the expenses and the newest 600 entries, 100 for Ollama).

**Proposals.** The AI never changes anything. When no subcategory in the list describes a purchase well (a photo album is not a "Gift") it proposes a better one
(`proposedCategory`, `proposedSubcategory`, `proposedDescription`; all required in the schema, empty strings when none). `acceptProposal` reuses `acceptSuggestion`, so a proposal that is empty, too long,
Income, Others, or already listed is dropped; a usable one shows as a card with Add to my list and Not now, and only the first calls `addApprovedSubcategory` (`src/db/config.ts`), which inserts the
category and subcategory with the description (idempotent) and moves no entry. The conversation is kept in memory only; New chat clears it.

**History.** The chat began as one prompt carrying a summary of the expenses; descriptions were missing, then entries were added up to a cap of 600. It was replaced by tools because a prompt
cannot hold everything, the AI is poor at adding many numbers, and the owner wants Ask AI to cover assets, gifts, train journeys and later features. Vector search was considered and not built: it
returns a sample of similar entries, not a complete set, so sums would be wrong, and it needs an embedding model on a phone or a cloud call with your text.
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
Entries the AI left in Others : Uncategorised with no usable suggestion are tracked too (`addUnsuggested` in `suggestionStore.ts`,
written by `applyClassifications`, read by `listUnsuggested`): the suggestions screen lists them under "No AI suggestion", each with its
entry's own category picker with a Save button, and Re-classify / import results mention them. Memory only, like the suggestions.
Both the suggestion cards and those entries use `src/ui/CategoryPicker.tsx`: Category and Sub Category dropdowns over the owner's list, each ending in "+ Add new" (a box to type a name not in the list); an AI idea that is not in the list starts in that typing mode.

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
`src/app/+native-intent.tsx`, which redirects to `/import?file=...`. The import screen does not start by itself: it shows "Import into" (set to the Home group, changeable) and an "Import shared file" button, so the rows go into the group the owner sees. This needs a rebuilt app, not Expo Go.
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
(UTF-8 with a BOM so Excel reads it correctly, `csk-manager-backup-YYYY-MM-DD.csv`) and
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
shared views (`src/ui/HomeView.tsx`, `TransactionsView.tsx`, `ChartsView.tsx`) that take a `groupId`; Main's
files (`src/app/index.tsx`, `transactions.tsx`, `charts.tsx`) render them with `main`, and a group's pages (`src/app/groups/[id]/`, plain screens of the root stack with no layout file of their own, no bottom bar, see **App menu**) render the same views with the group's id. The group's Overview has no title bar, like Main's Home: its purple block carries a
back button, the name, a menu button and an options button (edit name and dates, close or reopen, delete; `useGroupActions` in
`src/ui/GroupHeader.tsx`); its Transactions and Charts have a title bar (`GroupHeader`) with the same back and options. A group's
pages are opened by path (the drawer's group menu uses `router.navigate` with the full path), because switching by route key lost the group's id and sent Charts back to the Groups list. The
`AddMenu` and the web `Sidebar` take the group from the route, so the + menu (Credit, Debit, Import) adds to the group
you are in. Totals are per group and `groupId` is a **required** parameter of the db queries, so a missed call
site is a type error. (Balances now roll up through the group tree, see "Groups inside groups" below; the original
design had no combined total.) **Importing goes into a chosen group**: the
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

**Groups inside groups and pinning** (schema version 9). `expense_groups` gains `parent_id` (the group it sits under; null for
Main and for a group kept separate) and `pinned`. **A group's balance is its own income minus its own expenses plus the
balances of its direct subgroups, each of which already includes theirs** (`withRolledUp`, `balanceOf` in
`src/domain/groups.ts`, tested); `listGroupsWithBalances` returns `inPaise`/`outPaise` (own entries) and `subgroupsPaise`.
The Income and Expenses cards (and the In/Out on group cards) include everything below the group (`subgroupsInPaise`,
`subgroupsOutPaise`, `totalInPaise`, `totalOutPaise`), so income - expenses is the balance, and the purple block says "Includes the
groups under it". The Transactions list and Recent Transactions of a group are still its own entries only. This is what makes the
owner's usage work: salary is the only income in Main, and everything else sits in groups under Main. A budget entry in a
parent ("Day to day" 30,000 in Nov) is cancelled by the opening income in the group it created, so only the real spending
reduces the totals. Closed groups still count (the money was spent); deleted ones do not. Decisions: **existing groups
keep no parent** at migration, so Main's balance does not change until the owner puts a group under another one; a **new
group defaults to under Main** (the form's "Sits under" picker also offers "None (kept separate)", for something like a second
bank account); names stay unique across all groups; a group cannot sit under itself or one of its own subgroups
(`validateParent`, the picker leaves those out, and `updateGroup` checks again); **closing, reopening and deleting cascade**
to the subtree (`subtreeIds`; delete asks first and counts the subgroups and entries). The Groups page is a tree
(`flattenTree`, indented, closed groups in their own section) with a pin button per card. Home's strip (`stripGroups`) shows the
pinned groups first at any depth, then the groups right under Main or kept separate; inside a group the strip is its own
subgroups (pinned first) (there is no New group / New subgroup button anywhere: **groups are only created from an entry**, "Create a group for this entry" on Add and in Duplicate; `/groups/edit` is for editing). The group's options menu has Pin to Home, edit (name, dates, parent), close/reopen, delete. "Create a group for this entry" and Duplicate's new-group option
now work in any group, not only Main: the new group's `parent_id` is the group the entry is in, and its opening income is "from"
that group's name. Backup adds `Groups Parent Id` and `Groups Pinned` columns after `Groups Status`; older files restore their
groups as separate and unpinned, and a parent that is in neither the file nor the phone is cleared. Not built: moving an
existing group's entries, depth limits (none), a breadcrumb on a deep group's page.

**Developer cleanup** (Config > "Developer (dev builds only)", `src/ui/DevToolsSection.tsx`, `src/db/dev.ts`). Rendered only when `__DEV__`
is true (Expo Go, the dev server), so a release build (`npm run ipa`, `ios:device`) never shows it. One button, after a confirmation, deletes every
transaction (hard delete, so the same statement can be imported again) and every group except Main, and resets Main (no parent, not
pinned); categories, payment modes, settings and keys stay. It also empties the in-memory AI suggestions. Not undoable.

**Home group and the Group filter.** The app opens on a configurable **home group** (`src/settings/homeGroup.ts`, plain storage key `home_group`;
Main when unset). `resolveHomeGroup` (`src/db/homeGroup.ts`) falls back to Main when the saved group is closed or deleted, and
`useHomeGroup` (`src/ui/useHomeGroup.ts`) re-reads it each time a page is focused. The Home, Transactions and Charts pages
(`src/app/index.tsx`, `transactions.tsx`, `charts.tsx`) render `HomeView` / `TransactionsView` / `ChartsView` for that group instead of always Main, so Main is now just a
group: its own page is `/groups/main` (the same `groups/[id]` route, with the options menu limited to Rename and Show on Home, since Main
is never pinned, closed or deleted). The home group is set with the home icon on each card of the Groups page or "Show on Home" in a group's
options. On the Home page the Groups strip (`homeStripGroups`) lists the pinned groups, then Main, then the home group's subgroups, then the
other top-level groups, never the one shown; a group's own page still lists its subgroups. The floating **+**, Import and Add list start
in the home group when no `?group=` is given (`resolveHomeGroupId`); the Add form also has a Group field for one entry, and the group tabs'
last item is now "Home". (An earlier "remember the last group picked in Add" default was replaced by this.)
The **Group filter** (`src/ui/GroupFilter.tsx`, pure logic in `src/domain/groupScope.ts`) is on Transactions and Charts: a `GroupScope` is
a list of group ids or null for every group, it starts on the page's own group, and ticking groups widens it (at least one stays ticked).
`listTransactions`, `getTotals` and `getExpensesBy` take a scope (`scopeSql`: `group_id IN (...)` or none). When a list covers several
groups each row shows its group; Duplicate from such a list copies into the rows' group (or the page's group when they differ). "See All" on
Home passes `?fresh=` so the page starts on its own group again. The filter is not saved between visits.

**Create a group for an entry** (schema version 5). Balances roll up, so the opening income must not be counted twice. For an **expense** entry the
parent's expense cancels the group's opening income. For an **income** entry the money stays in the parent, so the group's opening income is
**held** (`expense_groups.held_paise`, schema version 10, `heldOpening`): it is part of the group's own figures (the group shows it to spend) but left
out of what the group adds to its parent (`withRolledUp`, capped at the group's own income in case the opening entry was deleted). 2.5L income + a
group made from it shows 2.5L in Main, not 5L. The version 10 migration back-fills `held_paise` from the income entry that created each existing
group. The CSV backup has `Groups Held`.
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

**Gifts** (schema version 11; `src/domain/gifts.ts`, `src/db/gifts.ts`). Gold and money relatives give at functions (marriage, hair
offering, ...) and what the owner gives back at theirs, kept **for information only**: two tables of their own, nothing in
`transactions`, no category, no group, no AI, and nothing that touches any balance, chart or total. Groups were considered first and
dropped for this: a received gift would have to be an `Income` credit, rolls into balances and the "All groups" totals, and gold has no
rupee amount. Tables: `gift_occasions` (`id`, `title`, `occasion_date`, `status`) and `gift_list` (`id`, `occasion_id`, `name`,
`direction` received|given, `type` cash|gold|silver|other, `value`, `unit` INR|g, `rate_paise`, `note`, `status`), soft-deleted like
transactions, no foreign key (the db layer keeps `occasion_id` valid). **One kind of gift per row** (cash and a ring are two rows).
`value` is paise when `unit` is INR and **milligrams** when it is g (2.25 g = 2250), so there is no float drift; gold and silver can
also be a rupee worth ("2000 worth of silver"); `rate_paise` is the optional price of a gram that day, which gives "worth then".
**Occasions have no screens.** The gift form's Occasion field lists the occasions that have at least one gift; "+ New occasion" types a
name, and the first gift's date becomes the occasion's date (`resolveOccasion`: the same name ignoring case and spacing is the same
occasion, so a yearly function needs the year in its name). A later gift shows the occasion's date locked; "Change the occasion date"
unlocks it and changing it moves the whole occasion (the form says how many gifts). An occasion with no active gifts is not listed. No
people table: the name is free text, and typing it in the search box finds everything a person gave or received (search matches name,
occasion, note and the gift text). Editing or deleting an occasion (rename, date, delete) is deliberately not built yet; add a ⋮ menu on
a section once the owner has used it. Screens: `src/app/gifts.tsx` (flat cards like Transactions, no overview or totals at the top, search,
occasion and Received/Given filters; `GiftRow`), `gift.tsx` (add/edit, Save & next; every choice - occasion, Received/Given, type, grams or rupees - is a dropdown, not a tab-like selector), `gift-import.tsx`
and the Gifts item of the app menu (see **App menu**). **Import list**: paste text or
choose a CSV/Excel file; `parseGiftList` treats a line with one cell followed directly by gift lines as an occasion heading (several in a
row are joined with " - "), lines with a name and a gift as gifts, and `parseGiftText` reads "3Gram gold", "1.5G Gold", "1G" (gold),
"100000Rs", "10000" (cash), "2000 worth of silver" and plain words ("Bangle", other); text with digits it cannot read ("1000 or 500") is
kept as a note with a warning. Headings starting "Repaid"/"Returned" default to Given. Each occasion's name, date and direction can be
edited in the preview, and a title that already exists adds to it and keeps its date. Backup version 3 adds the two blocks after Groups
(`Occasions Id|Title|Date|Status`, then `Gifts Id|Occasion Id|Occasion|Name|Direction|Type|Value|Unit|Rate|Note|Status|Created|Updated`;
Value is in rupees or grams with its Unit beside it); older files restore with no gifts, a gift whose occasion is missing is skipped
and counted, and the cloud backup carries them because it uses the same CSV. Dev cleanup also empties both tables. Not built: the
occasion edit/rename/delete menu, a per-person view, a gold rate setting. Holdings are Assets (below).

**App menu** (`src/ui/AppDrawer.tsx`, `menuPages.ts`, `MenuButton.tsx`). On a phone (and a browser window narrower than 768px) a drawer
slides over the page from the left; the way to open it is the menu button at the top left of the Home tab's purple block
(`HomeView`, through `useOpenDrawer`; a plain white icon near the left edge like a group's back button; the wallet circle is shown only where there is no drawer). It is **not** shown in a group's page, which keeps its back
arrow and options button, and swiping from the edge is off on purpose (`swipeEnabled={false}`). Items, in order, from `MENU_PAGES`:
Home, Transactions, Groups, Charts, Assets, Gifts, Gold & Silver Rates, Train alarms, Config, How it works; a wide browser window shows the same list in the permanent
`Sidebar`, so a page is added in one place. **Look:** a purple gradient header with the logo and name, then a white list of flat full-width rows (`MenuButton`: icon and label, and for the current page a light purple background with a purple bar at its left edge); the browser's `Sidebar` adds an "Add" section below a divider. It was first white pill buttons on the gradient, which looked like cards and was replaced. **No bottom bar and no tab navigators.** An earlier version had `js-tabs` layouts for Home/Transactions/Charts/Config (`(tabs)/_layout.tsx`) and for a group's pages (`groups/[id]/_layout.tsx`); with the bar gone they only caused a different, un-animated switch from the stack screens (Assets, Gifts, Groups), so both layouts were deleted and the pages moved up into the root stack (`src/app/index.tsx`, `transactions.tsx`, `charts.tsx`, `config.tsx`; `groups/[id]/index.tsx`, `transactions.tsx`, `charts.tsx`). Addresses did not change (a folder in parentheses never was part of them). Each of those pages is wrapped in `WithAddButton` (`src/ui/AddMenu.tsx`): a full-page, touch-through layer holding `AddMenu align="right"`, so the + button floats at the bottom right over the page, slides with it, and opens Credit, Debit, Import and Add list (it reads the group from the address, `groupIdFromPath`, so on a group page it adds to that group). The layer must fill the page so the button is inside its parent's bounds (iOS ignores touches outside them). **Only Home has the menu button** (its purple block); every other page, including Transactions, Charts, Config, Assets and Gifts, has a back arrow (`useGoBack`: the page before, or Home; Transactions, Charts and Config use `useTabBack`, which gives no arrow in a wide browser window where the Sidebar is), so switching pages means going back to Home and opening the menu again. The exception is a group, whose pages are reached only through the drawer: the Overview's bar and `GroupHeader` show the menu button beside the options button, and the drawer there lists the group's pages. **Inside a group the drawer lists that group's pages** (`groupMenuPages`: Overview, Transactions, Charts, Groups, Main; the same list as the browser's `Sidebar`; the group is read from the address with `groupIdFromPath`), everywhere else it lists `MENU_PAGES`. The pages' lists end with `useAddClearance()` of space (button height, gaps and bottom inset) so the last row is not under the button; it is 0 in a wide browser window. **How it is built:** `AppDrawer` wraps the root
`Stack` in `_layout.tsx` and renders `Drawer` from `react-native-drawer-layout` (4.2.12), the same panel Expo Router's `expo-router/drawer`
navigator is made of. The navigator itself was not used: it shows only the screens declared in its layout, so using it would have meant
moving every route file under a new group folder, and the menu items here are plain links (`router.navigate`) that need no navigator.
`react-native-drawer-layout`, `react-native-reanimated`, `react-native-worklets` and `react-native-gesture-handler` are therefore
dependencies (added with `npx expo install`; they are native modules, which Expo Go includes). The `Drawer` brings its own
`GestureHandlerRootView`; if a future screen uses gestures outside the drawer it needs its own.

**Assets** (schema version 12; `src/domain/assets.ts`, `src/db/assets.ts`). What the owner holds: gold, land, mutual funds and other,
kept **for information only** in one table `assets` (nothing in `transactions`, no group, no balance or total, never seen by the categoriser, and no valuation; Ask AI can read it through the Assets capability:
there is `invested_paise` but deliberately no current value, because there is no API for gold, MF or NPS holdings and the owner reads
those off the bank or provider). Columns: `type` gold|land|mutual_fund|other, `name`, `quantity` (**thousandths** of `unit`: milligrams for
gold, so 2.25 g = 2250, and 482.351 fund units = 482351) with `unit` g|units|cent|acre|sqft|ground (gold is always g, a fund always
units, land chooses, other has none), `purity_k` (gold), `invested_paise`, `acquired_date`, `description` (free text; it replaces source,
location, reference and note), `gift_id`, `status` ACTIVE|SOLD|DELETED (no sold date or price), and the pledge. **Pledged gold
("adagu") is columns on the same row, not a second table, and keeps no history**: a gold row is pledged when `lender` is filled
(`isPledged`), and the whole row is pledged; each physical piece is its own row so a piece is never part pledged. The other pledge
fields `ticket_no`, `pledged_date`, `due_date`, `loan_paise` and `pledge_note` (one purpose/note field) are optional; there is no
interest rate or calculation. Setting Pledged to No clears them all (`normaliseAsset`, used by the form, the db layer and the backup
reader). The loan is not a transaction. Screens: `src/app/assets.tsx` (flat cards, `AssetRow`; search, a Type dropdown and a Show
dropdown Holding/Pledged/Sold/All; no totals line), `asset.tsx` (add/edit; every choice is a dropdown; for gold a Pledged dropdown
reveals Lender (required), Ticket, Pledged on, Due on, Loan and Purpose or note), and the Assets item of the app menu (see **App menu**). **Add to assets** on a gold gift received in grams (`canAddToAssets`) opens `asset.tsx?fromGift=`, filled by `draftFromGift`;
`assets.gift_id` makes it add at most once (`saveAsset` returns the existing asset for a gift that has one, and the form opens it, and
the gift shows "In your assets"). Save buttons also take a `useRef` guard so a double tap cannot save twice. Backup version 4 adds one
block after the gifts (`Assets Id|Type|Name|Quantity|Unit|Purity|Invested|Acquired|Description|Gift Id|Lender|Ticket|Pledged On|Due On|Loan|Pledge Note|Status|Created|Updated`);
older files restore with no assets and the cloud backup carries them. Dev cleanup also empties the table. Not built: valuation, interest,
a gold total line, photos, partial pledges.

**Assets: For, Item and exchanges with a shop** (schema version 18; `src/domain/assets.ts`, `src/domain/assetExchanges.ts`, `src/db/assetSql.ts`, `src/db/assetOptions.ts`, `src/db/assetExchanges.ts`). The owner named pieces by typing
"Thishi - Bangles" (a child's name and the kind of jewellery), so the typed name was replaced by two dropdowns: **For** (whom it is for; optional) and **Item** (what it is; required; the form calls it
"Item", not "Type", because Type already means gold, land or fund). Both lists are the owner's own, in `asset_options (kind, name, sort)` (`kind` is a named CHECK), and a name typed through "+ Add new" is added on
save (`canonicalOption`, which also keeps the list's spelling when only the capitals differ). `assets` gains `for_name`, `item` and `exchange_id`; **the `name` column stays** and is always written as "For - Item"
(`assetName`, in `normaliseAsset`), so older files, the backup and anything that reads a name keep working; it is never typed. No CHECK of `assets` changed, so it was not rebuilt (the status check stays unnamed; the
rule for a rebuild is in AGENTS.md). **Migration** (`migrateAssetsV18`, tested against a real SQLite in `tests/db/assetSql.test.ts` with the owner's own names): only when `item` is missing, the columns are added
and every name is split once by `deriveForAndItem`: "For - Item" (dash, hyphen or en dash) splits at the first dash; a name without one is checked against the For names seen on the dashed rows (longest first), so
"Thishi Ear Ring" becomes For Thishi, Item Ear Ring; anything else is all Item ("Thishika", "Anklet") for the owner to correct. The old name is untouched and the lists are filled from the result; running it again
changes nothing. The same split reads a backup made before this (`fillLegacyNames`). **Filters**: `AssetFilters` has `forName` and `item` (exact, ignoring capitals) beside Type, Show and search; Show gains **Given in exchange**.

**Exchanges with a shop.** Old gold given to a shop and new gold bought in its place. `asset_exchanges (id, exchange_date, shop, extra_paise, note, status ACTIVE|DELETED)` and `assets.exchange_id`. **A piece given has status
`SOLD` and the exchange's id** (so the CHECK on `assets.status` did not have to change); a plain sale is `SOLD` without one (`isGivenInExchange`); **a piece bought is an ordinary held asset with the same id**, added through
`asset.tsx?exchange=<id>` (gold, bought on the exchange's date; "Save & next" adds several). `giveInExchange` (`src/db/assetSql.ts`) checks every piece first, **gold that is held and not pledged** (`canGiveInExchange`), and
refuses with the piece's name, so nothing is half done; then it records the exchange and marks the pieces, in one transaction. `undoExchangeSql` holds the given pieces again, keeps the bought ones as ordinary assets,
and marks the record DELETED. Screens: `asset-exchange.tsx` (choose the pieces, filtered by For; shop, date, extra, note; Save, or Save & add bought) and `asset-exchanges.tsx` (the history, newest first: what was given
and bought with grams on each side, `exchangeWeights`, whether more or less gold came back, the extra paid, Add bought piece, Undo); a piece given cannot have its status edited on the form. Nothing here is a
transaction or touches a balance, and no gold rate or value is used: only grams. **Backup version 7** adds `Assets For | Assets Item | Assets Exchange Id` at the end of the Assets block (so an older reader still lines
up), the lists (`Asset For List`, `Asset Item List`) and the exchanges block (`Exchanges Id|Date|Shop|Extra|Note|Status|Created|Updated`), all read by header name; a version 6 file restores with its names split and
the lists made from the pieces, and exchanges and lists merge on restore like everything else. **Ask AI**: the Assets capability filters by `for`, `item` and `show: exchanged`, totals by person or item
(`groupBy`), and has `asset_exchanges` (what was given and bought, the grams, more or less, extra paid).

**Gold & Silver Rates** (menu page `/rates`; `src/app/rates.tsx`, `src/ui/MetalRates.tsx`, `src/domain/metalRates.ts`, `src/rates/ibjaApi.ts`,
`src/settings/metalRatesCache.ts`). Today's IBJA benchmark rates for daily viewing; **not connected** to Assets, Gifts or the pledge tracker, not on Home.
- **Source:** an open-source IBJA scraper API (no key). `IBJA_BASE_URL` in `src/rates/ibjaApi.ts` is the only place its address is written; point it at
  your own deployment to switch (same `/latest`, `/silver/latest` and `/history` shapes). Nothing is fetched at launch or in the background: only when
  the page is focused and its cache is over an hour old (`CACHE_MAX_AGE_MS`), and on pull-to-refresh (a Refresh button on web, which has no pull). The
  three requests run together, each cut off after 10 seconds (`fetchRateParts`, which never throws).
- **Gold** comes from `/latest` (per 10 g, AM and PM; the page shows 999 and 916, the 995 figures are still read and cached but not shown); **silver** from `/silver/latest` (per kg). When either is missing, 404 (the API's
  answer before the day's rates are out) or fails, the newest day of `/history` stands in; the page marks a rate whose date is not today as "Previous day's
  rate". `/history` holds only the last four published days (no weekends) and ignores `limit`/`days`; it also feeds the table of the last few days with
  the change from the day before (computed here from the rates, not from the API's `/changes`, whose answer was empty and of unknown shape).
- **Layout:** the IBJA gold (24K 999, 22K 916) and silver cards share one row (narrow cards, amounts shrink to fit; `RateCard`/`CardRow` in `src/ui/MetalRates.tsx`);
  a metal with no rate shows "—". One date line when gold and silver share a day, otherwise one each.
- **Per gram** is the quoted figure ÷ 10 (gold) or ÷ 1000 (silver); gold per 8 g is × 0.8. PM is the "current" rate once out, otherwise AM, and the card says which. The cards show only that one rate; AM and PM side by side are only in the "Last few days" table (AM/PM toggle).
- **Cache:** the last complete answer and its fetch time, as JSON in `plainStorage` (`metal_rates_cache`, ~1.5 KB). It is replaced only by a complete picture
  (`/history` came back, or both `/latest` answers did), so a half answer never wipes a metal. With no network the cache stays and the page says
  "Couldn't refresh — showing rates from <time>".
- **Nagercoil section** (at the top of the page, then the Tamil Nadu estimate line, then an "IBJA benchmark" heading and the IBJA cards): the real local 22K and 24K price per gram and a table of the last ~10 days with the change from the
  day before, from the owner's own backend (`GET /api/gold-history` on the forked IBJA-API deployment, which scrapes Groww's Nagercoil page once a day
  and stores it). `src/rates/goldHistoryApi.ts` (`fetchGoldHistory`), `src/domain/goldHistory.ts` (parsing, table rows), `PerGramRow` and
  `NagercoilTable` in `src/ui/MetalRates.tsx`. That route does not exist on the public instance and answers 401 without the key, so the section
  needs `EXPO_PUBLIC_IBJA_BASE_URL` and `EXPO_PUBLIC_IBJA_API_KEY` in `.env` (see `.env.example`; the key is sent to your own deployment only, never
  to the public one, and is bundled into the app, so use a key made for this app). Without them it reads "not available right now". Asked each time
  the page is opened and on pull-to-refresh (and the web Refresh button), not cached on the phone; a failed fetch keeps what was shown.
- **Tamil Nadu 22K estimate** (the line right after the Nagercoil section): `calculateTodayPrice` in `src/domain/tnGoldEstimate.ts` =
  `round(ounce price in ₹ / 31.1035 × 0.916 × 1.1648)`, where the ounce price is gold-api.com's `GET https://api.gold-api.com/price/XAU/INR`
  (`src/rates/goldApi.ts`; free, no key, sends CORS headers, `GOLD_API_BASE_URL`). The 1.1648 premium is the owner's own constant, not a published
  rate; the IBJA cards above are the benchmark to compare it with (on 4 Nov 2026 it gave ₹12,803 against IBJA's 22K ₹12,602 for 3 Nov). It is fetched
  each time the page is opened (not on pull-to-refresh, not cached); a failure keeps the last figure or shows "unavailable".
- **Platforms:** the IBJA API sends no CORS headers, so the **web build probably cannot load it** (the page says so); iOS is the target; Android uses the same
  `fetch` and is untested. **Not verified (nothing was run):** the page on a phone, the live API's success shapes beyond what was read from it on 4 Nov 2026,
  and whether the web build is blocked.

**Train alarms** (schema version 13, reshaped in 14 and 15, cleaned up in 16; `src/domain/trainAlarms.ts`, `src/db/trainJourneys.ts`, `src/alarms/`). The owner books
trains on the day booking opens, so a saved journey date produces alarms that wake them for it. Information only, like Gifts and Assets:
table `train_journeys` (`label`, `journey_date`, `advance` 0|1, `tatkal` none|ac|non_ac, `alarm_times`, `note`, `booked`, `pnr`, `status`), nothing in
`transactions`, no group, no server (Ask AI can read it through the Train journeys capability). A journey has **one booking**, a single dropdown: **Advance booking** (opens 60 days before the journey date,
8:00 AM), **Tatkal AC** (1 day before, 10:00 AM) or **Tatkal Non AC** (1 day before, 11:00 AM); `BOOKINGS` holds these and their default alarm times, which are
the owner's to confirm. The old `advance` and `tatkal` columns are kept and mapped to that one choice (`bookingFromColumns` / `bookingToColumns`; a row
that had both reads as advance); version 14 added them, version 15 added `alarm_times` (`HH:MM` joined by commas, empty = the booking's defaults), and version 16 drops the
`rule` (2-month option, version 13) and `wake_lead_min` (version 14) columns from a database that still has them (`ALTER TABLE ... DROP COLUMN`, each in its own
try so a failure only leaves an unused column; `advance` and `tatkal` stay because they hold the booking choice). **The journey date starts empty** on the add form so it is clear what to
fill in, and the bottom of the form (`describeSchedule`, tested) says in words when booking opens (with the weekday and "60 days" / "1 day before your
journey date") and on which day and at what times the owner is woken. **The alarm times are free-form and per journey**: a list edited with a time wheel
(`AlarmTimesField`, `TimePicker`; the browser's `<input type="time">` on web), 1 to `MAX_ALARMS` = 8, defaults 7:45, 7:55, 7:58, 8:00 (advance), 9:45, 9:55, 9:58,
10:00 (Tatkal AC), 10:45, 10:55, 10:58, 11:00 (Tatkal Non AC) because the owner forgets a single alarm; the owner's message listed the Tatkal last times as 9:00
and 10:00 and they were read as 10:00 and 11:00. Choosing another booking type replaces the times with that booking's defaults. Alarms are numbered `a0..a7` in time
order and their AlarmKit ids come from journey id and that number (`alarmUuid`), so editing the list cancels and replaces them (the sync cancels all eight ids and
the ids earlier builds used, `LEGACY_ALARM_KINDS`). Two **notifications** are always added: **8 PM the evening before** and **7:00 AM on the booking day**. Alarms already in
the past are left out. **Duplicate** (button on an existing journey, `/train-journey?copy=<id>`) opens a new journey with everything copied except the date, which the owner
picks. **The journeys in SQLite are the source of truth; the alarms in iOS are rebuilt from them** by `syncTrainAlarms` (`src/alarms/sync.ts`) at every launch
(`_layout.tsx`, never prompting) and after every save or delete (`ask: true`, which may prompt for permission), so it is safe to run any number of times. Two ways to
ring, chosen at run time:
- **AlarmKit** (iOS 26): a real system alarm, rings through the silent switch and Focus with the app closed. It comes from the
  `expo-alarm-kit` native module (not in Expo Go), looked up with `requireOptionalNativeModule` in `src/alarms/alarmKit.ts` rather than
  imported, so Expo Go and the web build fall back instead of crashing. Reasons for this module and not `react-native-alarm-scheduler`: the
  scheduler only schedules "the next 7:30", not an exact date 60 days away (it passes hour and minute to AlarmKit, not a date);
  `expo-alarm-kit` uses `Alarm.Schedule.fixed(date)`. Its `configure(appGroup)` is never called (it only keeps a list of ids in an App
  Group, which a free Apple ID cannot sign); the app derives each alarm's UUID from journey id and kind (`alarmUuid`, sha256), so it can
  cancel or replace an alarm without storing anything. The module's pod needs iOS 26.1, so `app.json` has `ios.deploymentTarget` 26.1
  and `NSAlarmKitUsageDescription`. The "AlarmKit allowed" answer is remembered in plain storage (`train_alarmkit_ok`) so a launch never
  prompts; if iOS later refuses every alarm the flag is dropped and notifications take over.
- **Local notifications** (`expo-notifications`): the fallback in Expo Go, or when AlarmKit is denied. Each alarm is
  repeated a minute apart (`ALARM_CHAIN` = 3 copies each) because one notification is easy to sleep through; the two reminders are always
  notifications, with AlarmKit too; only the soonest 60 are kept since iOS keeps
  at most 64 pending (`capNotifications`). `interruptionLevel: "timeSensitive"` is set, but the time-sensitive entitlement is **not**
  added (a free Apple ID may not be able to sign it), so iOS probably treats them as normal notifications. The `expo-notifications`
  plugin has `enableRemoteNotifications: false` for the same reason (no push entitlement; nothing is pushed).
The owner installs through AltStore with a free Apple ID (`npm run ipa`); such an app must be refreshed every 7 days, and it is **not known**
whether already-scheduled AlarmKit alarms survive a refresh or reinstall. Config > Train alarms has "Test alarm in 1 minute" to check the
mechanism on the phone. **Not verified (nothing was run):** the Swift module compiling against the iOS 26 SDK with Expo 58, AlarmKit
accepting an alarm weeks ahead, the permission prompt, the free-account signing of the new capabilities, and the screens. **Backup:** Export and Cloud backup carry the journeys that are still ahead (backup version 5, a "Journeys Id | Label | Date | Booking | Alarm Times | Note | Created" block after Assets; one whose date has passed is left out, on the way out and on the way in, and a journey deleted on a phone stays deleted there). After an Import or a cloud restore that added journeys the alarms are rebuilt at once (`syncTrainAlarms({ ask: true })`). **Errors are shown, not swallowed:** `scheduleAlarmKit` and `scheduleNotification` return the reason they failed, `syncTrainAlarms` collects the first few in `SyncResult.errors`, and the message after a save (`describeSyncOutcome`, tested) says how many could not be set and why; saving the journey and setting its alarms are separate steps, so a failed alarm step never leaves the form open for a second Save to add the same journey again. **Not built:**
a server-side backup alarm (Pushover
emergency priority or a phone call from the Cloudflare Worker, designed but dropped for now), and a "booking opened" follow-up. The 60 days and the Tatkal
hours are the owner's to confirm. The owner has since run the Test alarm on the phone: the AlarmKit alarm rang.

**Marks and warning on a journey (there is no separate list screen):** when something is not set, the journey in the Train list shows a warning under it (`droppedText`: what is not set and to open it and tap Update, which sets everything again) and the journey screen shows the same warning; **the Home page has a warning too** (`src/ui/TrainAlarmBar.tsx`): it checks (read only, `loadCheckList`) when Home is shown and each time the app comes back to the front, after the start-up sync has finished (`src/alarms/startup.ts`, `runStartupSync` from the root layout, so it never warns about what the start-up is about to set; the wait is capped at ten seconds), shows how many are not set, opens the Train page when tapped, and has a Set again button. It never sets anything on its own: setting an alarm again cancels it first, which must not hit one that is ringing. The top of the Train list also has **one warning with a count and one button** ("Set the N missing again") that runs `syncTrainAlarms({ ask: true })` for every journey, then checks again; the journey screen (`src/app/train-journey.tsx`) shows the same check or cross beside each alarm time (`AlarmTimesField`'s `marks`), from `loadCheckList` (`src/alarms/check.ts`, shared by both pages) and `alarmTimeMarks`; the Train list (`TrainRow`'s `marks`) shows it beside each time too, so the owner never has to match a separate list by hand; iPhone only (`MARKS_SUPPORTED`), and a time with no saved alarm shows none.

**How the check is made** (`buildCheckList`, `triggerToDate`, `parseSetAlarms`, `parseNotificationId` in `src/domain/trainAlarms.ts`, tested). **Each row is one alarm or reminder from the app's own records, with one
mark: a check when iOS holds it, a cross when it does not.** The rows are what the saved journeys call for (`planAlarms`: each wake-up alarm and the two reminders of every journey that is not booked and not over), soonest first, so at any time the owner sees what the app
should have set and whether it is scheduled to run. `buildCheckList` asks iOS about each row: a **reminder** is held when its notification identifier (`train-<journey>-<kind>-0`) is pending, with the time from the trigger (`triggerToDate` accepts a number in
ms or s and calendar date parts, since iOS gives it back in more than one shape; an unreadable time does not count against it); a **wake-up alarm** is held when AlarmKit has the alarm under its UUID (`alarmUuid`, compared in lower case because Swift writes UUIDs in capitals) or,
without AlarmKit, when its run of notifications is all pending; **a time more than 90 seconds off the plan is stale** and shows a cross until the alarms are set again. Real alarms are read through `AlarmManager.shared.alarms`, which Apple documents as the alarms **that belong to
the current client**, so it only ever holds this app's alarms. `expo-alarm-kit` does not expose it (its `getAllAlarms` reads an App Group list this app never configures: a free Apple account cannot sign App Groups), so a small **inline Expo module of ours,
`app-intents/TrainAlarmReader.swift`** (a `Module` named `TrainAlarmReader`, function `getScheduledAlarms`; the file name equals the class name, as inline modules require, and `app-intents/` is already a watched directory), returns each alarm's UUID, state and fixed time, and
`readScheduledAlarms` (`src/alarms/alarmKit.ts`) calls it through `requireOptionalNativeModule`, so a build made before the module existed gets `null` instead of an error. The AlarmKit calls were type-checked against the iOS 26.2 SDK with a scratch file (`swiftc -typecheck`); the module
itself, which needs ExpoModulesCore, was not compiled here. An alarm iOS holds that matches no journey (one that was booked, moved or deleted) is counted in `unlinked`; saving or opening the app cancels it, as every sync cancels what is not wanted. The record `train_alarms_set` (plain
storage, written by `syncTrainAlarms`: id, journey, kind, time, title, via, of what iOS accepted) is only the fallback: **in a build without the reader, a real alarm counts as set when the record says iOS accepted it**, and the pages cannot tell the difference; the same fallback covers reminders when
iOS's list cannot be read. iPhone only: Android and web say so (the project's platform rule). **The reader is native code, so it needs a new build (`npm run ipa`) and a reinstall; an over-the-air update publishes the screen and the fallback, and the Swift file is not part of the
compatibility fingerprint, so the installed build keeps receiving updates.**

**Booked and the PNR** (schema version 19; `JourneyFields.booked` and `pnr`, `validatePnr`, `normalisePnr`, `describeBooked` in `src/domain/trainAlarms.ts`). A flag on each journey: once the ticket is booked the owner sets
**Booked** to Yes (a dropdown, like Pledged on an asset) and may type the **PNR**, optional, 10 digits (spaces and hyphens ignored; anything else blocks Save with "A PNR has 10 digits"). **Booked can be set to Yes only once booking has opened** (`canMarkBooked`: `bookingOpensAt <= now`, so an advance journey 72 days away stays not booked until day 60 at 8:00 AM, Tatkal from the day before at 10:00 / 11:00); before that the dropdown is disabled and `bookedLockedText` says when it opens. The form uses the effective value (`booked && canMarkBooked`), so changing the date or the booking type back to one that has not opened also clears it, and `saveJourney` applies the same rule where the row is written. **Booked can be set to Yes only once booking has opened** (`canMarkBooked`: `bookingOpensAt <= now`, so an advance journey 72 days away stays not booked until day 60 at 8:00 AM, and Tatkal can be booked from the day before at 10:00 / 11:00); before that the dropdown is disabled and `bookedLockedText` says when it opens. The form uses the effective value (`booked && canMarkBooked`), so changing the date or the booking type to one that has not opened also clears it, and `saveJourney` applies the same rule where the row is written. **A booked journey
sets no alarms**: the alarms exist only to wake the owner for booking, so `planAlarms` skips it and the next `syncTrainAlarms` cancels what was set; setting Booked back to No brings them back. The form hides the alarm
times for a booked journey and does not check them; the list has a **Show** dropdown (`TRAIN_SHOWS`, `filterJourneys`: All, Not booked yet = still ahead and unbooked, Booked = every booked journey, over or not); a journey that is not booked can have its **Booking changed to Tatkal AC / Non AC** at any time (the form's Booking dropdown), which re-plans the alarms for the day before, and `advanceMissed` makes the form say so when the advance booking has already opened without a ticket (tested in `tests/domain/trainAlarms.test.ts`); the PNR is kept only while booked (`normalisePnr`); `TrainRow` shows "Booked" and the PNR in place of the alarm times; Duplicate starts not booked. Columns
`booked INTEGER NOT NULL DEFAULT 0` and `pnr TEXT` (`TRAIN_COLUMNS_V19`, tested against a real SQLite in `tests/db/trainJourneySql.test.ts`: journeys saved before it are not booked, nothing else changes). **Backup version 8** adds
`Journeys Booked` (Yes or empty) and `Journeys PNR` at the end of the journeys block; a file without them restores every journey as not booked, and a PNR that is not 10 digits is dropped on the way in. **Ask AI**:
`train_journeys` returns `booked`, the PNR and the status "Booked · PNR …", takes `booked: yes|no`, and leaves out the alarms of a booked journey.


**Bank SMS** (Config > "Bank SMS (automatic)", `src/ui/SmsCaptureSection.tsx`; no schema change). iOS gives apps no access to messages or to other apps'
notifications, so the app publishes its own **Shortcuts action, "Add bank SMS"** (`app-intents/AddBankSmsIntent.swift`: a Swift `AppIntent` with one
`Message` text parameter, compiled into the app target by Expo's `expo-app-intents` inline-module setup; `app-intents/AppIntentsSetup.swift` is the
package's required setup module and must not be renamed). The owner's automation is "When I get a message containing <bank words>" (Message trigger,
Run Immediately) -> Create New Shortcut -> "Add bank SMS" with the Shortcut Input as the message; the steps are written on that screen.
`perform()` calls `AppIntentDispatcher.shared.dispatch(name: "addBankSms", params: ["text": ...])`, which writes the invocation to native storage
(`UserDefaults`, up to 100, the oldest dropped) and returns; **it starts no JavaScript and does not open the app** (`openAppWhenRun` is left at its
default, false), so the text waits until the app next starts or comes to the front. **No server is involved and the message text never leaves the
phone.** `src/import/phoneInbox.ts` reads the queue (`getPendingInvocationsAsync`), removes an entry after it is saved (`removePendingInvocationAsync`)
and listens for the action running while the app is open (`addAppIntentListener`); `_layout.tsx` runs `pullSms` (`src/import/smsCapture.ts`) at launch,
each time the app returns to the front and on that listener. `pullSms` runs one check at a time and once more if asked during a run (the action may
have fired after the queue was read). Delivery is at least once, which the UPI-number key makes harmless. Each message is read by `parseBankSms`
(`src/domain/smsParser.ts`, written from the ICICI wording; UPI messages only: it needs an amount, a debit/credit word and the 12-digit UPI number)
into a `ParsedTransaction` with **no narration, balance or note** and the key `upi:<ref>:<D|C>`, then goes through the **same `importParsed`** as a
statement: de-duplication against everything stored (a deleted entry stays deleted), AI categorisation in the owner's categories,
`createSqliteStore(group)`. The group is `resolveSmsGroupId` (`src/db/smsGroup.ts`): the group chosen on that screen while it is open, otherwise Main
(not the Home group). A message leaves the queue only after its payment is in the app. **A message that does not mention UPI at all (card, ATM,
balance, OTP) is skipped quietly** (`mentionsUpi`; `SmsPullResult.ignored`) and removed; one that mentions UPI but cannot be read is listed in Config
to Dismiss and raises the Home bar. **A payment is always saved, whether or not the AI works** (`classifyOrFallback`, `src/import/safeClassify.ts`):
with no AI key, no internet or a quota the entry goes into Others : Uncategorised with `classified_by = pending`, so Config > Re-classify picks it up
later and the owner never has to re-enter it. **The statement completes the entry:**
an SMS entry is recognised by being an import row with a UPI number but no balance and no narration (`smsKeys` in `src/db/transactions.ts`; no flag
column, so it also survives a restore); when a statement contains the same key, `enrich` fills in the balance, narration, VPA, note and bank, replaces
the payee only when the SMS's cut-short payee is the start of the statement's (a payee the owner typed over stays) and fills the description only when
empty. **The category is looked at again, because the UPI note categorises far better than the cut-short payee did:** the entries whose category the
AI chose (`classified_by` is not `manual`) are sent to the AI once more with the statement's row (`recategorise` in `importStatement.ts`), and a real
category replaces theirs (`recategorise` in the store, which re-checks `manual` in SQL); an answer of Others : Uncategorised, or a failed call, changes
nothing, and a category the owner chose is never touched. `ImportSummary.enriched` and `recategorised` count them. After a collection that added
entries `bumpDataVersion` (`src/import/dataVersion.ts`) makes Home and Transactions reload, since they otherwise load only when focused.

**Bank SMS: retries and the Home bar.** The collection stays silent: no pop-up, and nothing for new payments, for nothing new, or for entries saved
without a category (Re-classify handles those). A failed save is retried before it counts as a problem, with `withBackoff` (`src/domain/backoff.ts`,
the pause doubles): 3 tries (1, 2 s), each saving only the payments still missing (`pending`) and asking the database what is there, so a try that
failed half way is not repeated. When the tries run out, `describeSmsProblem` (`src/domain/smsProblem.ts`) makes one line from two causes (messages that
could not be saved, messages that could not be read), always ending with a pointer to importing the bank statement, and `reportSmsProblem`
(`src/import/smsProblemStore.ts`, in memory) shows it in `SmsProblemBar` at the top of Home. Tapping it opens Config with the Bank SMS section open
(`/config?open=sms&at=<time>`); the cross hides that line until the problem changes or the app is started again; the next good check clears it. An
unreadable message stays in the queue until dismissed in Config, so its bar returns at each start until then.

**Bank SMS history.** The first way was an iOS Shortcut posting each message to an inbox on the backup Worker (`POST /inbox/<token>`, a secret link,
unencrypted KV, retries with backoff, a "could not reach the server" error). It worked on the phone but depended on the network and had many ways to
fail, so once the App Intent route worked on the phone it was removed (the code is in git history, commit after `19a09a9`). The deployed Worker may
still answer `/inbox/...` until it is redeployed (`npx wrangler deploy`); stored messages expire after 14 days. Ruled out: a notification from a Shortcut
to the app (a Shortcut's notification belongs to the Shortcuts app), real push (needs a paid Apple account), opening the app by link on every SMS.
**Needs a native build** (`npm run ipa`, then AltStore), not an OTA update; the `expo-app-intents` package is alpha. If prebuild keeps the old
project, delete the generated `ios/` folder once. Verified on the owner's phone: the action appears in Shortcuts for a sideloaded build, Shortcut Input
is accepted for the Message parameter, and a payment was added. **Not verified:** a credit message (the wording is a guess), other banks, a phone that is
locked when the message arrives (the Expo docs do not say), and a build from a clean `ios/`.

**Transaction source** (schema version 17; `src/domain/transactionSource.ts`). Every transaction records how it **first** came in: `manual` (added by hand),
`import` (a bank statement import) or `sms` (the automatic bank SMS route, `createSqliteStore(group, "sms")`). Rows show it as a small label (Manual,
Statement, Bank SMS) in `TransactionRow`, the entry screen says "Added automatically from a bank SMS on <time>" (from `created_at`), and Transactions >
Filters has a Source filter (`applyFilters`). **The source is written once, in the INSERT, and is never updated**: no UPDATE in the code sets it; an
edit, a category change, a statement completing an SMS entry (`enrich`) or a re-classify leave it alone, so an entry the SMS route made stays "Bank SMS".
A **restore** (`INSERT OR IGNORE`) cannot change an existing row either; only a row that is new to this phone takes the Source column of the file
("Import", "Manual" or "Sms"; anything else is read as manual), and `BACKUP_VERSION` is 6 so an older app refuses such a file cleanly. **Existing
entries were not touched** (an SMS entry that a statement had already completed is not told apart from a statement entry, so it stays "import"). The
`source` CHECK had to change from `('import','manual')`. SQLite 3.53 (what expo-sqlite bundles) can drop and add a **named** CHECK in place (`ALTER TABLE ... DROP
CONSTRAINT` / `ADD CONSTRAINT`), but the CHECK in every database made before version 17 is **unnamed** and cannot be dropped that way, so the version 17
migration **rebuilds the `transactions` table** once (`REBUILD_TRANSACTIONS` in `src/db/schemaSql.ts`, run only when `needsTransactionsRebuild` finds the stored CREATE statement lacking
the three names): the same table definition is used for new databases and for the rebuild, rows are copied column for column in rowid order, and the indexes are
recreated. **The definition names all three checks on this table (`source_check`, `status_check`, `direction_check`), so the next change to any of them is two ALTER statements, not another rebuild** (older SQLite, below 3.53,
cannot do that). `tests/db/schemaSql.test.ts` runs that SQL
against Node's own SQLite. **Not run on a device**: the first launch after the update performs the rebuild, so take a backup first. To judge the
automatic route, filter Source = Statement for dates after it was set up: those are payments it did not capture. Related: the statement import's
`smsKeys` looks for rows with source `import` or `sms` that still lack a balance and narration.

**Over-the-air updates (EAS Update, no Apple account).** The owner installs through AltStore with a free Apple ID, and reinstalling for every
JavaScript-only change was flaky, so the app has `expo-updates`. EAS Update only hosts the JS bundle (a free Expo account); EAS *Build* for
iOS needs the paid Apple program, so builds stay local (`npm run ipa`). `app.json`: `runtimeVersion.policy = "fingerprint"` (an update only
applies to an install with the same native code, so a native change cannot receive JS that expects it; `/ios` is gitignored, so it is not
part of the fingerprint), `updates.requestHeaders["expo-channel-name"] = "production"` (the channel for a build that is not made by EAS
Build; docs.expo.dev "Get started with EAS Update"), `checkAutomatically` ON_LOAD, `fallbackToCacheTimeout` 0 (launch never waits on the
network; a downloaded update is used from the next launch). **`updates.url` and `extra.eas.projectId` are deliberately absent until the owner runs
`npx eas-cli@latest update:configure` (it needs their login), so until then updates stay off.** Publish with `npm run update`. Config > App
updates (`src/ui/AppUpdateSection.tsx`) checks, downloads and restarts on demand, and says so in Expo Go, dev builds and the browser, where
`Updates.isEnabled` is false. It does not fix the 7-day signing refresh. `.env` is not tracked in git (`.env.example` is the template). The bundle takes
`EXPO_PUBLIC_BACKUP_URL` from the `.env` of the machine that runs `eas update` (the owner has seen this work), or from the environment variable a
CI job sets before building; if cloud backup says "not set up" after an update, the value was missing where the bundle was built. Not verified: any of this on the phone, `eas update` itself, and the fingerprint matching between `npm run ipa` and `eas update`.

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
(menu drawer and + button) as a centred column of at most 480px; from 768px up the + button
is hidden (`AddMenu` returns null) and `src/ui/Sidebar.tsx` shows the permanent left drawer
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

### Cloud backup (Config > Cloud backup and restore)

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
- **Nothing is scheduled, and there is no on/off switch.** The first "Back up to cloud" on a phone makes the
  recovery code (`ensureRecoveryCode`), shows it, then uploads; after that the button reads "Back up now".
  "Show recovery code" can be pressed any time on the phone that made it (it is read from the Keychain).
- **Restore is the same merge as Import** (`restoreBackup`): it never changes what is on the phone, and it
  always asks for the recovery code, even when the phone has one. The typed code is only used to read that copy;
  it is never saved and never replaces the phone's own code. A phone with no code of its own makes a new one on
  its first backup, so a second phone that restored from the first gets its own entry (the restored data plus
  its own) and the first copy stays exactly as it was: the phones then back up independently. Trade-off: after
  replacing a lost phone, the new phone has a new code and the old copy stays as a frozen snapshot (nothing
  expires, and only the code that made it can delete it). Delete removes this phone's own server copy. There is
  deliberately no "forget the code" action.
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
- **Expo Router 58 no longer ships React Navigation.** (The app no longer uses tabs; if one is ever added, import `Tabs` and the
  `BottomTabBarProps` type from `expo-router/js-tabs`; importing `Tabs` from
  `expo-router` is deprecated). A custom bar receives `state` and
  `navigateToTab(routeKey)`, not a `navigation` object.
- **Keep `slug` as `csk-manager` and `ios.bundleIdentifier` as `com.sathish.cskmanager` in `app.json`.** Expo Go stores app data
  per slug, and an AltStore install is keyed by the bundle id; changing either makes existing data look lost (a second, empty app).
  Both were renamed once, when the app became CSK Manager, a personal all-purpose app that started as an expense manager (slug was
  `ai-expense-manager`, bundle id `com.sathish.aiexpensemanager`, URL scheme `expensemanager`, now `cskmanager`). That install was a
  new app; the owner moved data with Export and Import. **Names that were left on purpose:** the `expense-manager ...` strings that
  derive the cloud-backup id and key and the web key (`src/domain/cloudBackup.ts`, `src/platform/secureStorage.web.ts`; they are
  key-derivation labels, not names, and changing one makes every existing cloud backup and saved key unreadable). A JSON backup
  written by the first version under the old format name `expense-manager-backup` still restores (`LEGACY_BACKUP_FORMAT` in
  `src/domain/backup.ts`). The backup Worker was renamed `csk-manager-backup` in `wrangler.toml`; it gets a new address when next
  deployed (`npx wrangler deploy`) and keeps its data because it is bound to the same KV namespace id, so `EXPO_PUBLIC_BACKUP_URL`
  in `.env` must be changed to the new address (the old Worker keeps answering until it is deleted). After a rename, delete the
  generated `ios/` folder once before `npm run ipa` (it is gitignored; prebuild otherwise keeps the old project beside the new one).
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

- **The update compatibility ID (runtime version) is a fingerprint of the project's native inputs, and `.gitignore` is one of them** (`bareGitIgnore`, as
  well as `package.json` dependencies, the Expo config and the icon). Editing `.gitignore` changed the ID, so two updates were published that the phone's
  installed build (built before the edit) silently never accepted ("Check for updates" said up to date). Before `npm run update`, compare
  `npx expo-updates fingerprint:generate --platform ios` with the `EXUpdates.bundle/fingerprint` file inside the installed IPA; they must match, or the
  change needs a new `npm run ipa` and reinstall. `.gitignore` is therefore left alone between builds.
  The `scripts` in `package.json` are inputs too. `npm run update` used to pass `--environment production`, which makes EAS ignore the local `.env`
  (the bundle then had no `EXPO_PUBLIC_BACKUP_URL`: Cloud backup said "not set up"); the flag was removed, and `.env` was
  added back to `.gitignore`, together with the build that added `expo-app-intents` (any change like these needs a rebuild to stay compatible).

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
- **Name every CHECK constraint.** An unnamed `CHECK (...)` cannot be dropped in place (SQLite 3.53 only drops and adds *named* ones), so widening it forces a
  table rebuild, as for `transactions.source` in schema version 17. Write `CONSTRAINT <name> CHECK (...)` in every new column or table; see `AGENTS.md`.
  Whenever a table has to be rebuilt for any reason, name **every** CHECK on it in the new definition (not only the changed one), so its next change is an ALTER.
  The gifts, assets, train journeys and groups tables still have unnamed checks and are left alone until one of them is rebuilt anyway.
- **Platforms: iOS, Android and web, each named.** The app runs on iOS today and has a web build; **Android is planned** (`app.json` already lists an
  `android` block). Every `Platform.OS` or `Platform.select` branch must handle `ios`, `android` and `web` explicitly, and must not use `!== "web"` (or
  `=== "ios"` with everything else falling through) as a stand-in for "a phone". Where a feature is not built for a platform yet, say so on screen rather
  than falling through to another platform's behaviour. Bank SMS is the example: iOS uses a Shortcut and the app's "Add bank SMS" action; **Android will
  read the messages on the phone itself (an SMS permission and a receiver, not Shortcuts), so it needs its own implementation** behind the same
  parser and import pipeline (`parseBankSms`, `importParsed`); web has no messages. Known spots that still treat Android like iOS: `HelpSection.tsx`
  picks `"web"` or `"ios"` help text only, and `alarms/alarmKit.ts` is iOS-only by design (AlarmKit).

(The same rules are in `AGENTS.md`, which coding agents read first.)
