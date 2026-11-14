import {
  ENTRY_CATEGORY,
  ENTRY_CLASSIFIED_BY,
  ENTRY_SUBCATEGORY,
  emptyPlaceResult,
  entryText,
  freeKey,
  keyPrefix,
  pairBuys,
  type ExistingEntry,
  type FundBuy,
  type PlaceResult,
} from "../domain/savingsEntries";
import type { AssetDb as SqlDb } from "./assetSql";
import { fundsGroupFor } from "./monthTemplateSql";

// Puts each mutual fund purchase into the owner's month group as a debit (domain/savingsEntries.ts has the rules), written against the same adapter as
// savingsSql.ts so it runs on the phone and in Node's SQLite (tests/db/savingsEntriesSql.test.ts). Meant to run inside the caller's transaction.
//
// Only a purchase in the current month gets a new entry, and a CAS never makes one (see domain/savingsEntries.ts).
//
// An entry is an ordinary transaction (source 'manual', classified_by 'savings') with a key `sip|<isin>|<date>|<amount>|<n>` in dedupe_key. Another purchase of
// the same fund and day that is already there (by that key's fund and day, and an amount within a rupee) is the same purchase, so the email and then the CAS give one
// entry. An entry the owner deleted stays deleted (the row is still there, as DELETED); one they edited is not touched again; one they have not touched takes
// the statement's amount.

const newId = (): string => `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

interface EntryRow {
  id: string;
  dedupe_key: string;
  amount_paise: number;
  status: string;
  created_at: string;
  updated_at: string;
}

// `month` is the current month ("2026-11"). With `add` false (a CAS) nothing new is made, an entry already there is only corrected; with it true, an entry is made
// only for a purchase in `month`.
export interface PlaceOptions {
  month: string;
  add: boolean;
}

export async function placeFundEntries(db: SqlDb, buys: readonly FundBuy[], options: PlaceOptions): Promise<PlaceResult> {
  const result = emptyPlaceResult();
  if (buys.length === 0) return result;

  // One fund and day at a time, so the purchases that look alike are paired with the entries that look alike.
  const byDay = new Map<string, FundBuy[]>();
  for (const b of buys) byDay.set(`${b.isin}|${b.date}`, [...(byDay.get(`${b.isin}|${b.date}`) ?? []), b]);

  for (const day of byDay.values()) {
    const { isin, date } = day[0];
    const rows = await db.all<EntryRow>("SELECT id, dedupe_key, amount_paise, status, created_at, updated_at FROM transactions WHERE dedupe_key LIKE ? ESCAPE '\\'", [`${keyPrefix(isin, date).replace(/[\\%_]/g, "\\$&")}%`]);
    const existing: ExistingEntry[] = rows.map((r) => ({ id: r.id, key: r.dedupe_key, amountPaise: r.amount_paise, deleted: r.status === "DELETED", edited: r.updated_at !== r.created_at }));
    const used = new Set(rows.map((r) => r.dedupe_key));
    const sorted = [...day].sort((a, b) => a.amountPaise - b.amountPaise);
    const { matched, unmatched } = pairBuys(sorted, existing);

    for (const { buy, entry } of matched) {
      if (!entry.deleted && !entry.edited && entry.amountPaise !== sorted[buy].amountPaise) {
        // Not through updated_at, so the entry does not look as if the owner changed it.
        await db.run("UPDATE transactions SET amount_paise = ? WHERE id = ?", [sorted[buy].amountPaise, entry.id]);
        result.updated++;
      } else result.same++;
    }

    if (unmatched.length === 0) continue;
    if (!options.add || date.slice(0, 7) !== options.month) {
      result.older += unmatched.length;
      continue;
    }
    const target = await fundsGroupFor(db, date.slice(0, 7));
    if (target === null) {
      result.noGroup += unmatched.length;
      continue;
    }
    for (const index of unmatched) {
      const buy = sorted[index];
      const key = freeKey(isin, date, buy.amountPaise, used);
      used.add(key);
      const text = entryText(buy);
      await db.run(
        `INSERT INTO transactions (id, dedupe_key, source, status, group_id, txn_date, direction, amount_paise, category, subcategory, payee, description, classified_by)
         VALUES (?, ?, 'manual', 'ACTIVE', ?, ?, 'debit', ?, ?, ?, ?, ?, ?)`,
        [newId(), key, target, date, buy.amountPaise, ENTRY_CATEGORY, ENTRY_SUBCATEGORY, text.payee, text.description, ENTRY_CLASSIFIED_BY],
      );
      result.added++;
    }
  }
  return result;
}

// The purchases that confirmation emails told about and no CAS has covered yet, as entries to place (used when the Savings page opens, so an entry
// whose month group was only made later is added then).
export async function waitingBuys(db: SqlDb): Promise<FundBuy[]> {
  return (await db.all<{ isin: string; purchased_on: string; net_paise: number; stamp_paise: number; name: string | null }>(
    `SELECT p.isin, p.purchased_on, p.net_paise, p.stamp_paise,
            (SELECT h.name FROM savings_holdings h WHERE h.kind = 'mf' AND h.code = p.isin AND h.account = p.folio) AS name
     FROM savings_purchases p ORDER BY p.purchased_on, p.id`,
  )).map((r) => ({ isin: r.isin, date: r.purchased_on, amountPaise: r.net_paise + r.stamp_paise, name: r.name ?? "" }));
}

// The same for a CAS: its purchases, with each fund's name from the CAS itself.
export function casBuys(cas: { holdings: readonly { isin: string; name: string }[]; purchases: readonly { date: string; isin: string; amountPaise: number }[] }): FundBuy[] {
  const names = new Map(cas.holdings.map((h) => [h.isin, h.name]));
  return cas.purchases.map((p) => ({ isin: p.isin, date: p.date, amountPaise: p.amountPaise, name: names.get(p.isin) ?? "" }));
}
