import { rateChange, type RateCell } from "./metalRates";

// The Nagercoil 22K/24K history served by our own backend (/api/gold-history): a JSON array, newest first. Prices are whole
// rupees per gram. Anything that does not look right is skipped; a body that is not an array gives an empty list.
export interface GoldHistoryRow {
  date: string; // yyyy-mm-dd
  price22k: number;
  price24k: number;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isPrice = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0;

export function parseGoldHistory(json: unknown): GoldHistoryRow[] {
  if (!Array.isArray(json)) return [];
  const rows: GoldHistoryRow[] = [];
  for (const item of json) {
    const r = item as Partial<GoldHistoryRow> | null;
    if (r && typeof r.date === "string" && DATE.test(r.date) && isPrice(r.price22k) && isPrice(r.price24k)) {
      rows.push({ date: r.date, price22k: r.price22k, price24k: r.price24k });
    }
  }
  return rows.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export interface GoldHistoryTableRow {
  date: string;
  price22k: RateCell;
  price24k: RateCell;
}

// The table: one row per day, newest first (as parseGoldHistory returns them), each with its change from the day before. The oldest row
// has nothing to compare with.
export function goldHistoryRows(rows: GoldHistoryRow[]): GoldHistoryTableRow[] {
  return rows.map((row, i) => {
    const older = rows[i + 1];
    return {
      date: row.date,
      price22k: { value: row.price22k, change: older ? rateChange(older.price22k, row.price22k) : null },
      price24k: { value: row.price24k, change: older ? rateChange(older.price24k, row.price24k) : null },
    };
  });
}
