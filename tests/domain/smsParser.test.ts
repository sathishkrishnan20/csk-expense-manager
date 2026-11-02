import { test } from "node:test";
import assert from "node:assert/strict";
import { mentionsUpi, parseBankSms, smsToParsed } from "../../src/domain/smsParser";

const NOW = new Date(2026, 10, 2, 14, 30);
const DEBIT =
  "ICICI Bank Acct XX236 debited for Rs 10.00 on 02-Nov-26; SRI LAKSHMI PRO credited. UPI:667202052735. Call 18002662 for dispute. SMS BLOCK 236 to 9215676766";

test("an ICICI UPI debit is read: amount, date, reference, payee and account", () => {
  assert.deepEqual(parseBankSms(DEBIT, NOW), {
    direction: "debit",
    amountPaise: 1000,
    txnDate: "2026-11-02",
    upiRef: "667202052735",
    payee: "SRI LAKSHMI PRO",
    account: "XX236",
  });
});

test("the row for the importer uses the same key a statement row has, so the statement does not add it twice", () => {
  const row = smsToParsed(parseBankSms(DEBIT, NOW)!);
  assert.equal(row.dedupeKey, "upi:667202052735:D");
  assert.deepEqual([row.narration, row.balancePaise, row.note, row.vpa, row.payeeBank], ["", null, null, null, null]);
  assert.deepEqual([row.payee, row.upiRef, row.amountPaise, row.txnDate, row.direction], ["SRI LAKSHMI PRO", "667202052735", 1000, "2026-11-02", "debit"]);
});

test("a credit is read as a credit, with the sender as the payee", () => {
  const sms = "Dear Customer, Acct XX236 is credited with Rs 1,500.50 on 03-Nov-26 from RAVI KUMAR. UPI:123456789012-ICICI Bank.";
  assert.deepEqual(parseBankSms(sms, NOW), {
    direction: "credit",
    amountPaise: 150050,
    txnDate: "2026-11-03",
    upiRef: "123456789012",
    payee: "RAVI KUMAR",
    account: "XX236",
  });
  assert.equal(smsToParsed(parseBankSms(sms, NOW)!).dedupeKey, "upi:123456789012:C");
});

test("line breaks, INR and a rupee sign do not matter", () => {
  const sms = "Acct XX236 debited\nfor INR 2,00,000.00 on 02-Nov-2026;\nABC TRADERS credited.\nUPI:111122223333.";
  const read = parseBankSms(sms, NOW)!;
  assert.deepEqual([read.amountPaise, read.txnDate, read.payee, read.upiRef], [20000000, "2026-11-02", "ABC TRADERS", "111122223333"]);
  assert.equal(parseBankSms("Acct XX236 debited ₹5 on 02/11/2026; X credited. UPI:111122223333", NOW)!.amountPaise, 500);
});

test("a message without a date uses the day it arrived", () => {
  const read = parseBankSms("Acct XX236 debited for Rs 10.00; SHOP credited. UPI:111122223333.", new Date(2026, 10, 5, 9, 0))!;
  assert.equal(read.txnDate, "2026-11-05");
});

test("messages that are not UPI payments are not read", () => {
  assert.equal(parseBankSms("123456 is your OTP for the transaction of Rs 500.00. Do not share it.", NOW), null);
  assert.equal(parseBankSms("ICICI Bank Acct XX236 debited for Rs 400.00 on 02-Nov-26 at ATM. Avl Bal Rs 1000", NOW), null); // no UPI reference
  assert.equal(parseBankSms("Acct XX236 debited on 02-Nov-26; SHOP credited. UPI:111122223333", NOW), null); // no amount
  assert.equal(parseBankSms("Acct XX236 debited for Rs 0.00 on 02-Nov-26; SHOP credited. UPI:111122223333", NOW), null);
  assert.equal(parseBankSms("", NOW), null);
});

test("a message with no UPI number is skipped quietly, and only a UPI one the parser cannot read is reported", () => {
  const card = "ICICI Bank Acct XX236 debited for Rs 1,200.00 on 02-Nov-26; AMAZON PAY. Card Txn. Call 18002662 for dispute.";
  const otp = "123456 is your OTP for ICICI Bank. Do not share it with anyone.";
  const odd = "ICICI Bank: Rs 50 sent through UPI to SHOP, ref number unavailable";
  assert.equal(parseBankSms(card, NOW), null);
  assert.equal(mentionsUpi(card), false);
  assert.equal(mentionsUpi(otp), false);
  assert.equal(parseBankSms(odd, NOW), null);
  assert.equal(mentionsUpi(odd), true);
  assert.equal(mentionsUpi(DEBIT), true);
  assert.equal(mentionsUpi("It is a CUPID message"), false); // a whole word only
});
