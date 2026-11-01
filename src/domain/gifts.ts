// Gifts: what relatives gave at a function (marriage, hair offering, ...) and what was given back. Information only: nothing
// here touches transactions, groups, balances, charts, categories or the AI.
//
// A gift is one kind of thing: cash, gold, silver or something else. `value` is an integer in the smallest unit of `unit`:
// paise for INR, milligrams for g (so 2.25 g is stored as 2250 and there is no rounding drift). Gold and silver can also be
// written as a rupee amount ("2000 worth of silver"). `ratePaise` is the price of one gram on that day, kept when known so a
// gift can show what it was worth then.

import Papa from "papaparse";
import { formatRupees, parseAmountInput } from "./format";

export type GiftDirection = "received" | "given";
export type GiftType = "cash" | "gold" | "silver" | "other";
export type GiftUnit = "INR" | "g";

export const GIFT_DIRECTIONS: { value: GiftDirection; label: string }[] = [
  { value: "received", label: "Received" },
  { value: "given", label: "Given" },
];

export const GIFT_TYPES: { value: GiftType; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "gold", label: "Gold" },
  { value: "silver", label: "Silver" },
  { value: "other", label: "Other" },
];

export interface GiftFields {
  type: GiftType;
  value: number | null; // paise when unit is INR, milligrams when unit is g; null: no amount (a bangle)
  unit: GiftUnit;
  ratePaise: number | null; // price per gram that day, for gold and silver written in grams
  note: string | null;
}

// ---------------------------------------------------------------------------------------------
// Amounts

// "1.5" -> 1500 milligrams; null when it is not a positive number with at most three decimals.
export function parseGramsInput(text: string): number | null {
  const cleaned = text.replace(/,/g, "").trim();
  if (!/^\d+(\.\d{0,3})?$/.test(cleaned)) return null;
  const mg = Math.round(Number(cleaned) * 1000);
  return mg > 0 ? mg : null;
}

// 2250 -> "2.25 g", 3000 -> "3 g".
export const formatGrams = (mg: number): string => `${Number((mg / 1000).toFixed(3))} g`;

// Rupees without the ".00": ₹1,00,000.
export const rupeesText = (paise: number): string => formatRupees(paise).replace(/\.00$/, "");

// What an amount field shows when editing.
export const gramsInputText = (mg: number): string => String(Number((mg / 1000).toFixed(3)));
export const rupeesInputText = (paise: number): string => String(paise / 100);

// Cash and other things are counted in rupees; gold and silver in grams, or in rupees when only their worth is known.
export function normalizeUnit(type: GiftType, unit: GiftUnit): GiftUnit {
  return type === "gold" || type === "silver" ? unit : "INR";
}

const TYPE_WORD: Record<GiftType, string> = { cash: "cash", gold: "gold", silver: "silver", other: "other" };

// The gift in a few words: "3 g gold", "₹1,000", "₹2,000 worth of silver", "Bangle".
export function describeGift(g: Pick<GiftFields, "type" | "value" | "unit" | "note">): string {
  const hasValue = g.value !== null && g.value > 0;
  switch (g.type) {
    case "cash":
      return hasValue ? rupeesText(g.value!) : "Cash";
    case "gold":
    case "silver": {
      const word = TYPE_WORD[g.type];
      if (!hasValue) return word.charAt(0).toUpperCase() + word.slice(1);
      return g.unit === "g" ? `${formatGrams(g.value!)} ${word}` : `${rupeesText(g.value!)} worth of ${word}`;
    }
    case "other": {
      const title = g.note ?? "Other";
      return hasValue ? `${title} · ${rupeesText(g.value!)}` : title;
    }
  }
}

// An "other" gift already shows its note as its title.
export const showsNoteLine = (g: Pick<GiftFields, "type" | "note">): boolean => g.type !== "other" && !!g.note;

// What a gift in grams was worth on the day, when its price is known.
export function estimatedPaise(g: Pick<GiftFields, "type" | "value" | "unit"> & { ratePaise?: number | null }): number | null {
  if ((g.type !== "gold" && g.type !== "silver") || g.unit !== "g") return null;
  if (g.value === null || g.value <= 0 || g.ratePaise == null || g.ratePaise <= 0) return null;
  return Math.round((g.value * g.ratePaise) / 1000);
}

