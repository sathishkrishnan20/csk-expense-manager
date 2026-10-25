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
| App | Expo SDK 58, React Native 0.88, TypeScript, iOS only |
| Navigation | Expo Router 58. Tabs come from `expo-router/js-tabs` with a custom `tabBar`; Add/Edit and Import are root-stack screens above the tabs |
| Look | Theme values copied from the web app (`src/ui/theme.ts`): primary `#7F3DFF`, gradient `#9061ed` to `#5d3ba2`, income `#00A86B`, expense `#FD3C4A`, Roboto, Georgia for the Home numbers, MUI-style outlined fields and bottom bar |
| Storage | `expo-sqlite`, file `expenses.db`, schema version 2 |
| Money | Integer paise; `amount_paise` is always positive and `direction` says which way |
| API key | `expo-secure-store` (iOS Keychain) |
| LLM | Gemini (default, `gemini-3.5-flash-lite`) or Claude (`claude-haiku-5-5`), chosen in Config. Model ids live in `src/llm/providers.ts` |
| Charts | `react-native-gifted-charts` |

Layout: `src/domain` (categories, parser, formatting; pure), `src/llm`, `src/import`,
`src/db`, `src/settings`, `src/ui` (shared components), `src/app` (routes).
Everything under `domain`, `llm`, and `import` (except `services.ts`) is plain
TypeScript with unit tests that run under Node.

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
and payment modes. Renaming also updates existing transactions; deleting leaves
existing transactions with their old label.

**Fallback.** `Others : Uncategorised` is always present and cannot be renamed or
deleted. `Income` cannot be renamed or deleted (income logic keys off it). The model
may only choose categories that exist now; answers are validated case-insensitively.
A known category with an unknown subcategory falls to that category's own
"Others"/"Other", otherwise to the fallback. Credits are classified only into
`Income` subcategories, falling back to `Income : Others`.

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
statement again does not bring a deleted row back. Deleted rows are excluded from
lists, totals and charts.

**Migration.** `PRAGMA user_version` 2. Data from the first release (single table,
old built-in categories) is carried over: rows become `Others : Uncategorised`
(credits `Income : Others`), `classified_by = 'migrated'`, ready for re-classify.

**Export and import of all data** (Config > "Export and Import"). Export writes
one JSON file (`format: expense-manager-backup`, `version: 1`) with every transaction
(including soft-deleted rows), all category rows in order, and the payment modes, and
opens the iOS share sheet (Save to Files, AirDrop). The AI key is never included. Import
is a merge, never an overwrite: rows already on the phone (same id or same bank key) are
left untouched and only missing transactions, categories and payment modes are added;
damaged rows are skipped and counted, and a file that is not a backup or comes from a
newer version is rejected with a message. Code: `src/domain/backup.ts` (format and
validation, tested), `src/db/backup.ts`, `src/ui/DataBackupSection.tsx`. Uses `expo-sharing`.

**Embeddings, vector search and RAG were dropped** (an earlier learning goal; not
needed for classifying a short note into a list). They can return later, for example
for "ask questions about my spending".

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

Verified: 52 unit tests, typecheck, `expo-doctor`, a production iOS bundle, and a
run in the iOS 26.2 simulator covering every page; the **+** menu; adding, editing
and soft-deleting; adding a category; the data migration from the first version;
real requests reaching Google and Anthropic (rejected for a fake key, as expected);
and, against a local mock of Gemini, a full import with debits and credits, the
re-classify flow, and re-importing a statement that includes a deleted row.

Not verified: a real classification by Gemini or Claude (no key was available), a
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

Spending trends by month, budgets, export/backup of the local database, a
"transfer to self" rule, and a natural-language question box over the local data.

## 9. Working agreement with the owner

- Code changes only. Do not run or test the app (no dev server, simulator, Expo Go,
  native builds or screenshots); the owner tests the app on their own iPhone.
- `npm run typecheck` and `npm test` (Node unit tests) may be run but are not required.
- At the end of a change, state what was changed and that it was not run in the app.

(The same rules are in `AGENTS.md`, which coding agents read first.)
