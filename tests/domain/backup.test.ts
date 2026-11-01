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
  type BackupAsset,
  type BackupTransaction,
} from "../../src/domain/backup";

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
  groupId: "main",
  createdGroupId: null,
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
  groups: [],
  giftOccasions: [],
  gifts: [],
  assets: [],
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
  assert.equal(header[list + 2], "Subcategory Description");
  assert.deepEqual(header.slice(list + 3, list + 8), ["", "", "", "", ""]);
  assert.equal(header[list + 8], "Payment Mode List");
  // then 5 empty columns and the groups block (8 columns), 5 empty columns and the occasions block (4), 5 empty columns and the gifts block (13)
  assert.deepEqual(header.slice(list + 9, list + 14), ["", "", "", "", ""]);
  assert.equal(header[list + 14], "Groups Id");
  assert.deepEqual(header.slice(list + 22, list + 27), ["", "", "", "", ""]);
  assert.equal(header[list + 27], "Occasions Id");
  assert.deepEqual(header.slice(list + 31, list + 36), ["", "", "", "", ""]);
  assert.equal(header[list + 36], "Gifts Id");
  // then 5 empty columns and the assets block (19)
  assert.deepEqual(header.slice(list + 49, list + 54), ["", "", "", "", ""]);
  assert.equal(header[list + 54], "Assets Id");
  assert.equal(header.length, list + 73);
  assert.deepEqual(header.slice(0, 5), ["Date", "Type", "Amount", "Category", "Subcategory"]);

  // 1 transaction but 3 payment modes: later rows have empty transaction cells.
  assert.equal(lines.length, 1 + 3); // header + one row per payment mode
  assert.match(lines[1], /^23-Oct-2026,Debit,1355\.00,Personal,Clothing,SATHISH KR,UPI,for dresse,2553\.65,Active,/);
  assert.match(lines[3], new RegExp(`^,{${list + 8}}Card,{64}$`));
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
  assert.deepEqual([credit.category, credit.subcategory, credit.classifiedBy], ["Others", "Uncategorised", "pending"]);
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

// --- groups ----------------------------------------------------------------------------------

test("CSV: groups, their dates and status, and each transaction's group survive a write and read", () => {
  const original = backup({
    groups: [
      { id: "main", name: "Main", startDate: null, endDate: null, status: "ACTIVE", parentId: null, pinned: false, heldPaise: 0 },
      { id: "g-abc", name: "Ooty trip", startDate: "2026-11-01", endDate: "2026-11-05", status: "CLOSED", parentId: null, pinned: false, heldPaise: 0 },
      { id: "g-def", name: "Bengaluru", startDate: "2026-12-01", endDate: null, status: "ACTIVE", parentId: null, pinned: false, heldPaise: 0 },
    ],
    transactions: [tx(), tx({ id: "g-abc|upi:629618527541:D", dedupeKey: "g-abc|upi:629618527541:D", groupId: "g-abc" })],
  });
  const { backup: read, skipped } = parseBackup(serializeBackup(original));
  assert.equal(skipped, 0);
  assert.deepEqual(read, { ...original, exportedAt: "" });
});

