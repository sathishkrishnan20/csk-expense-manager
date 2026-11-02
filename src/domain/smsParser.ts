import { toISODate } from "./format";
import { buildDedupeKey, parseAmountPaise, parseDate, type ParsedTransaction } from "./statementParser";

// Reads a bank's payment SMS, for the entries the app adds by itself when a message arrives (see import/smsCapture.ts). Only UPI
// messages are read: the UPI reference in the message is what ties it to the same payment in the bank statement later, so the
// statement import does not add it twice. Anything else (a card or ATM message, an OTP, a wording not seen before) comes back as
// null and is shown to the owner as a message that could not be read.
//
// Written from the ICICI wording:
//   "ICICI Bank Acct XX236 debited for Rs 10.00 on 02-Nov-26; SRI LAKSHMI PRO credited. UPI:667202052735. Call 18002662 ..."
// The credit wording ("... credited with Rs 500.00 on 02-Nov-26 from NAME. UPI:...") is read from the same rules but has not been
// checked against a real message.

export interface SmsTransaction {
  direction: "debit" | "credit";
  amountPaise: number;
  txnDate: string; // ISO yyyy-mm-dd
  upiRef: string; // the 12-digit UPI reference
  payee: string | null; // as the SMS spells it, often cut short
  account: string | null; // "XX236", for showing only
}

const AMOUNT = /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i;
const DATE = /\bon\s+(\d{1,2}[-/ ][A-Za-z]{3,9}[-/ ]\d{2,4}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/i;
const UPI_REF = /\bUPI\b[^0-9]{0,25}(\d{12})\b/i;
const ACCOUNT = /\bA\/?c(?:ct)?\.?\s*(?:no\.?\s*)?([Xx*]+\d{2,4})\b/;

// "SRI LAKSHMI PRO." -> "SRI LAKSHMI PRO"
const tidyPayee = (raw: string | undefined): string | null => {
  const text = (raw ?? "").replace(/\s+/g, " ").replace(/^[\s:;,.-]+|[\s:;,.-]+$/g, "");
  return text === "" ? null : text;
};

export function parseBankSms(text: string, receivedAt: Date): SmsTransaction | null {
  const t = text.replace(/\s+/g, " ").trim();

  // A debit SMS also says "<payee> credited", so the first of the two words is the direction of the owner's account.
  const debitAt = t.search(/\bdebited\b/i);
  const creditAt = t.search(/\bcredited\b/i);
  if (debitAt < 0 && creditAt < 0) return null;
  const direction = creditAt < 0 || (debitAt >= 0 && debitAt < creditAt) ? "debit" : "credit";

  const amount = AMOUNT.exec(t);
  const amountPaise = amount ? parseAmountPaise(amount[1]) : null;
  if (!amountPaise || amountPaise <= 0) return null;

  const ref = UPI_REF.exec(t);
  if (!ref) return null;

  const dateText = DATE.exec(t)?.[1];
  const txnDate = (dateText ? parseDate(dateText) : null) ?? toISODate(receivedAt);

  const payee =
    direction === "debit"
      ? tidyPayee(/;\s*([^;]+?)\s+credited\b/i.exec(t)?.[1])
      : tidyPayee(/\bfrom\s+(.+?)\s*\.?\s*(?:UPI\b|$)/i.exec(t)?.[1]);

  return { direction, amountPaise, txnDate, upiRef: ref[1], payee, account: ACCOUNT.exec(t)?.[1] ?? null };
}

// Whether a message the parser could not read is even a UPI payment message. One that is not (a card or ATM message, a balance alert,
// an OTP) is not an entry the app can make, and not a mistake either, so it is skipped quietly; one that mentions UPI but cannot be
// read is shown to the owner, because that is a wording the parser should learn.
export const mentionsUpi = (text: string): boolean => /\bUPI\b/i.test(text);

// The row the importer works with. It has no narration, balance or UPI note (the SMS has none); the statement import fills those in
// later, matching on the UPI reference.
export function smsToParsed(sms: SmsTransaction): ParsedTransaction {
  const row: Omit<ParsedTransaction, "dedupeKey"> = {
    txnDate: sms.txnDate,
    valueDate: null,
    direction: sms.direction,
    amountPaise: sms.amountPaise,
    balancePaise: null,
    narration: "",
    payee: sms.payee,
    vpa: null,
    note: null,
    payeeBank: null,
    upiRef: sms.upiRef,
  };
  return { ...row, dedupeKey: buildDedupeKey(row) };
}
