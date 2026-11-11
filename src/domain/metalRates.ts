import { formatRupeeAmount, fromISODate, toISODate } from "./format";

// Today's IBJA gold and silver rates, read from the rates API (rates/ibjaApi.ts). For daily viewing only: nothing here is tied to Assets,
// Gifts or the pledge tracker. Rates are whole rupees: gold per 10 grams, silver per kilogram. The API sends them as strings that can be
// empty or missing (the PM rate is blank early in the day), so everything is read defensively and a bad value becomes null ("—").

export type Session = "AM" | "PM";
export type GoldPurity = "999" | "995" | "916";
export const GOLD_PURITIES: GoldPurity[] = ["999", "995", "916"];

export interface SessionRates {
  am: number | null;
  pm: number | null;
}
export type GoldRates = Record<GoldPurity, SessionRates>;

export interface GoldDay {
  date: string; // yyyy-mm-dd
  rates: GoldRates;
}
export interface SilverDay {
  date: string;
  rate: SessionRates;
}
export interface HistoryDay {
  date: string;
  gold: GoldRates;
  silver: SessionRates;
}

// Everything the screen shows. `gold` and `silver` are the newest rate known for each metal (they can be different days: silver may
// still be yesterday's); `history` is the table, newest day first.
export interface RatesSnapshot {
  gold: GoldDay | null;
  silver: SilverDay | null;
  history: HistoryDay[];
}

// What is kept on the phone: the last good response and when it was fetched (ms since 1970).
export interface CachedRates {
  fetchedAt: number;
  snapshot: RatesSnapshot;
}

export const CACHE_MAX_AGE_MS = 60 * 60 * 1000;
export const MAX_HISTORY_DAYS = 5;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const emptySession = (): SessionRates => ({ am: null, pm: null });
const emptyGold = (): GoldRates => ({ "999": emptySession(), "995": emptySession(), "916": emptySession() });
const hasSession = (s: SessionRates) => s.am !== null || s.pm !== null;
const hasGold = (g: GoldRates) => GOLD_PURITIES.some((p) => hasSession(g[p]));

// "126020" -> 126020. Empty, missing, non-numeric, zero and negative values are null.
export function parseRate(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(/,/g, "").trim() || NaN) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

// "2026-11-03" stays as it is; anything that is not a real calendar date is null.
export function parseIsoDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return toISODate(fromISODate(value)) === value ? value : null;
}

// "03/11/2026" (day first, as the history list writes it) -> "2026-11-03".
export function parseIndianDate(value: unknown): string | null {
  const match = typeof value === "string" ? /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim()) : null;
  return match ? parseIsoDate(`${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`) : null;
}

// The /latest response: gold with a date and AM/PM rates per purity. Null when it has no date or no usable rate.
export function parseLatestGold(json: unknown): GoldDay | null {
  if (!isRecord(json)) return null;
  const date = parseIsoDate(json.date);
  if (!date) return null;
  const rates = emptyGold();
  for (const p of GOLD_PURITIES) rates[p] = { am: parseRate(json[`lblGold${p}_AM`]), pm: parseRate(json[`lblGold${p}_PM`]) };
  return hasGold(rates) ? { date, rates } : null;
}

// The /silver/latest response. It can carry the most recent earlier day's rate when today's is not out yet.
export function parseLatestSilver(json: unknown): SilverDay | null {
  if (!isRecord(json)) return null;
  const date = parseIsoDate(json.date);
  if (!date) return null;
  const rate = { am: parseRate(json.lblSilver999_AM), pm: parseRate(json.lblSilver999_PM) };
  return hasSession(rate) ? { date, rate } : null;
}

// The /history response: `am` and `pm` lists of days, each with gold_999 / gold_995 / gold_916 and silver_999. The two lists are joined by
// date. Days without a readable date or any rate are left out. Newest first.
export function parseHistory(json: unknown): HistoryDay[] {
  if (!isRecord(json)) return [];
  const days = new Map<string, HistoryDay>();
  for (const [list, key] of [[json.am, "am"], [json.pm, "pm"]] as const) {
    if (!Array.isArray(list)) continue;
    for (const row of list) {
      if (!isRecord(row)) continue;
      const date = parseIndianDate(row.date);
      if (!date) continue;
      let day = days.get(date);
      if (!day) days.set(date, (day = { date, gold: emptyGold(), silver: emptySession() }));
      for (const p of GOLD_PURITIES) day.gold[p][key] = parseRate(row[`gold_${p}`]);
      day.silver[key] = parseRate(row.silver_999);
    }
  }
  return sortNewestFirst([...days.values()].filter((d) => hasGold(d.gold) || hasSession(d.silver)));
}