test("CSV and JSON: a group's parent and pin survive, and an older file restores groups as separate and unpinned", () => {
  const original = backup({
    groups: [
      { id: "main", name: "Main", startDate: null, endDate: null, status: "ACTIVE", parentId: null, pinned: false, heldPaise: 0 },
      { id: "g-nov", name: "Nov Month Expenses", startDate: "2026-11-01", endDate: "2026-11-30", status: "ACTIVE", parentId: "main", pinned: true, heldPaise: 0 },
      { id: "g-day", name: "Day to day", startDate: "2026-11-01", endDate: null, status: "ACTIVE", parentId: "g-nov", pinned: false, heldPaise: 25000000 },
    ],
  });
  assert.deepEqual(parseBackup(serializeBackup(original)).backup.groups, original.groups);
  assert.deepEqual(parseBackup(JSON.stringify(original)).backup.groups, original.groups);

  const csv = serializeBackup(original).split("\r\n")[0].split(",");
  assert.ok(csv.includes("Groups Parent Id") && csv.includes("Groups Pinned"));

  // a file made before groups could sit inside groups: no such columns
  const dropped = new Set(["Groups Parent Id", "Groups Pinned", "Groups Held"]);
  const table = serializeBackup(original).split("\r\n").map((line) => line.split(","));
  const keep = table[0].map((h) => !dropped.has(h));
  const old = table.map((cells) => cells.filter((_, i) => keep[i]).join(",")).join("\r\n");
  const restored = parseBackup(old).backup.groups;
  assert.equal(restored.length, 3);
  assert.ok(restored.every((g) => g.parentId === null && g.pinned === false && g.heldPaise === 0));
});

test("JSON: groups round-trip too", () => {
  const original = backup({
    groups: [{ id: "g-abc", name: "Ooty trip", startDate: "2026-11-01", endDate: null, status: "ACTIVE", parentId: null, pinned: false, heldPaise: 0 }],
    transactions: [tx({ groupId: "g-abc" })],
  });
  assert.deepEqual(parseBackup(JSON.stringify(original)).backup, original);
});

test("a version 1 file (no groups, no Group Id) restores everything into Main", () => {
  const v1 = { format: BACKUP_FORMAT, version: 1, exportedAt: "", categories: [], paymentMethods: [], transactions: [{ ...tx(), groupId: undefined }] };
  const { backup: fromJson } = parseBackup(JSON.stringify(v1));
  assert.equal(fromJson.transactions[0].groupId, "main");
  assert.deepEqual(fromJson.groups, []);

  const csv = "Date,Type,Amount,Category,Subcategory\r\n05-Oct-2026,Debit,10.00,Food,Groceries";
  const { backup: fromCsv } = parseBackup(csv);
  assert.equal(fromCsv.transactions[0].groupId, "main");
  assert.deepEqual(fromCsv.groups, []);
});

test("a damaged group row is skipped and counted", () => {
  const csv = serializeBackup(
    backup({ groups: [{ id: "g-abc", name: "Ooty trip", startDate: null, endDate: null, status: "ACTIVE", parentId: null, pinned: false, heldPaise: 0 }] }),
  );
  const broken = csv.replace("Ooty trip", "");
  const { backup: read, skipped } = parseBackup(broken);
  assert.deepEqual(read.groups, []);
  assert.equal(skipped, 1);
});

test("the group an entry created survives a CSV and a JSON round trip", () => {
  const original = backup({
    groups: [{ id: "g-abc", name: "Bengaluru", startDate: "2026-10-01", endDate: "2026-10-31", status: "ACTIVE", parentId: null, pinned: false, heldPaise: 0 }],
    transactions: [tx({ id: "m-1", dedupeKey: null, source: "manual", upiRef: null, createdGroupId: "g-abc" })],
  });
  assert.equal(parseBackup(serializeBackup(original)).backup.transactions[0].createdGroupId, "g-abc");
  assert.equal(parseBackup(JSON.stringify(original)).backup.transactions[0].createdGroupId, "g-abc");
});

