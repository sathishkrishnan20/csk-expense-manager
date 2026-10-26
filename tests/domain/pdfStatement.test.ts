import { test } from "node:test";
import assert from "node:assert/strict";
import { PdfStatementError, parseStatementPdf, type PdfTextItem } from "../../src/domain/pdfStatement";

// Builds positioned text the way a PDF text extractor reports an ICICI-style statement page (all data invented).
const EDGE = { deposit: 427, withdrawal: 505, balance: 584 };
const item = (text: string, x: number, y: number, width = text.length * 5): PdfTextItem => ({ text, x, y, width });
const amount = (text: string, edge: number, y: number): PdfTextItem => item(text, edge - text.length * 5, y, text.length * 5);

const header = (y: number): PdfTextItem[] => [
  item("DATE", 27, y, 21),
  item("MODE**", 76, y, 32),
  item("PARTICULARS", 158, y, 54),
  item("DEPOSITS", 387, y, 40),
  item("WITHDRAWALS", 444, y, 61),
  item("BALANCE", 546, y, 38),
];

interface Tx {
  date: string;
  lines: string[];
  deposit?: string;
  withdrawal?: string;
  balance: string;
}

// Lines are 10pt apart; the date and amounts sit at the vertical middle of the transaction's lines.
function table(top: number, txs: Tx[]): { items: PdfTextItem[]; bottom: number } {
  const items: PdfTextItem[] = [];
  let y = top;
  for (const t of txs) {
    const ys = t.lines.map((_, i) => y - 10 * i);
    t.lines.forEach((text, i) => items.push(item(text, 158, ys[i])));
    const mid = ys.reduce((s, v) => s + v, 0) / ys.length;
    items.push(item(t.date, 27, mid, 41));
    if (t.deposit) items.push(amount(t.deposit, EDGE.deposit, mid));
    if (t.withdrawal) items.push(amount(t.withdrawal, EDGE.withdrawal, mid));
    items.push(amount(t.balance, EDGE.balance, mid));
    y -= 10 * t.lines.length;
  }
  return { items, bottom: y };
}

const opening: Tx = { date: "01-10-2026", lines: ["B/F"], balance: "10,000.00" };
const rent: Tx = {
  date: "01-10-2026",
  lines: ["UPI/RAVI K/ravik@okaxis/rent/AXIS", "BANK/600000000001/ICIa1b2c3d4e5f6a7b8c9d0e1f2a3b", "4c5d6RAVI KUMAR"],
  withdrawal: "4,000.00",
  balance: "6,000.00",
};
const longNote: Tx = {
  date: "02-10-2026",
  lines: ["UPI/ASHA STORES/asha@ybl/vegetables for", "the whole week/YES BANK", "L/600000000002/ICIf1e2d3c4b5a6f7e8d9c0b1a2f3e4", "d5c6bASHA STORES KIRANA"],
  withdrawal: "500.50",
  balance: "5,499.50",
};
const salary: Tx = {
  date: "03-10-2026",
  lines: ["UPI/ACME LTD/acme@icici/UPI/ICICI", "Bank/600000000003/ICIaaaabbbbccccddddeeeeffff111", "12222ACME LIMITED"],
  deposit: "2,000.00",
  balance: "7,499.50",
};
const tea: Tx = {
  date: "04-10-2026",
  lines: ["UPI/CAFE ONE/cafeone@icici/UPI/ICICI", "Bank/600000000004/ICI0123456789abcdef0123456789a", "bcdefCAFE ONE"],
  withdrawal: "99.50",
  balance: "7,400.00",
};

const total = (y: number, deposits: string, withdrawals: string, balance: string): PdfTextItem[] => [
  item("TOTAL", 155, y, 26),
  amount(deposits, EDGE.deposit, y),
  amount(withdrawals, EDGE.withdrawal, y),
  amount(balance, EDGE.balance, y),
];

function page1(txs: Tx[], withTotal = true, totals = ["2,000.00", "4,600.00", "7,400.00"]) {
  const { items, bottom } = table(700, txs);
  return [
    item("Statement of Transactions in Savings Account Number: 000000000000", 27, 760, 300),
    ...header(720),
    ...items,
    ...(withTotal ? total(bottom - 6, totals[0], totals[1], totals[2]) : []),
    item("Page 1 of 1", 524, 792, 60),
  ];
}

test("reads rows of several shapes, checks pass, and keys match the CSV importer's", () => {
  const r = parseStatementPdf([page1([opening, rent, longNote, salary, tea])]);

  assert.deepEqual(r.warnings, []);
  assert.equal(r.openingBalancePaise, 1000000);
  assert.equal(r.closingBalancePaise, 740000);
  assert.equal(r.rows.length, 4);

  const [a, b, c, d] = r.rows;
  assert.deepEqual([a.txnDate, a.direction, a.amountPaise, a.balancePaise], ["2026-10-01", "debit", 400000, 600000]);
  assert.equal(a.narration, "UPI/RAVI K/ravik@okaxis/rent/AXIS BANK/600000000001/ICIa1b2c3d4e5f6a7b8c9d0e1f2a3b 4c5d6RAVI KUMAR");
  assert.deepEqual([a.payee, a.vpa, a.note, a.payeeBank, a.upiRef], ["RAVI K", "ravik@okaxis", "rent", "AXIS BANK", "600000000001"]);
  assert.equal(a.dedupeKey, "upi:600000000001:D");

  // a note that wrapped across lines, in a four-line transaction
  assert.equal(b.note, "vegetables for the whole week");
  assert.equal(b.payeeBank, "YES BANK L");
  assert.equal(b.amountPaise, 50050);

  assert.deepEqual([c.direction, c.amountPaise, c.dedupeKey], ["credit", 200000, "upi:600000000003:C"]);
  assert.equal(d.payee, "CAFE ONE");
});

test("a table that continues on the next page, with its header repeated, is read as one", () => {
  const first = table(700, [opening, rent]);
  const second = table(700, [longNote, salary, tea]);
  const r = parseStatementPdf([
    [...header(720), ...first.items, item("Page 1 of 2", 524, 792, 60)],
    [item("Page 2 of 2", 524, 792, 60), ...header(720), ...second.items, ...total(second.bottom - 6, "2,000.00", "4,600.00", "7,400.00")],
  ]);
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.rows.map((t) => t.upiRef), ["600000000001", "600000000002", "600000000003", "600000000004"]);
});

test("a balance that does not follow from the previous one is reported", () => {
  const wrong: Tx = { ...longNote, balance: "5,400.00" };
  const r = parseStatementPdf([page1([opening, rent, wrong, salary, tea])]);
  assert.ok(r.warnings.some((w) => /transaction 2 .*does not add up/.test(w)), r.warnings.join("; "));
});

test("totals that differ from the bank's TOTAL row are reported", () => {
  const r = parseStatementPdf([page1([opening, rent, longNote, salary, tea], true, ["2,000.00", "5,000.00", "7,400.00"])]);
  assert.deepEqual(r.warnings, ["The withdrawals do not match the total printed on the statement."]);
});

test("a missing TOTAL row is reported, not ignored", () => {
  const r = parseStatementPdf([page1([opening, rent, longNote, salary, tea], false)]);
  assert.equal(r.rows.length, 4);
  assert.match(r.warnings.join(" "), /TOTAL row was not found/);
});

test("a page with no transaction table is rejected with a clear message", () => {
  assert.throws(() => parseStatementPdf([[item("Account Related Other Information", 27, 600, 160)]]), PdfStatementError);
  assert.throws(() => parseStatementPdf([]), /Could not find a transaction table/);
});