const sortNewestFirst = (days: HistoryDay[]) => [...days].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

// ---- The three requests, and what became of each ----

export type Part<T> = { status: "ok"; value: T } | { status: "unavailable" } | { status: "failed" };
// "unavailable": the server answered but has nothing (a 404 before the day's rates are out, an empty list). "failed": no usable answer
// (no network, a timeout, a server error, a body that is not JSON).
export interface FetchedParts {
  gold: Part<GoldDay>;
  silver: Part<SilverDay>;
  history: Part<HistoryDay[]>;
}

const pick = (a: number | null, b: number | null) => a ?? b;
const mergeSession = (fresh: SessionRates, old: SessionRates): SessionRates => ({ am: pick(fresh.am, old.am), pm: pick(fresh.pm, old.pm) });

// The newest rate of each metal is the /latest answer when there was one, otherwise the newest history day that has it. The latest answers
// are also folded into the history table (a newer day than the list has, or fresher figures for a day it has).
export function buildSnapshot(gold: GoldDay | null, silver: SilverDay | null, history: HistoryDay[]): RatesSnapshot {
  const days = new Map(history.map((d) => [d.date, d]));
  const dayFor = (date: string): HistoryDay => days.get(date) ?? { date, gold: emptyGold(), silver: emptySession() };
  if (gold) {
    const day = dayFor(gold.date);
    const merged = emptyGold();
    for (const p of GOLD_PURITIES) merged[p] = mergeSession(gold.rates[p], day.gold[p]);
    days.set(gold.date, { ...day, gold: merged });
  }
  if (silver) {
    const day = dayFor(silver.date);
    days.set(silver.date, { ...day, silver: mergeSession(silver.rate, day.silver) });
  }
  const table = sortNewestFirst([...days.values()]).slice(0, MAX_HISTORY_DAYS);

  const fallbackGold = table.find((d) => hasGold(d.gold));
  const fallbackSilver = table.find((d) => hasSession(d.silver));
  return {
    gold: gold ?? (fallbackGold ? { date: fallbackGold.date, rates: fallbackGold.gold } : null),
    silver: silver ?? (fallbackSilver ? { date: fallbackSilver.date, rate: fallbackSilver.silver } : null),
    history: table,
  };
}

export type RefreshError = "network" | "unavailable";
export interface RefreshResult {
  cache: CachedRates | null; // the new cache, or the one passed in when nothing new could be had
  error: RefreshError | null; // set only when nothing new could be had; the screen then keeps showing `cache`
}

// What to keep after a fetch. The cache is only replaced by a complete picture: the history list came back, or both /latest answers did.
// Otherwise (no network, or only part of it) the previous cache stays, so a half-answer never wipes a metal from the screen. The table
// keeps the previous list when only /history failed.
export function applyFetch(previous: CachedRates | null, parts: FetchedParts, now: number): RefreshResult {
  const gold = parts.gold.status === "ok" ? parts.gold.value : null;
  const silver = parts.silver.status === "ok" ? parts.silver.value : null;
  const fresh = parts.history.status === "ok" ? parts.history.value : null;

  const complete = fresh !== null || (gold !== null && silver !== null);
  const snapshot = complete ? buildSnapshot(gold, silver, fresh ?? previous?.snapshot.history ?? []) : null;
  if (snapshot && (snapshot.gold || snapshot.silver)) return { cache: { fetchedAt: now, snapshot }, error: null };

  const anyFailed = [parts.gold, parts.silver, parts.history].some((p) => p.status === "failed");
  return { cache: previous, error: anyFailed ? "network" : "unavailable" };
}

export const isCacheFresh = (cache: CachedRates, now: number): boolean => now >= cache.fetchedAt && now - cache.fetchedAt < CACHE_MAX_AGE_MS;

// ---- Reading the cache back ----

function parseSession(v: unknown): SessionRates | null {
  if (!isRecord(v)) return null;
  const [am, pm] = [v.am, v.pm].map((x) => (x === null ? null : parseRate(x)));
  return { am, pm };
}

function parseGoldRates(v: unknown): GoldRates | null {
  if (!isRecord(v)) return null;
  const rates = emptyGold();
  for (const p of GOLD_PURITIES) {
    const session = parseSession(v[p]);
    if (!session) return null;
    rates[p] = session;
  }
  return rates;
}

