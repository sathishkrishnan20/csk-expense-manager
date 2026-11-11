import { parseAmountInput } from "./format";
import { describeQuantity, isPledged, type AssetFields } from "./assets";

// An exchange with a shop: old gold given back and new gold bought in its place. The pieces given go out of what you hold (their status is
// Sold) but stay on record, linked to the exchange, so you can always see which pieces you gave, which you bought at that time, the shop, the
// date and what you paid extra. The pieces bought are ordinary assets that carry the same exchange link. Information only: nothing here
// touches transactions, groups or balances (see domain/assets.ts).

export interface ExchangeFields {
  exchangeDate: string; // yyyy-mm-dd
  shop: string | null;
  extraPaise: number | null; // cash paid on top (making charges, the difference in price); none when not entered
  note: string | null;
}

export interface ExchangeFormInput {
  date: string | null;
  shop: string;
  extraText: string;
  note: string;
  givenIds: readonly string[];
}

export type ExchangeFormResult = { ok: true; fields: ExchangeFields; givenIds: string[] } | { ok: false; error: string };

const clean = (v: string): string | null => (v.trim() === "" ? null : v.trim());

// Reads the exchange form: a date, at least one piece given, and an extra amount that is a number when there is one.
export function readExchangeForm(f: ExchangeFormInput): ExchangeFormResult {
  if (f.givenIds.length === 0) return { ok: false, error: "Choose the pieces you gave to the shop" };
  if (!f.date) return { ok: false, error: "Choose the date" };
  let extraPaise: number | null = null;
  if (f.extraText.trim() !== "") {
    extraPaise = parseAmountInput(f.extraText);
    if (extraPaise === null) return { ok: false, error: "Extra amount should be a number, such as 2500" };
  }
  return { ok: true, fields: { exchangeDate: f.date, shop: clean(f.shop), extraPaise, note: clean(f.note) }, givenIds: [...new Set(f.givenIds)] };
}

// Only gold that is held and not pledged can be given: a pledged piece is with the lender, and has to be taken back first.
export const canGiveInExchange = (a: Pick<AssetFields, "type" | "status" | "lender">): boolean => a.type === "gold" && a.status === "ACTIVE" && !isPledged(a);

type Weighed = Pick<AssetFields, "quantity" | "unit">;

// The weight of the pieces in milligrams; pieces counted in anything else, or with no weight, add nothing.
export const gramsMg = (pieces: readonly Weighed[]): number => pieces.reduce((n, p) => n + (p.unit === "g" && p.quantity !== null ? p.quantity : 0), 0);

// A piece in a line: "Thishi - Bangles · 4 g · 22K".
export const describePiece = (a: Pick<AssetFields, "name" | "quantity" | "unit" | "purityK">): string =>
  [a.name, describeQuantity(a)].filter((p) => p !== "").join(" · ");

// What the exchange comes to in grams: given, bought, and the difference (positive when you got more gold than you gave).
export function exchangeWeights(given: readonly Weighed[], bought: readonly Weighed[]): { gaveMg: number; gotMg: number; moreMg: number } {
  const gaveMg = gramsMg(given);
  const gotMg = gramsMg(bought);
  return { gaveMg, gotMg, moreMg: gotMg - gaveMg };
}
