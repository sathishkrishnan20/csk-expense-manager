import { test } from "node:test";
import assert from "node:assert/strict";
import { BACKUP_FORMAT, BACKUP_VERSION, BackupError, backupFileName, parseBackup, type Backup, type BackupTransaction } from "./backup";

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

test("a backup survives a write and read unchanged", () => {
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
  assert.throws(() => parseBackup("not json {"), (e: unknown) => e instanceof BackupError && /not JSON/.test(e.message));
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
  assert.equal(backupFileName(new Date(2026, 9, 5)), "expense-manager-backup-2026-10-05.json");
});