function parseHistoryDay(v: unknown): HistoryDay | null {
  if (!isRecord(v)) return null;
  const date = parseIsoDate(v.date);
  const gold = parseGoldRates(v.gold);
  const silver = parseSession(v.silver);
  return date && gold && silver ? { date, gold, silver } : null;
}

// The saved text back to a cache; null when there is none or it is damaged (the screen then fetches as on a first open).
export function parseCachedRates(raw: string | null): CachedRates | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(v) || typeof v.fetchedAt !== "number" || !Number.isFinite(v.fetchedAt) || !isRecord(v.snapshot)) return null;
  const { gold, silver, history } = v.snapshot;

  let goldDay: GoldDay | null = null;
  if (gold !== null) {
    const rates = isRecord(gold) ? parseGoldRates(gold.rates) : null;
    const date = isRecord(gold) ? parseIsoDate(gold.date) : null;
    if (!rates || !date) return null;
    goldDay = { date, rates };
  }
  let silverDay: SilverDay | null = null;
  if (silver !== null) {
    const rate = isRecord(silver) ? parseSession(silver.rate) : null;
    const date = isRecord(silver) ? parseIsoDate(silver.date) : null;
    if (!rate || !date) return null;
    silverDay = { date, rate };
  }
  const days = Array.isArray(history) ? history.map(parseHistoryDay).filter((d): d is HistoryDay => d !== null) : [];
  return { fetchedAt: v.fetchedAt, snapshot: { gold: goldDay, silver: silverDay, history: sortNewestFirst(days) } };
}

// ---- Showing a rate ----

// PM is the current rate once it is out, otherwise AM; null when neither is.
export function currentRate(rate: SessionRates): { value: number; session: Session } | null {
  if (rate.pm !== null) return { value: rate.pm, session: "PM" };
  if (rate.am !== null) return { value: rate.am, session: "AM" };
  return null;
}

// Gold is quoted per 10 grams.
export const goldPerGram = (per10g: number): number => per10g / 10;
export const goldPer8g = (per10g: number): number => (per10g * 8) / 10;
// Silver is quoted per kilogram.
export const silverPerGram = (perKg: number): number => perKg / 1000;

export const isToday = (date: string, now: Date): boolean => date === toISODate(now);

export type Direction = "up" | "down" | "flat";
export interface Change {
  amount: number; // signed, in the same unit as the rates compared
  percent: number; // signed
  direction: Direction;
}

// How `to` moved from `from`; null when either is missing.
export function rateChange(from: number | null, to: number | null): Change | null {
  if (from === null || to === null || from <= 0) return null;
  const amount = to - from;
  return { amount, percent: (amount / from) * 100, direction: amount > 0 ? "up" : amount < 0 ? "down" : "flat" };
}

// "▲ ₹54.2 (0.39%)", "▼ ₹2,780 (1.57%)" or "No change".
export function formatChange(change: Change, maxDecimals: number): string {
  if (change.direction === "flat") return "No change";
  const arrow = change.direction === "up" ? "▲" : "▼";
  return `${arrow} ${formatRupeeAmount(Math.abs(change.amount), { max: maxDecimals })} (${Math.abs(change.percent).toFixed(2)}%)`;
}

export interface RateCell {
  value: number | null; // gold per gram, silver per kilogram
  change: Change | null; // against the previous trading day in the list
}
export interface HistoryRow {
  date: string;
  gold999: RateCell;
  gold916: RateCell;
  silver: RateCell;
}

// The table: one row per day, newest first, showing one session. Each change is against the next (older) row, so the oldest row has none.
export function historyRows(days: HistoryDay[], session: Session): HistoryRow[] {
  const key = session === "AM" ? "am" : "pm";
  const gold = (purity: GoldPurity) => (d: HistoryDay) => (d.gold[purity][key] === null ? null : goldPerGram(d.gold[purity][key]!));
  const silver = (d: HistoryDay) => d.silver[key];
  const cell = (read: (d: HistoryDay) => number | null, i: number): RateCell => {
    const value = read(days[i]);
    const older = days[i + 1];
    return { value, change: older ? rateChange(read(older), value) : null };
  };
  return days.map((d, i) => ({ date: d.date, gold999: cell(gold("999"), i), gold916: cell(gold("916"), i), silver: cell(silver, i) }));
}