export type AmountResult =
  | { ok: true; value: number | null; unit: GiftUnit; ratePaise: number | null }
  | { ok: false; error: string };

// Reads the amount and price fields of the form.
export function readGiftAmounts(type: GiftType, chosenUnit: GiftUnit, valueText: string, rateText: string): AmountResult {
  const unit = normalizeUnit(type, chosenUnit);
  const text = valueText.trim();

  let value: number | null = null;
  if (text === "") {
    if (type === "cash") return { ok: false, error: "Enter the amount" };
    if (type === "gold" || type === "silver") return { ok: false, error: unit === "g" ? "Enter the weight in grams" : "Enter the amount" };
  } else if (unit === "g") {
    value = parseGramsInput(text);
    if (value === null) return { ok: false, error: "Weight should be a number of grams, such as 2.5" };
  } else {
    value = parseAmountInput(text);
    if (value === null) return { ok: false, error: "Amount should be a number, such as 1000" };
  }

  let ratePaise: number | null = null;
  if (rateText.trim() !== "" && (type === "gold" || type === "silver") && unit === "g") {
    ratePaise = parseAmountInput(rateText);
    if (ratePaise === null) return { ok: false, error: "Price per gram should be a number, such as 7500" };
  }
  return { ok: true, value, unit, ratePaise };
}

// ---------------------------------------------------------------------------------------------
// Totals

export interface GiftTotals {
  count: number;
  cashPaise: number;
  goldMg: number;
  goldWorthPaise: number; // gold written as a rupee amount
  silverMg: number;
  silverWorthPaise: number;
  otherCount: number;
  otherValuePaise: number;
  estimatedPaise: number; // gold and silver in grams that have a price: grams x that day's price
}

// Cash, gold and silver are never added together: there is no price feed, and the weights are what matters.
export function giftTotals(gifts: readonly (Pick<GiftFields, "type" | "value" | "unit"> & { ratePaise?: number | null })[]): GiftTotals {
  const t: GiftTotals = {
    count: gifts.length,
    cashPaise: 0,
    goldMg: 0,
    goldWorthPaise: 0,
    silverMg: 0,
    silverWorthPaise: 0,
    otherCount: 0,
    otherValuePaise: 0,
    estimatedPaise: 0,
  };
  for (const g of gifts) {
    const v = g.value ?? 0;
    if (g.type === "cash") t.cashPaise += v;
    else if (g.type === "gold") {
      if (g.unit === "g") t.goldMg += v;
      else t.goldWorthPaise += v;
    } else if (g.type === "silver") {
      if (g.unit === "g") t.silverMg += v;
      else t.silverWorthPaise += v;
    } else {
      t.otherCount++;
      t.otherValuePaise += v;
    }
    t.estimatedPaise += estimatedPaise(g) ?? 0;
  }
  return t;
}

// The lines a summary shows: "Cash ₹1,24,500", "Gold 57.75 g", ... Empty when there is nothing.
export function totalsLines(t: GiftTotals): string[] {
  const lines: string[] = [];
  if (t.cashPaise > 0) lines.push(`Cash ${rupeesText(t.cashPaise)}`);
  if (t.goldMg > 0) lines.push(`Gold ${formatGrams(t.goldMg)}`);
  if (t.goldWorthPaise > 0) lines.push(`Gold ${rupeesText(t.goldWorthPaise)}`);
  if (t.silverMg > 0) lines.push(`Silver ${formatGrams(t.silverMg)}`);
  if (t.silverWorthPaise > 0) lines.push(`Silver ${rupeesText(t.silverWorthPaise)}`);
  if (t.otherCount > 0) lines.push(t.otherValuePaise > 0 ? `${t.otherCount} other · ${rupeesText(t.otherValuePaise)}` : `${t.otherCount} other`);
  return lines;
}

// ---------------------------------------------------------------------------------------------
// Occasions

