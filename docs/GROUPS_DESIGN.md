# Groups and Duplicate: DB design and low-level design

Status: **implemented, not yet run in the app** (typecheck and unit tests only). Differences from this design as built:

- Duplicate is a full screen (`src/app/duplicate.tsx`), not a dialog, so the date and group pickers are not nested modals. The target group is a
  plain "Into group" field, preset to the rows' own group, rather than a "Change" link. Rows are handed over through `src/ui/pendingDuplicate.ts`.
- The scoped-key logic is `src/import/scopedStore.ts` (`scopeStore`), a wrapper around a keyed SQLite store, so it is unit tested without SQLite.
- Not built: moving existing rows into a group (phase 2's "move selected"), and the "Reopen and import" prompt (importing into a closed group just works).
- A group is used exactly like Main, not through a separate detail screen. Home, Transactions and Charts are shared views taking a `groupId`
  (`src/ui/HomeView.tsx`, `TransactionsView.tsx`, `ChartsView.tsx`); a group has its own bottom tabs (`src/app/groups/[id]/`: Overview,
  Transactions, Charts, and a Main tab to go back) with the same + menu (Credit, Debit, Import), which adds to the group you are in. Income and
  expense cards on its Overview open the Add form like Main's. The group switcher chips on Transactions and Charts were dropped.
- Added after the first build: "Create a group for this entry" on the Add form (Main only) and, in Duplicate, a new group per copy of an entry that
  created one. This needs `transactions.created_group_id` (schema 5). See ARCHITECTURE.md, "Create a group for an entry".
- Add income / Add expense in a group use the normal Add form with `?group=`; there is no separate budget sheet.
- `countUnresolved(groupId | null)`: Home passes Main, Config passes `null` (all groups).

## 1. The idea, simply

1. There is **Main**. It is what the app is today.
2. You can create **another group**. A group is the same as Main: it has **incomes and expenses**, you can add them by hand,
   and you can **import a bank statement into that group**. Each group has its own balance. Groups never mix with Main or
   with each other.
3. You can **select existing expenses and duplicate them with new dates**. That is how the repeating monthly lines (rent,
   EMI, cards, savings) are entered quickly each month, with no templates.

A group is just a name. You create it yourself ("New group"); the app never creates one on its own.

## 2. Decisions

| # | Decision | Why |
|---|---|---|
| 1 | A group is a `group_id` column on `transactions`, plus a small `expense_groups` table. | Edit, delete, categories, AI classify, re-classify, filters, charts and backup keep working on the same row shape. |
| 2 | Main is a built-in group with id `main`. All existing rows belong to it. | No data change for the owner's current use. |
| 3 | A group has a name, a start date, an end date and a status. No kind, no budget field. | Keeps it simple. The dates are optional labels for when the group runs; they do not limit which transactions the group can hold. A budget is just an income you add to the group. Balance = incomes minus expenses. |
| 4 | Groups are created only by the owner (Groups screen > New group). | Nothing automatic. |
| 5 | Groups are separate. No combined total, and no link between Main and a group. **Superseded by schema version 9: a group can sit under Main or another group and its balance then includes it; "None (kept separate)" keeps the original behaviour.** | Each group's balance is its own incomes minus its own expenses. A transfer is just an income or expense in whichever group it is imported or added. |
| 6 | **Import goes into the group you pick first. Every row in the file goes there**, whether it is an expense, an income or a transfer. | No special handling. The importer is unchanged; only where it saves is chosen. |
| 7 | Duplicate creates **new hand entries**; it never copies bank-only fields. | A copy is a repeat, not a second bank row (3.5, 4.5). |

## 3. Database design

SQLite via `expo-sqlite`. `PRAGMA user_version` goes from 3 to **4**. Money stays integer paise.

### 3.1 Relationship

```
expense_groups 1 ───< transactions        (transactions.group_id; 'main' is the built-in group)
```

### 3.2 DDL

`groups` is a keyword in recent SQLite, so the table is `expense_groups`.

```sql
CREATE TABLE IF NOT EXISTS expense_groups (
  id         TEXT PRIMARY KEY NOT NULL,      -- 'main', or 'g-<base36 time>-<random>'
  name       TEXT NOT NULL,
  start_date TEXT,                           -- ISO yyyy-mm-dd, optional
  end_date   TEXT,                           -- ISO yyyy-mm-dd, optional (null = open-ended)
  status     TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CLOSED', 'DELETED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO expense_groups (id, name) VALUES ('main', 'Main');

-- transactions gains one column (CREATE TABLE for new databases, guarded ALTER for existing ones, see 3.4):
--   group_id TEXT NOT NULL DEFAULT 'main'
CREATE INDEX IF NOT EXISTS transactions_group_idx
  ON transactions (group_id, txn_date DESC, created_at DESC);
```

No SQL foreign key: SQLite does not allow `ADD COLUMN ... REFERENCES` with a non-null default when foreign keys are enforced,
and the app has never enabled them. The db layer is the only writer and keeps `group_id` valid.

`start_date` / `end_date` are informational: shown on the group card and header, used to order groups, and used to prefill the date filter
on the group's list. They never block adding or importing a transaction dated outside the range. If both are set, `end_date >= start_date`.

`status`: `ACTIVE` is shown everywhere; `CLOSED` hides the group from Home and the pickers but keeps it listed under "Closed";
`DELETED` is a soft delete of the group **and** its transactions (keys stay, so a deleted bank row is not re-imported).

### 3.3 Skipping rows already imported into a group

Importing the same file twice must not add rows twice. Today that works through `transactions.dedupe_key` (`UNIQUE`), and imported
rows use the same string as their `id` (`sqliteStore.insert`; `restoreDeletedRows` relies on it). To keep that working per group
without rebuilding the table, the key is prefixed with the group id:

```
scopedKey(groupId, bankKey) = groupId === 'main' ? bankKey : `${groupId}|${bankKey}`
```

- Rows imported into Main keep their current key. **No existing data changes.**
- Rows imported into group `g-x` store `dedupe_key = id = "g-x|<bankKey>"`.
- The key is fixed when the row is imported and is not rewritten if the row is later moved to another group (phase 2).
- A row is skipped only if it was already imported into **the same group**. The summary names the group.

### 3.4 Migration (3 to 4)

In `migrate()` in `src/db/database.ts`:

1. `CREATE TABLE IF NOT EXISTS expense_groups` (in `SCHEMA`), then insert `main`.
2. If `pragma_table_info('transactions')` has no `group_id`: `ALTER TABLE transactions ADD COLUMN group_id TEXT NOT NULL DEFAULT 'main'`.
   Fresh installs get the column from the `CREATE TABLE`.
3. **After step 2**, `CREATE INDEX ... transactions_group_idx`. It cannot live in `SCHEMA`, because `SCHEMA` also runs on old databases
   whose table has no `group_id` yet.
4. `PRAGMA user_version = 4`.

Existing rows become Main through the column default. The first-release (v1) migration path is untouched.

### 3.5 What a duplicate copies

A duplicate is a **new manual row** in the target group.

| Field | In the copy |
|---|---|
| `id` | new `m-…` id |
| `txn_date` | the new date (4.5) |
| `direction`, `amount_paise` | copied (amount editable before saving) |
| `category`, `subcategory`, `payee`, `payment_method`, `description` | copied |
| `source` | `'manual'` |
| `dedupe_key`, `balance_paise`, `narration`, `vpa`, `note`, `payee_bank`, `upi_ref` | **null** (bank-only) |
| `classified_by` | `'manual'` when the original has a real category; `'pending'` when the original is in the fallback or was pending, so Re-classify can label it |
| `ai_attempts` | 0 |
| `group_id` | the chosen target (default: the original's group) |

### 3.6 Group list with balances (Home and Groups screen)

```sql
SELECT g.id, g.name, g.start_date, g.end_date, g.status,
       COALESCE(SUM(CASE WHEN t.direction = 'credit' THEN t.amount_paise END), 0) AS in_paise,
       COALESCE(SUM(CASE WHEN t.direction = 'debit'  THEN t.amount_paise END), 0) AS out_paise
FROM expense_groups g
LEFT JOIN transactions t ON t.group_id = g.id AND t.status = 'ACTIVE'
WHERE g.status != 'DELETED'
GROUP BY g.id
ORDER BY (g.id = 'main') DESC, g.status = 'CLOSED', COALESCE(g.start_date, g.created_at) DESC;
```

Every existing transaction query gains `AND group_id = ?` (4.2).

## 4. Low-level design

### 4.1 New files

```
src/domain/groups.ts          pure: types, MAIN_GROUP_ID, scopedKey, balanceOf, validateGroup        (tested)
src/domain/duplicate.ts       pure: shiftMonths, buildDuplicates, futureDateWarning                      (tested)
src/domain/selection.ts       pure: toggle / select-all / clear on a Set of ids                          (tested)
src/db/groups.ts              createGroup, updateGroup (name and dates), closeGroup, reopenGroup, deleteGroup, listGroupsWithBalances
src/ui/GroupSwitcher.tsx      chip row: Main + active groups (Transactions, Charts)
src/ui/GroupCard.tsx          name + balance (Home strip, Groups list)
src/ui/DuplicateSheet.tsx     the duplicate dialog (4.5), built on the existing Sheet in src/ui/forms.tsx
src/app/groups/index.tsx      all groups, "New group"
src/app/groups/[id].tsx       group detail (4.4)
src/app/groups/edit.tsx       create / edit: name, start date, end date (?id= to edit)
tests/domain/groups.test.ts, duplicate.test.ts, selection.test.ts, tests/import/scopedStore.test.ts
```

Routes are root-stack screens like `add` and `import`. **No new tab**; entry points are Home cards and the web sidebar.

### 4.2 Changes to existing code

| File | Change |
|---|---|
| `src/db/database.ts` | `SCHEMA_VERSION = 4`, new table, guarded `ALTER`, index after it (3.4) |
| `src/db/transactions.ts` | `TransactionRecord.groupId`. `groupId` **required** (no default) on `listTransactions`, `getTotals`, `getExpensesBy`, `countUnresolved`, so a missed call site is a type error. `addTransaction` takes `groupId`. `sqliteStore` becomes `createSqliteStore(groupId)` applying `scopedKey` to `existingKeys`, `deletedKeys`, and to both `id` and `dedupe_key` on `insert`. `restoreDeleted(keys, groupId)` scopes its keys. New `addTransactions(inputs)` (one db transaction, used by duplicate) and `moveTransactions(ids, groupId)` (phase 2). Re-classify functions stay global: categories are shared and ids are unique. |
| `src/import/importStatement.ts` | **No change** (pure; sees only the store interface). |
| `src/import/services.ts` | `runImport(file, onProgress, groupId)` and `restoreDeletedRows(rows, onProgress, groupId)`; the latter passes the **scoped** key as the candidate `id`. |
| `src/app/import.tsx` | "Import into" selector (Main or any active group), preset by `?group=`; the summary names the group. Files shared from Mail/Files default to Main. |
| `src/app/add.tsx` | `?group=` param; title shows the group name; a "Group" field on edit that moves the one row (phase 2). |
| `src/app/(tabs)/index.tsx` | Main totals and recent list as now; adds a strip of group cards with a "+ New" card and "All groups". |
| `src/app/(tabs)/transactions.tsx`, `charts.tsx` | `GroupSwitcher` at the top, `?group=` param, default Main, not remembered between visits (like the filters). Transactions also gets selection mode (4.5). |
| `src/ui/TransactionRow.tsx` | Optional `selectable` / `selected` props (checkbox), long-press to start selecting. |
| `src/db/backup.ts`, `src/domain/backup.ts` | Backup version 2 (4.7). |
| `src/domain/helpContent.ts`, `docs/ARCHITECTURE.md`, `src/ui/Sidebar.tsx` | Document groups and duplicate; sidebar entry. |

The classifier prompt is unchanged: categories are global and the same rules apply inside groups.

### 4.3 Domain API (signatures only)

```ts
// src/domain/groups.ts
export const MAIN_GROUP_ID = "main";
export type GroupStatus = "ACTIVE" | "CLOSED" | "DELETED";
export interface Group { id: string; name: string; startDate: string | null; endDate: string | null; status: GroupStatus }
export interface GroupWithBalance extends Group { inPaise: number; outPaise: number }
export const balanceOf = (g: { inPaise: number; outPaise: number }) => g.inPaise - g.outPaise;
export const scopedKey = (groupId: string, bankKey: string): string;   // 3.3
export function validateGroup(i: { name: string; startDate: string | null; endDate: string | null }, existingNames: string[]): string | null;
// error text: empty or duplicate name, or end date before start date

// src/domain/selection.ts
export const toggle = (selected: ReadonlySet<string>, id: string): Set<string>;
export const selectAll = (ids: string[]): Set<string>;

// src/domain/duplicate.ts
export type DateRule =
  | { mode: "date"; date: string }          // every copy gets this one date
  | { mode: "shift"; months: number };      // each copy keeps its own day, moved by N months (clamped to month end)
export function shiftMonths(isoDate: string, months: number): string;   // 2026-01-31 +1 -> 2026-02-28
export interface DuplicateDraft { sourceId: string; input: TransactionInput; label: string }
export function buildDuplicates(rows: TransactionRecord[], rule: DateRule, targetGroupId: string): DuplicateDraft[];  // 3.5 rules
export function futureDateWarning(drafts: DuplicateDraft[], targetGroupId: string, today: string): string | null;
```

Tests: `shiftMonths` (31st to a short month, December to January, leap day, negative months); `buildDuplicates` copies the right fields and nulls
the bank-only ones, picks `manual` vs `pending`, handles both rules; `scopedKey` (Main unchanged, group prefixed); selection helpers;
a scoped-store test showing the same bank row imported into Main and into a group makes two rows while re-importing into each skips.

### 4.4 Group detail screen (`/groups/[id]`)

Same page as Main, scoped to the group:

```
┌ header ────────────────────────────────┐
│ Bengaluru              1 Nov - 30 Nov  │
│ Balance          ₹ 3,420               │
│ [Income ₹ 20,000]  [Expenses ₹ 16,580] │
├────────────────────────────────────────┤
│ [Add income] [Add expense] [Import]    │   /add?group=<id>&type=CREDIT|DEBIT, /import?group=<id>
├────────────────────────────────────────┤
│ existing filters panel                 │
│ existing transaction rows (selectable) │   tap = edit, long-press = select -> Duplicate
│ ⋯ menu: Edit · Charts · Close · Delete │
└────────────────────────────────────────┘
```

- Add income / Add expense / Import behave exactly like Main's Credit / Debit / Import.
- Balance = incomes minus expenses of this group only; negative shows in red and is allowed.
- Close hides the group from Home and the pickers (it stays under "Closed" and can be reopened). Delete asks for confirmation and
  soft-deletes the group and its transactions. Main cannot be closed or deleted; it can be renamed and has no dates.
- Importing into a closed group offers "Reopen and import".

### 4.5 Select and duplicate (Transactions screen and group detail)

Flow:

1. Long-press a row: selection mode starts. Each row shows a checkbox. The header shows "3 selected", **Select all shown**, **Duplicate**,
   and Cancel. "Shown" respects the filters, so filtering to one month's date range and tapping Select all picks that whole month.
2. **Duplicate** opens `DuplicateSheet`:
   - **Date**: choose *Same day, next month* (months = +1, editable) or *Pick one date for all*.
   - **Into**: the group the selected rows are already in (a list always shows one group, so it is unambiguous). Shown as a plain line with no
     question asked. A "Change" link lets the owner pick another active group, and only then is a group chosen.
   - A list of the copies it will create (label, new date, amount). Each amount is editable and each row has a checkbox to leave it out,
     because amounts such as electricity differ month to month.
   - A warning (`futureDateWarning`) when the target is Main and a new date is in the future: "Importing your bank statement later will add the real
     rows as well, so these would be counted twice. Consider duplicating into a group." It is a note, not a block.
3. **Create N entries** calls `addTransactions(drafts)` once (single db transaction), shows a snackbar "N added", and leaves selection mode.
   Edit and delete work on the copies like any hand entry.

Not copied: bank-only fields (3.5). Copies are never matched against a later statement import (hand-entry rule), which is why the warning exists.

### 4.6 Import into a group, end to end

The Import screen has an **Import into** picker (Main or any active group). The owner picks the group, then the file; every row goes
into that group. From a group's own page the picker is already set to it.

```
Group detail (or Import screen) -> /import?group=g-x
  runImport(file, progress, "g-x")
    createClassifier()                       unchanged: current categories + the selected AI
    parse CSV / Excel / PDF                  unchanged
    importParsed(rows, { store: createSqliteStore("g-x"), … })
        existingKeys / deletedKeys / insert use scopedKey("g-x", key)    <- the only difference
  summary: "Saved N new transactions into <group>", skipped, deleted-earlier, errors
```

The importer reads the bank layouts it supports today. A statement from another bank layout is a parser question, not a groups question.

### 4.7 Backup and restore

`BACKUP_VERSION` 1 to **2**. Version 1 files are still read (every transaction goes to Main).

- Transactions block gets a `Group Id` column; missing or empty means `main`.
- A new side-by-side **Groups** block (id, name, status), separated by 5 empty columns like the existing blocks.
- Restore stays a merge and never overwrites. Order: groups first, then transactions.
- A version-2 file opened by an older app is rejected by the existing "newer version" check, which is the intended failure.

Exact column names are fixed when `src/domain/backup.ts` is changed; header-name lookup keeps the order free.

### 4.8 Edge cases

| Case | Behaviour |
|---|---|
| Group with no transactions | Balance ₹0. |
| Same file imported into two groups | Allowed; each group gets its own copy. Skipping only applies within one group. |
| Duplicate across groups | Allowed; the copy lives in the target group only. |
| Duplicate a row that is Uncategorised or pending | Copy is `pending`, so Re-classify can label it. |
| Duplicate a deleted row | Not possible; deleted rows are not listed. |
| Re-classify | Runs across all groups; Home/group screens show per-group counts, Config shows the global count. |
| Group name already used | Rejected by `validateGroup` (case-insensitive). |
| Web build | Same code, same SQLite wasm. |

## 5. Walkthrough

1. **New group**: Groups > New group, name it `Bengaluru`, optionally set a start and end date. It starts empty, balance ₹0.
2. **Fill it**: Add income and Add expense by hand, and/or Import: pick `Bengaluru`, choose the statement. Every row in the file lands in that
   group. Its balance is its incomes minus its expenses.
3. **Another group** (`Ooty trip`, `Marriage`, anything): same steps. Main and the other groups are untouched.
4. **Repeat last month's entries**: in Transactions (Main or a group), filter to the dates you want, tap Select all shown, untick the one-offs,
   Duplicate, choose *Same day, next month* (or one date), adjust the amounts that changed, Create.

## 6. What this does not do (on purpose)

- (Superseded: balances now roll up through groups that sit inside other groups, see ARCHITECTURE.md, "Groups inside groups and pinning". A group kept separate still has no link to Main.)
- No templates, plans or automatic group creation.
- No per-group categories (categories stay global).

## 7. Risks

- **Every existing transaction query must take `groupId`.** Required parameters turn a missed call into a typecheck error.
- **Migration order** (alter before index, 3.4): a fresh-install test passes while an upgrade can fail. Test both paths on a copy of real data.
- **Duplicates into Main with future dates** double count once the real statement is imported (4.5 warning). Groups avoid this.
- Ids stay unique across groups only if every writer goes through `createSqliteStore`; hand entries use random ids.

## 8. Phases

1. **Groups.** Schema v4 and migration; `group_id` through `db/transactions.ts`; Groups list, detail, create/edit (name and dates)/close/delete; add income and
   expense into a group; **import into a group**; `GroupSwitcher` on Transactions and Charts; Home strip; backup v2; tests.
2. **Select and duplicate.** Selection mode, `DuplicateSheet`, `addTransactions`, tests. Then "move selected to a group" using the same selection.
3. **Later, if wanted:** a link between a Main debit and a group credit; suggested matches.

## 9. Decided

Earlier drafts had monthly plans, templates and a "Group each month" switch. All dropped; duplicate replaces them.

1. **Duplicate keeps the preview with editable amounts** (4.5): date rule, list of copies, edit an amount or leave a row out, then Create.
2. **Duplicate stays in the same group by default**, with no question asked. Only if the owner taps "Change" does it ask which group to put the copies in.

The importer reads the same bank layouts it reads today (CSV, Excel, PDF); a new layout would be a separate parser change.

Nothing is open. Next step is to implement phase 1 (groups and import into a group), then phase 2 (select and duplicate).
