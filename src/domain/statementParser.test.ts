import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseStatement,
  parseUpiNarration,
  parseDate,
  parseAmountPaise,
  inferPaymentMethod,
  StatementParseError,
} from "./statementParser";

// Rows exactly as exported by the bank: no header, tab separated.
const SAMPLE_ROWS = [
  "131\t23/10/2026\t23/10/2026\t\tUPI/SATHISH KR/XX20-1@okhdfcb/for dresse/AXIS BANK/629618527541/ICI1b6599f36818417bb843655ab8257ea1\t1355.00\t0.00\t2553.65",
  "132\t23/10/2026\t23/10/2026\t\tUPI/SRINIVAS V/XXx3im@ptys/UPI/YES BANK L/629682828654/ICI169a0c7a3bfd4df4b864c5472352e8d0\t75.00\t0.00\t2478.65",
  "133\t24/10/2026\t24/10/2026\t\tUPI/ANJANI KUM/XX7557@ptsbi/P211383770/Punjab Nat/629759872287/P21138377048976424966710\t100.00\t0.00\t2378.65",
  "134\t24/10/2026\t24/10/2026\t\tUPI/Raghavendr/XX1685@ybl/pampers/YES BANK L/629788882794/ICIeeb17c4ba7924f07b44235e2f0bc514f\t279.00\t0.00\t2099.65",
].join("\n");

test("parses the real sample rows without a header", () => {
  const { rows, skippedLines } = parseStatement(SAMPLE_ROWS);
  assert.equal(rows.length, 4);
  assert.equal(skippedLines, 0);

  const [first, second, third, fourth] = rows;
  assert.equal(first.txnDate, "2026-10-23");
  assert.equal(first.direction, "debit");
  assert.equal(first.amountPaise, 135500);
  assert.equal(first.balancePaise, 255365);
  assert.equal(first.payee, "SATHISH KR");
  assert.equal(first.note, "for dresse");
  assert.equal(first.upiRef, "629618527541");
  assert.equal(first.dedupeKey, "upi:629618527541:D");

  // "UPI" is the generic default note and "P211383770" is an auto-generated code.
  assert.equal(second.note, null);
  assert.equal(third.note, null);
  assert.equal(fourth.note, "pampers");
  assert.equal(fourth.payeeBank, "YES BANK L");
  assert.equal(third.txnDate, "2026-10-24");
});

test("the four sample debits total 1809 rupees", () => {
  const total = parseStatement(SAMPLE_ROWS).rows.reduce((sum, r) => sum + r.amountPaise, 0);
  assert.equal(total, 180900);
});

test("parses a comma CSV with preamble, header, quoted commas and credits", () => {
  const csv = [
    "Account Statement,,,,,,,",
    "Customer: Someone,,,,,,,",
    "",
    "Sl No,Txn Date,Value Date,Chq/Ref No,Narration,Withdrawal Amt,Deposit Amt,Closing Balance",
    '1,01/10/2026,01/10/2026,,"UPI/SWIGGY/swiggy@icici/Order, dinner/ICICI Bank/611111111111/ICIabc",450.50,0.00,"10,549.50"',
    "2,02/10/2026,02/10/2026,,NEFT-SALARY-ACME LTD,0.00,\"50,000.00\",\"60,549.50\"",
  ].join("\n");

  const { rows } = parseStatement(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].payee, "SWIGGY");
  assert.equal(rows[0].note, "Order, dinner");
  assert.equal(rows[0].amountPaise, 45050);
  assert.equal(rows[0].balancePaise, 1054950);
  assert.equal(rows[1].direction, "credit");
  assert.equal(rows[1].amountPaise, 5000000);
  assert.equal(rows[1].upiRef, null);
  assert.match(rows[1].dedupeKey, /^row:2026-10-02\|C\|5000000\|6054950\|/);
});

test("a UPI ref reused by a refund credit gets a different key from the debit", () => {
  const debit = parseStatement(SAMPLE_ROWS).rows[0];
  const credit = SAMPLE_ROWS.split("\n")[0].replace("1355.00\t0.00", "0.00\t1355.00");
  assert.equal(parseStatement(credit).rows[0].dedupeKey, "upi:629618527541:C");
  assert.notEqual(debit.dedupeKey, "upi:629618527541:C");
});

test("parseUpiNarration keeps a slash inside the note", () => {
  const f = parseUpiNarration("UPI/Shop X/shopx@ybl/rent/maid/YES BANK L/629788882794/ICI123");
  assert.equal(f.note, "rent/maid");
  assert.equal(f.payeeBank, "YES BANK L");
  assert.equal(f.upiRef, "629788882794");
});

