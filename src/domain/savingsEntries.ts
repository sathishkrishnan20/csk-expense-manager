import { fundDisplay } from "./savings";

// The debit entry each mutual fund purchase (a SIP instalment) gets in the group the template set up for it, so the group's balance shows what really left the bank. Only a purchase
// in the current month gets one, and only from a confirmation email: the owner has already entered every earlier month by hand, so a purchase from an older month, and
// anything a CAS (which arrives after the month is over) lists, is left out; a CAS only corrects the amount of an entry that is already there.
// A purchase is known from a fund house's confirmation email or from the CAS; both give the fund (its ISIN), the day and the amount that left the bank
// (net amount + stamp duty), so those three say whether an entry is already there. Everything here is pure; the SQL is in db/savingsEntries.ts.

export const ENTRY_CATEGORY = "Savings";
export const ENTRY_SUBCATEGORY = "Mutual Fund";
// Stored in transactions.classified_by, so the entry is never offered to the AI to recategorise and can be told from one typed by hand.
export const ENTRY_CLASSIFIED_BY = "savings";

// The email and the CAS can differ by the stamp duty's last paise (an email that does not print it has it worked out), so two amounts within a rupee are the same purchase.
export const AMOUNT_TOLERANCE_PAISE = 100;

export interface FundBuy {
  isin: string;
  date: string; // "2026-11-05"
  amountPaise: number; // net amount + stamp duty
  name: string; // the fund's name as the CAS prints it
}

export const keyPrefix = (isin: string, date: string): string => `sip|${isin}|${date}|`;
export const entryKey = (isin: string, date: string, amountPaise: number, n: number): string => `${keyPrefix(isin, date)}${amountPaise}|${n}`;

// The first key for this fund, day and amount that no entry has.
export function freeKey(isin: string, date: string, amountPaise: number, used: ReadonlySet<string>): string {
  for (let n = 1; ; n++) {
    const key = entryKey(isin, date, amountPaise, n);
    if (!used.has(key)) return key;
  }
}

export interface ExistingEntry {
  id: string;
  key: string;
  amountPaise: number;
  deleted: boolean; // the owner removed it; it stays removed
  edited: boolean; // the owner changed it; it is left as they made it
}

export interface Pairing {
  matched: { buy: number; entry: ExistingEntry }[];
  unmatched: number[]; // indexes of the buys with no entry yet
}

// Pairs each purchase of one fund and day with an entry that is already there, the closest amount first, each entry once. Two real purchases that look the same
// (same fund, day and amount) are two entries, because each takes one of them.
export function pairBuys(buys: readonly { amountPaise: number }[], entries: readonly ExistingEntry[]): Pairing {
  const free = [...entries];
  const matched: Pairing["matched"] = [];
  const unmatched: number[] = [];
  buys.forEach((buy, index) => {
    let best = -1;
    for (let i = 0; i < free.length; i++) {
      const gap = Math.abs(free[i].amountPaise - buy.amountPaise);
      if (gap <= AMOUNT_TOLERANCE_PAISE && (best < 0 || gap < Math.abs(free[best].amountPaise - buy.amountPaise))) best = i;
    }
    if (best < 0) unmatched.push(index);
    else matched.push({ buy: index, entry: free.splice(best, 1)[0] });
  });
  return { matched, unmatched };
}

export interface NewEntryText {
  payee: string;
  description: string;
}

export function entryText(buy: Pick<FundBuy, "name" | "isin">): NewEntryText {
  const title = fundDisplay(buy.name).title || buy.name || buy.isin;
  return { payee: title, description: "Mutual fund purchase, added by Savings" };
}

// What a placement did, for the Savings page to say.
export interface PlaceResult {
  added: number;
  updated: number;
  same: number;
  noGroup: number; // the month was not set up from the template, or its set-up marked no group for mutual funds
  older: number; // a purchase from an earlier month than this one, or one a CAS told about: no entry is made (the owner has already entered those months)
}

export const emptyPlaceResult = (): PlaceResult => ({ added: 0, updated: 0, same: 0, noGroup: 0, older: 0 });

// The month ("2026-11") of a date on the phone's calendar.
export const monthOf = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export function placeNotes(r: PlaceResult): string[] {
  const notes: string[] = [];
  if (r.added > 0) notes.push(`Added ${r.added} mutual fund ${r.added === 1 ? "entry" : "entries"} to your month group.`);
  if (r.updated > 0) notes.push(`Corrected the amount of ${r.updated} mutual fund ${r.updated === 1 ? "entry" : "entries"} to the statement's.`);
  return notes;
}
