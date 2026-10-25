import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  BackupError,
  backupFileName,
  parseBackup,
  serializeBackup,
  type Backup,
  type BackupTransaction,
} from "./backup";

const tx = (over: Partial<BackupTransaction> = {}): BackupTransaction => ({
  id: "upi:629618527541:D",
  dedupeKey: "upi:629618527541:D",
  source: "import",
  status: "ACTIVE",
  txnDate: "2026-10-23",
  direction: "debit",
  amountPaise: 135500,
  balancePaise: 255365,
  category: "Personal",
  subcategory: "Clothing",
  payee: "SATHISH KR",
  paymentMethod: "UPI",
  description: "for dresse",
  narration: "UPI/SATHISH KR/XX20-1@okhdfcb/for dresse/AXIS BANK/629618527541/ICI1",
  vpa: "XX20-1@okhdfcb",
  note: "for dresse",
  payeeBank: "AXIS BANK",
  upiRef: "629618527541",
  classifiedBy: "gemini-3.5-flash-lite",
  createdAt: "2026-10-25 06:00:00",
  updatedAt: "2026-10-25 06:00:00",
  ...over,
});

const backup = (over: Partial<Backup> = {}): Backup => ({
  format: BACKUP_FORMAT,
  version: BACKUP_VERSION,
  exportedAt: "2026-10-25T06:00:00.000Z",
  categories: [{ category: "Food", subcategory: "Groceries" }],
  paymentMethods: ["Cash", "UPI"],
  transactions: [tx()],
  ...over,
});

test("an earlier JSON backup is still read unchanged", () => {
  const original = backup({
    transactions: [tx(), tx({ id: "m-1", dedupeKey: null, source: "manual", status: "DELETED", balancePaise: null, payee: null })],
  });
  const { backup: read, skipped } = parseBackup(JSON.stringify(original));
  assert.equal(skipped, 0);
  assert.deepEqual(read, original);
});

test("missing optional fields are read as null", () => {
  const sparse = { id: "m-2", source: "manual", status: "ACTIVE", txnDate: "2026-10-25", direction: "debit", amountPaise: 25000, category: "Food", subcategory: "Groceries", classifiedBy: "manual" };
  const { backup: read } = parseBackup(JSON.stringify({ ...backup(), transactions: [sparse] }));
  assert.equal(read.transactions[0].payee, null);
  assert.equal(read.transactions[0].balancePaise, null);
  assert.equal(read.transactions[0].createdAt, null);
});

test("wrong or damaged files are rejected with a clear message", () => {
  assert.throws(() => parseBackup("{ not json"), (e: unknown) => e instanceof BackupError && /not JSON/.test(e.message));
  assert.throws(() => parseBackup("just some text"), /not an Expense Manager backup/);
  assert.throws(() => parseBackup(JSON.stringify({ hello: 1 })), /not an Expense Manager backup/);
  assert.throws(() => parseBackup(JSON.stringify([1, 2])), /not an Expense Manager backup/);
  assert.throws(() => parseBackup(JSON.stringify({ ...backup(), version: 99 })), /newer version/);
  assert.throws(() => parseBackup(JSON.stringify({ ...backup(), transactions: undefined })), /incomplete/);
});

test("bad rows are skipped and counted, good rows are kept", () => {
  const bad = [
    tx({ id: "" }),
    tx({ amountPaise: -5 }),
    tx({ amountPaise: 12.5 }),
    tx({ txnDate: "25/10/2026" }),
    { ...tx(), direction: "sideways" },
    { ...tx(), payee: 42 },
    "just a string",
    null,
  ];
  const text = JSON.stringify({
    ...backup(),
    transactions: [tx({ id: "ok-1" }), ...bad, tx({ id: "ok-2" })],
    categories: [{ category: "Food", subcategory: "Groceries" }, { category: "", subcategory: "x" }, 7],
    paymentMethods: ["Cash", "", 3],
  });
  const { backup: read, skipped } = parseBackup(text);
  assert.deepEqual(read.transactions.map((t) => t.id), ["ok-1", "ok-2"]);
  assert.equal(read.categories.length, 1);
  assert.deepEqual(read.paymentMethods, ["Cash"]);
  assert.equal(skipped, 8 + 2 + 2);
});

test("file name carries the date", () => {
  assert.equal(backupFileName(new Date(2026, 9, 5)), "expense-manager-backup-2026-10-05.csv");
});

// --- CSV -------------------------------------------------------------------------------------

const csvRows = (text: string) => text.replace(/^\uFEFF/, "").split("\r\n");

test("CSV: a backup survives a write and read unchanged", () => {
  const original = backup({
    transactions: [
      tx(),
      tx({ id: "m-1", dedupeKey: null, source: "manual", status: "DELETED", balancePaise: null, payee: null, upiRef: null, vpa: null, narration: null, note: null, payeeBank: null }),
      tx({ id: "m-2", dedupeKey: null, source: "manual", upiRef: null, balancePaise: -50050, payee: 'Ravi, "Stores"', description: "line one", classifiedBy: "pending", category: "Others", subcategory: "Uncategorised" }),
    ],
    categories: [
      { category: "Food", subcategory: "Groceries" },
      { category: "Food", subcategory: "Snacks" },
    ],
    paymentMethods: ["Cash", "UPI", "Credit Card"],
  });
  const { backup: read, skipped } = parseBackup(serializeBackup(original));
  assert.equal(skipped, 0);
  assert.deepEqual(read, { ...original, exportedAt: "" });
});