test("non-UPI narration yields no UPI fields", () => {
  const f = parseUpiNarration("ATM WDL/CHENNAI/001234");
  assert.equal(f.payee, null);
  assert.equal(f.upiRef, null);
});

test("payment method is only inferred for UPI narrations", () => {
  assert.equal(inferPaymentMethod("UPI/SWIGGY/swiggy@icici/UPI/ICICI/611111111111/ICI1"), "UPI");
  assert.equal(inferPaymentMethod("  upi/x"), "UPI");
  assert.equal(inferPaymentMethod("NEFT-SALARY-ACME LTD"), null);
  assert.equal(inferPaymentMethod("ATM WDL/UPI NAGAR"), null);
});

test("date and amount helpers", () => {
  assert.equal(parseDate("23/10/2026"), "2026-10-23");
  assert.equal(parseDate("5-3-26"), "2026-03-05");
  assert.equal(parseDate("23 Oct 2026"), "2026-10-23");
  assert.equal(parseDate("2026-10-23 00:00:00"), "2026-10-23");
  assert.equal(parseDate("31/13/2026"), null);
  assert.equal(parseDate("hello"), null);
  assert.equal(parseAmountPaise("1,355.00"), 135500);
  assert.equal(parseAmountPaise(""), 0);
  assert.equal(parseAmountPaise("abc"), null);
  assert.equal(parseAmountPaise("0.1"), 10);
});

test("rejects binary, HTML and empty files with a clear message", () => {
  assert.throws(() => parseStatement("PK\u0003\u0004rest"), StatementParseError);
  assert.throws(() => parseStatement("<html><table><tr><td>x</td></tr></table></html>"), /HTML table/);
  assert.throws(() => parseStatement("just,some,text\nnothing,here,at all"), /No transactions found/);
});

test("skips unparseable lines but counts them", () => {
  const bad = `${SAMPLE_ROWS}\n135\tnot-a-date\t\t\tUPI/X/y@z/n/B/629788882795/I\t10.00\t0.00\t1.00`;
  const { rows, skippedLines } = parseStatement(bad);
  assert.equal(rows.length, 4);
  assert.equal(skippedLines, 1);
});

test("merges continuation rows where the bank splits a long narration across lines", () => {
  // Row 38 in the ICICI export: narration is split after "YesBank_" with
  // "Ye/664388587875/ICI..." on the next line in the narration column only.
  const csv = [
    ",S No.,Value Date,Transaction Date,Cheque Number,Transaction Remarks,Withdrawal Amount(INR),Deposit Amount(INR),Balance(INR)",
    ",37,04/10/2026,04/10/2026,,UPI/YADAV CHAT/XXter3@yesbank/UPI/YesBank_Ye/664310874345/ICI8ac87ee6a5874245a43e1cccdf41e054,60.00,0.00,39243.51",
    ",38,04/10/2026,04/10/2026,,UPI/SHREE OM B/XX4282@yesbank/UPI/YesBank_,90.00,0.00,39153.51",
    ",,,,,Ye/664388587875/ICI2f7ef48ccd12425387a57ac4b02d340c,,,",
    ",39,04/10/2026,04/10/2026,,UPI/KRISHNA D/XXidxx@pty/UPI/YES BANK P/664318384400/ICI6d0cca5885734d6ea6a1afc2902e9a42,90.00,0.00,39063.51",
  ].join("\n");

  const { rows } = parseStatement(csv);
  assert.equal(rows.length, 3);

  // The merged row (index 1) should have a complete narration and UPI ref
  const merged = rows[1];
  assert.equal(merged.payee, "SHREE OM B");
  assert.equal(merged.upiRef, "664388587875");
  assert.equal(merged.dedupeKey, "upi:664388587875:D");
  assert.equal(merged.amountPaise, 9000);
});

test("merges multiple continuation rows with the preceding data row", () => {
  // Simulate a narration so long it wraps into two continuation lines.
  const csv = [
    "Sl No,Txn Date,Value Date,Chq/Ref No,Narration,Withdrawal Amt,Deposit Amt,Closing Balance",
    "1,01/10/2026,01/10/2026,,UPI/LONG PAYEE NAME/XX1234@ybl/a very long note that gets,100.00,0.00,5000.00",
    ",,,, truncated here/YES BANK L/,,",
    ",,,,629618527541/ICI1b6599f36818417bb843655ab8257ea1,,",
    "2,02/10/2026,02/10/2026,,UPI/SHORT/XX99@ybl/note/AXIS BANK/629682828654/ICI169a,50.00,0.00,4950.00",
  ].join("\n");

  const { rows } = parseStatement(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].upiRef, "629618527541");
  assert.equal(rows[1].payee, "SHORT");
});