export const normaliseTitle = (title: string): string => title.trim().replace(/\s+/g, " ");

// The same name, ignoring case and spacing, is the same occasion.
export const occasionKey = (title: string): string => normaliseTitle(title).toLowerCase();

export function validateOccasionTitle(title: string): string | null {
  return normaliseTitle(title) === "" ? "Enter the occasion name" : null;
}

// ---------------------------------------------------------------------------------------------
// List filters and search

export type DirectionFilter = "all" | GiftDirection;

export interface GiftFilters {
  occasionId: string | null; // null: every occasion
  direction: DirectionFilter;
  search: string;
}

export const NO_GIFT_FILTERS: GiftFilters = { occasionId: null, direction: "all", search: "" };

export const hasGiftFilters = (f: GiftFilters): boolean => f.occasionId !== null || f.direction !== "all" || f.search.trim() !== "";

interface Searchable extends Pick<GiftFields, "type" | "value" | "unit" | "note"> {
  occasionId: string;
  occasionTitle: string;
  direction: GiftDirection;
  name: string;
}

// Name, occasion, note, and what the gift is ("gold", "3 g") all count, so "Kartheesan" lists everything he gave or received.
export function filterGifts<G extends Searchable>(gifts: readonly G[], f: GiftFilters): G[] {
  const words = f.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return gifts.filter((g) => {
    if (f.occasionId !== null && g.occasionId !== f.occasionId) return false;
    if (f.direction !== "all" && g.direction !== f.direction) return false;
    if (words.length === 0) return true;
    const haystack = `${g.name} ${g.occasionTitle} ${g.note ?? ""} ${describeGift(g)} ${g.type}`.toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
}

// ---------------------------------------------------------------------------------------------
// Reading a pasted list

export interface ParsedGiftText {
  type: GiftType;
  value: number | null;
  unit: GiftUnit;
  note: string | null;
  warning: string | null; // set when the text could not be read as an amount and was kept as a note
}

const GRAMS = /^(\d+(?:\.\d+)?)\s*(?:g|gm|gms|gram|grams)\b\s*(.*)$/i;
const WORTH = /^(?:₹|rs\.?\s*)?(\d[\d,]*(?:\.\d+)?)\s*(?:rs\.?|₹|rupees)?\s*worth\s+of\s+(.+)$/i;
const MONEY = /^(?:₹|rs\.?\s*|inr\s*)?(\d[\d,]*(?:\.\d+)?)\s*(?:rs\.?|₹|inr|rupees|\/-)?$/i;

const paiseOf = (digits: string): number => Math.round(Number(digits.replace(/,/g, "")) * 100);
const metalOf = (text: string): "gold" | "silver" | null => (/\bsilver\b/i.test(text) ? "silver" : /\bgold\b/i.test(text) ? "gold" : null);
const withoutMetal = (text: string): string | null => text.replace(/\b(gold|silver)\b/gi, " ").replace(/\s+/g, " ").trim() || null;

// "3Gram gold", "1.5G Gold", "1G" (gold), "100000Rs", "10000" (cash), "2000 worth of silver", "Bangle" (something else).
// Text with numbers that cannot be read ("1000 or 500") is kept as a note on an "other" gift with a warning.
export function parseGiftText(raw: string): ParsedGiftText {
  const text = raw.trim();
  const other = (note: string | null, warning: string | null = null): ParsedGiftText => ({ type: "other", value: null, unit: "INR", note, warning });
  if (text === "") return other(null);

  const grams = GRAMS.exec(text);
  if (grams) {
    const mg = Math.round(Number(grams[1]) * 1000);
    if (mg > 0) {
      const rest = grams[2];
      return { type: metalOf(rest) ?? "gold", value: mg, unit: "g", note: withoutMetal(rest), warning: null };
    }
  }

  const worth = WORTH.exec(text);
  if (worth) {
    const paise = paiseOf(worth[1]);
    const what = worth[2].trim();
    const metal = metalOf(what);
    if (paise > 0) {
      return metal
        ? { type: metal, value: paise, unit: "INR", note: withoutMetal(what), warning: null }
        : { type: "other", value: paise, unit: "INR", note: what, warning: null };
    }
  }

  const money = MONEY.exec(text);
  if (money) {
    const paise = paiseOf(money[1]);
    if (paise > 0) return { type: "cash", value: paise, unit: "INR", note: null, warning: null };
  }

  return other(text, /\d/.test(text) ? "Could not read an amount, kept as a note" : null);
}

export interface ParsedGift {
  line: number; // position in the pasted text, to tick and untick rows
  name: string;
  type: GiftType;
  value: number | null;
  unit: GiftUnit;
  note: string | null;
  warning: string | null;
  issue: string | null; // why the row cannot be added; null when it is fine
}

export interface ParsedOccasion {
  title: string; // "" when the list had gifts before any heading
  direction: GiftDirection;
  gifts: ParsedGift[];
}

// "Repaid", "Returned ..." are things given back.
export const directionForTitle = (title: string): GiftDirection => (/^\s*(repaid|returned?|given|gave|return\b)/i.test(title) ? "given" : "received");

const NAME_HEADERS = new Set(["name", "names", "person", "from", "to", "who"]);
const GIFT_HEADERS = new Set(["gift", "gifts", "item", "amount", "what", "details", "detail"]);

function splitCells(text: string): string[][] {
  const body = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const parsed = Papa.parse<string[]>(
    body,
    body.includes("\t")
      ? { skipEmptyLines: false, delimiter: "\t" }
      : { skipEmptyLines: false, delimitersToGuess: [",", ";"] },
  );
  return parsed.data.map((row) => {
    const cells = row.map((c) => c.trim());
    while (cells.length > 0 && cells[cells.length - 1] === "") cells.pop();
    return cells;
  });
}

// Reads a list written the way it is kept in a notebook or sheet. A line with only one cell is a heading (an occasion) when
// gifts follow it directly. Several such lines in a row are one heading (the first, plus the rest after a dash: "Hair Offering
// - Our home"). Lines with a name and a gift are gifts. A one-cell line followed by a blank line or the end is a name with no
// gift written, unless it is the first line of a new section with no heading yet. Blank lines separate sections.
export function parseGiftList(text: string): ParsedOccasion[] {
  const rows = splitCells(text);
  const blank = (r: string[] | undefined) => !r || r.length === 0;
  const oneCell = (r: string[]) => r.length === 1 && r[0] !== "";

  const occasions: ParsedOccasion[] = [];
  let current: ParsedOccasion | null = null;

  const open = (title: string): ParsedOccasion => {
    const o: ParsedOccasion = { title, direction: directionForTitle(title), gifts: [] };
    occasions.push(o);
    return o;
  };
  const add = (o: ParsedOccasion, line: number, name: string, giftText: string, extra: string) => {
    const g = parseGiftText(giftText);
    const note = [g.note, extra].filter(Boolean).join(" · ") || null;
    o.gifts.push({ line, name, type: g.type, value: g.value, unit: g.unit, note, warning: g.warning, issue: name === "" ? "No name" : null });
  };

  let first = true;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (blank(row)) continue;

    if (first) {
      first = false;
      // An optional header row such as "Name  Gift".
      if (row.length >= 2 && NAME_HEADERS.has(row[0].toLowerCase()) && GIFT_HEADERS.has(row[1].toLowerCase())) continue;
    }

    if (oneCell(row)) {
      const run: { line: number; text: string }[] = [];
      let j = i;
      while (j < rows.length && oneCell(rows[j])) run.push({ line: j, text: rows[j++][0] });
      const followedByGifts = j < rows.length && !blank(rows[j]);

      if (followedByGifts) {
        current = open(run.map((r) => r.text).join(" - "));
      } else if (current === null || run.length > 1) {
        current = open(run[0].text);
        for (const r of run.slice(1)) add(current, r.line, r.text, "", "");
      } else {
        add(current, run[0].line, run[0].text, "", "");
      }
      i = j - 1;
      continue;
    }

    current ??= open("");
    add(current, i, row[0], row[1] ?? "", row.slice(2).join(" "));
  }
  return occasions.filter((o) => o.gifts.length > 0);
}