test("CSV layout: transactions, 5 empty columns, category list, 5 empty columns, payment modes", () => {
  const text = serializeBackup(
    backup({ categories: [{ category: "Food", subcategory: "Groceries" }, { category: "Food", subcategory: "Snacks" }], paymentMethods: ["Cash", "UPI", "Card"] }),
  );
  assert.ok(text.startsWith("\uFEFF"), "UTF-8 BOM for Excel");
  const lines = csvRows(text);
  const header = lines[0].split(",");
  const list = header.indexOf("Category List");
  assert.ok(list > 0);
  assert.deepEqual(header.slice(list - 5, list), ["", "", "", "", ""]);
  assert.equal(header[list + 1], "Subcategory List");
  assert.deepEqual(header.slice(list + 2, list + 7), ["", "", "", "", ""]);
  assert.equal(header[list + 7], "Payment Mode List");
  assert.equal(header.length, list + 8);
  assert.deepEqual(header.slice(0, 5), ["Date", "Type", "Amount", "Category", "Subcategory"]);

  // 1 transaction but 3 payment modes: later rows have empty transaction cells.
  assert.equal(lines.length, 1 + 3); // header + one row per payment mode
  assert.match(lines[1], /^23-Oct-2026,Debit,1355\.00,Personal,Clothing,SATHISH KR,UPI,for dresse,2553\.65,Active,/);
  assert.match(lines[3], new RegExp(`^,{${list + 7}}Card$`));
});

test("CSV: text that Excel would run as a formula is protected and restored", () => {
  const evil = tx({ id: "m-9", dedupeKey: null, upiRef: null, payee: "=HYPERLINK(\"http://x\")", description: "-refund", note: "@home" });
  const text = serializeBackup(backup({ transactions: [evil] }));
  assert.match(text, /'=HYPERLINK/);
  assert.match(text, /,'-refund,/);
  const { backup: read } = parseBackup(text);
  assert.equal(read.transactions[0].payee, '=HYPERLINK("http://x")');
  assert.equal(read.transactions[0].description, "-refund");
  assert.equal(read.transactions[0].note, "@home");
});

test("CSV: columns are found by name, and Excel-style dates, amounts and spellings are accepted", () => {
  const csv = [
    "Amount,Date,Payee,Type,Subcategory,Category,Payment Method",
    '"1,250.50",5/10/2026,Milk man,expense,Groceries,Food,Cash',
    "300,05-Oct-26,Salary bonus,Income,Others,Income,",
  ].join("\n");
  const { backup: read, skipped } = parseBackup(csv);
  assert.equal(skipped, 0);
  const [a, b] = read.transactions;
  assert.deepEqual([a.txnDate, a.direction, a.amountPaise, a.paymentMethod, a.source, a.status], ["2026-10-05", "debit", 125050, "Cash", "manual", "ACTIVE"]);
  assert.deepEqual([b.txnDate, b.direction, b.amountPaise, b.paymentMethod], ["2026-10-05", "credit", 30000, null]);
  assert.equal(a.classifiedBy, "manual");
});

test("CSV: a row without an Id gets a stable one, and identical rows stay separate", () => {
  const csv = ["Date,Type,Amount,Category,Subcategory,Payee", "01/10/2026,Debit,20,Food,Snacks,Tea", "01/10/2026,Debit,20,Food,Snacks,Tea"].join("\n");
  const first = parseBackup(csv).backup.transactions.map((t) => t.id);
  const again = parseBackup(csv).backup.transactions.map((t) => t.id);
  assert.deepEqual(first, again);
  assert.equal(new Set(first).size, 2);
  assert.match(first[0], /^x-[0-9a-f]{8}-0$/);
});

test("CSV: an empty category means categorise later", () => {
  const csv = ["Date,Type,Amount,Category,Subcategory,Payee,Description", "01/10/2026,Debit,80,,,Ravi Stores,vegetables", "02/10/2026,Credit,500,,,Anil,"].join("\n");
  const [debit, credit] = parseBackup(csv).backup.transactions;
  assert.deepEqual([debit.category, debit.subcategory, debit.classifiedBy], ["Others", "Uncategorised", "pending"]);
  assert.deepEqual([credit.category, credit.subcategory, credit.classifiedBy], ["Income", "Others", "pending"]);
});

test("CSV: bad rows are skipped and counted, wrong files rejected", () => {
  const csv = [
    "Date,Type,Amount,Category,Subcategory,Payee,Category List,Subcategory List",
    "01/10/2026,Debit,20,Food,Snacks,ok,Pets,Vet",
    "not a date,Debit,20,Food,Snacks,bad date,,",
    "02/10/2026,Sideways,20,Food,Snacks,bad type,,",
    "02/10/2026,Debit,-5,Food,Snacks,bad amount,,",
    "02/10/2026,Debit,20,Food,,half category,,",
    ",,,,,,Pets,",
    ",,,,,,,",
  ].join("\n");
  const { backup: read, skipped } = parseBackup(csv);
  assert.equal(read.transactions.length, 1);
  assert.deepEqual(read.categories, [{ category: "Pets", subcategory: "Vet" }]);
  assert.equal(skipped, 4 + 1); // four bad transactions and one category without a subcategory

  assert.throws(() => parseBackup("name,age\nAnil,30"), /not an Expense Manager backup/);
  assert.throws(() => parseBackup(""), BackupError);
});

test("CSV: semicolon-separated files (some Excel regions) and a BOM are read", () => {
  const csv = "\uFEFFDate;Type;Amount;Category;Subcategory;Payee\n01/10/2026;Debit;20;Food;Snacks;Tea";
  const { backup: read, skipped } = parseBackup(csv);
  assert.equal(skipped, 0);
  assert.equal(read.transactions[0].payee, "Tea");
});