test("CSV: subcategory descriptions survive a write and read, and a file without them still reads", () => {
  const original = backup({
    categories: [
      { category: "Food & Groceries", subcategory: "Chaats", description: "Dikky poori, Panipoori, roadside food" },
      { category: "Food & Groceries", subcategory: "Snacks" },
      { category: "Others", subcategory: "x", description: "=SUM(A1)" },
    ],
  });
  const text = serializeBackup(original);
  assert.match(text, /'=SUM\(A1\)/); // a description starting like a formula is protected
  const { backup: read, skipped } = parseBackup(text);
  assert.equal(skipped, 0);
  assert.deepEqual(read.categories, original.categories);

  const old = ["Date,Type,Amount,Category,Subcategory,Category List,Subcategory List", ",,,,,Food,Snacks"].join("\n");
  assert.deepEqual(parseBackup(old).backup.categories, [{ category: "Food", subcategory: "Snacks" }]);
});

test("a JSON backup's category description is read and tidied", () => {
  const json = JSON.stringify({
    format: BACKUP_FORMAT,
    version: 2,
    exportedAt: "",
    categories: [{ category: "Food", subcategory: "Snacks", description: "  tea \n and  bakes " }, { category: "Food", subcategory: "Fruits" }],
    paymentMethods: [],
    transactions: [],
  });
  assert.deepEqual(parseBackup(json).backup.categories, [
    { category: "Food", subcategory: "Snacks", description: "tea and bakes" },
    { category: "Food", subcategory: "Fruits" },
  ]);
});

test("gifts: occasions and gifts survive CSV and JSON, in rupees and grams, with the price", () => {
  const original = backup({
    giftOccasions: [
      { id: "go-1", title: "Thishika Hair Offering", occasionDate: "2026-06-10", status: "ACTIVE", createdAt: null, updatedAt: null },
      { id: "go-2", title: "Repaid", occasionDate: "2026-07-01", status: "DELETED", createdAt: null, updatedAt: null },
    ],
    gifts: [
      { id: "gf-1", occasionId: "go-1", name: "Kartheesan", direction: "received", type: "gold", value: 2250, unit: "g", ratePaise: 750000, note: "chain, 22K", status: "ACTIVE", createdAt: null, updatedAt: null },
      { id: "gf-2", occasionId: "go-1", name: "Kannan", direction: "received", type: "cash", value: 100000, unit: "INR", ratePaise: null, note: null, status: "ACTIVE", createdAt: null, updatedAt: null },
      { id: "gf-3", occasionId: "go-1", name: "Nisha", direction: "received", type: "other", value: null, unit: "INR", ratePaise: null, note: "Bangle", status: "ACTIVE", createdAt: null, updatedAt: null },
      { id: "gf-4", occasionId: "go-2", name: "Trikshan", direction: "given", type: "silver", value: 200000, unit: "INR", ratePaise: null, note: null, status: "DELETED", createdAt: null, updatedAt: null },
    ],
  });
  const csv = parseBackup(serializeBackup(original));
  assert.equal(csv.skipped, 0);
  assert.deepEqual(csv.backup.giftOccasions, original.giftOccasions);
  assert.deepEqual(csv.backup.gifts, original.gifts);
  assert.deepEqual(parseBackup(JSON.stringify(original)).backup.gifts, original.gifts);

  // readable in Excel: the value is in its own unit, with the unit and the occasion's name beside it
  const rows = csvRows(serializeBackup(original));
  assert.match(rows[1], /,gf-1,go-1,Thishika Hair Offering,Kartheesan,Received,Gold,2\.25,g,7500\.00,"chain, 22K",Active,/);
  assert.match(rows[2], /,gf-2,go-1,Thishika Hair Offering,Kannan,Received,Cash,1000\.00,INR,,,Active,/);
});

test("gifts: a file from before gifts existed restores with none, and damaged gift rows are skipped", () => {
  const old = serializeBackup(backup())
    .split("\r\n")
    .map((line) => line.split(",").slice(0, -46).join(","))
    .join("\r\n");
  const read = parseBackup(old);
  assert.deepEqual(read.backup.gifts, []);
  assert.deepEqual(read.backup.giftOccasions, []);
  assert.equal(read.backup.transactions.length, 1);

  const damaged = backup({
    giftOccasions: [{ id: "go-1", title: "Marriage", occasionDate: "2026-06-10", status: "ACTIVE", createdAt: null, updatedAt: null }],
    gifts: [
      { id: "gf-1", occasionId: "go-1", name: "Ravi", direction: "received", type: "gold", value: 3000, unit: "g", ratePaise: null, note: null, status: "ACTIVE", createdAt: null, updatedAt: null },
    ],
  });
  const text = serializeBackup(damaged).replace(",Received,Gold,3,g,", ",Sideways,Gold,3,g,");
  const result = parseBackup(text);
  assert.equal(result.skipped, 1);
  assert.equal(result.backup.gifts.length, 0);
});

const goldAsset = (over: Partial<BackupAsset> = {}): BackupAsset => ({
  id: "as-1",
  type: "gold",
  name: "Chain",
  status: "ACTIVE",
  quantity: 12500,
  unit: "g",
  purityK: 22,
  investedPaise: 7000000,
  acquiredDate: "2025-06-12",
  description: "Gift from Kannaki, Marriage",
  giftId: "gf-1",
  lender: null,
  ticketNo: null,
  pledgedDate: null,
  dueDate: null,
  loanPaise: null,
  pledgeNote: null,
  createdAt: null,
  updatedAt: null,
  ...over,
});

test("assets: gold, land, funds and a pledged piece survive CSV and JSON", () => {
  const original = backup({
    assets: [
      goldAsset(),
      goldAsset({ id: "as-2", name: "Bangle", quantity: 8000, giftId: null, description: null, lender: "Muthoot", ticketNo: "4521", pledgedDate: "2026-03-10", dueDate: "2027-03-10", loanPaise: 5000000, pledgeNote: "Land advance, part 1" }),
      goldAsset({ id: "as-3", type: "land", name: "Sivakasi plot", quantity: 5000, unit: "cent", purityK: null, investedPaise: null, acquiredDate: null, description: "Survey 123/4", giftId: null }),
      goldAsset({ id: "as-4", type: "mutual_fund", name: "Axis Bluechip", quantity: 482351, unit: "units", purityK: null, investedPaise: 10000000, giftId: null, description: null }),
      goldAsset({ id: "as-5", name: "Old ring", status: "SOLD", giftId: null, quantity: null }),
      goldAsset({ id: "as-6", type: "other", name: "NPS", quantity: null, unit: null, purityK: null, giftId: null, status: "DELETED" }),
    ],
  });
  const csv = parseBackup(serializeBackup(original));
  assert.equal(csv.skipped, 0);
  assert.deepEqual(csv.backup.assets, original.assets);
  assert.deepEqual(parseBackup(JSON.stringify(original)).backup.assets, original.assets);

  // readable in Excel: quantity in its own unit, the unit beside it, the pledge on the same row
  const rows = csvRows(serializeBackup(original));
  assert.match(rows[1], /,as-1,gold,Chain,12\.5,g,22,70000\.00,12-Jun-2025,"Gift from Kannaki, Marriage",gf-1,,,,,,,Active,/);
  assert.match(rows[2], /,as-2,gold,Bangle,8,g,22,70000\.00,12-Jun-2025,,,Muthoot,4521,10-Mar-2026,10-Mar-2027,50000\.00,"Land advance, part 1",Active,/);
});

test("assets: a file from before assets existed restores with none, and damaged asset rows are skipped", () => {
  const old = serializeBackup(backup({ assets: [goldAsset()] }))
    .split("\r\n")
    .map((line) => line.split(",").slice(0, -24).join(","))
    .join("\r\n");
  const read = parseBackup(old);
  assert.deepEqual(read.backup.assets, []);
  assert.equal(read.skipped, 0);

  const text = serializeBackup(backup({ assets: [goldAsset()] })).replace(",as-1,gold,", ",as-1,jewel,");
  const result = parseBackup(text);
  assert.equal(result.skipped, 1);
  assert.equal(result.backup.assets.length, 0);
});

test("assets: only gold keeps a pledge, even if a file says otherwise", () => {
  const land = goldAsset({ id: "as-9", type: "land", unit: "cent", purityK: null, lender: "Bank", loanPaise: 100 });
  const read = parseBackup(JSON.stringify({ ...backup(), assets: [land] })).backup.assets[0];
  assert.deepEqual([read.lender, read.loanPaise], [null, null]);
});
