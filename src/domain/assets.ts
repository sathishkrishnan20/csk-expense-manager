// Assets: gold, land, mutual funds and anything else the owner holds. Information only: nothing here touches transactions,
// groups, balances, charts, categories or the AI, and nothing is valued (there is no current value, only what was paid).
//
// One row is one thing the owner can point at (a chain, a plot, a fund). `quantity` is an integer in thousandths of `unit`
// (milligrams for gold, so 2.25 g is 2250; 482.351 fund units is 482351), so there is no rounding drift.
//
// A piece is named by two dropdowns, not typed: **For** (whom it is for: a child, the wife, the family) and **Item** (what it is: a ring, an
// earring, a bangle). Both lists are the owner's own and grow whenever a new name is typed (stored in asset_options). The old free-text `name` is
// kept in the database and written as "For - Item" so older files and screens still read it; it is never typed any more.
//
// Gold can be pledged ("adagu") to a lender. A gold row is pledged when it has a lender, and the whole row is pledged: a piece
// is either with the owner or with the lender, so each physical piece is its own row. There is no loan history; taking the gold
// back clears the pledge fields.

import { formatLongDate, fromISODate, parseAmountInput } from "./format";
import { formatGrams, gramsInputText, parseGramsInput, rupeesText } from "./gifts";

export type AssetType = "gold" | "land" | "mutual_fund" | "other";
export type AssetStatus = "ACTIVE" | "SOLD" | "DELETED";
export type AssetUnit = "g" | "units" | "cent" | "acre" | "sqft" | "ground";

export const ASSET_TYPES: { value: AssetType; label: string }[] = [
  { value: "gold", label: "Gold" },
  { value: "land", label: "Land" },
  { value: "mutual_fund", label: "Mutual fund" },
  { value: "other", label: "Other" },
];

export const ASSET_UNITS: { value: AssetUnit; label: string }[] = [
  { value: "g", label: "Grams" },
  { value: "units", label: "Units" },
  { value: "cent", label: "Cent" },
  { value: "acre", label: "Acre" },
  { value: "sqft", label: "Sq ft" },
  { value: "ground", label: "Ground" },
];

// What follows the number: "12.5 g", "482.351 units", "5 cent".
const UNIT_WORD: Record<AssetUnit, string> = { g: "g", units: "units", cent: "cent", acre: "acre", sqft: "sq ft", ground: "ground" };

export const GOLD_PURITIES = [24, 22, 18] as const;

// The units a kind of asset is counted in. Gold is always in grams and a fund in units; land has a choice; other has no quantity.
export function unitsFor(type: AssetType): AssetUnit[] {
  switch (type) {
    case "gold":
      return ["g"];
    case "mutual_fund":
      return ["units"];
    case "land":
      return ["cent", "acre", "sqft", "ground"];
    case "other":
      return [];
  }
}

export const defaultUnit = (type: AssetType): AssetUnit | null => unitsFor(type)[0] ?? null;

export interface AssetFields {
  type: AssetType;
  forName: string | null; // whom it is for; optional
  item: string | null; // what it is (ring, earring...); the form needs it
  name: string; // always "For - Item", made here from the two; never typed
  // Set on a piece that was given to a shop in an exchange (status SOLD) and on a piece bought in one (status ACTIVE). See assetExchanges.ts.
  exchangeId: string | null;
  status: "ACTIVE" | "SOLD";
  quantity: number | null; // thousandths of `unit`
  unit: AssetUnit | null;
  purityK: number | null; // gold only
  investedPaise: number | null;
  acquiredDate: string | null; // yyyy-mm-dd
  description: string | null;
  // The pledge (gold only). The row is pledged when `lender` is set; the rest are optional.
  lender: string | null;
  ticketNo: string | null;
  pledgedDate: string | null;
  dueDate: string | null;
  loanPaise: number | null;
  pledgeNote: string | null;
}

export const isPledged = (a: Pick<AssetFields, "lender">): boolean => a.lender !== null && a.lender.trim() !== "";

const clean = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

// "Thishi - Bangles". Either part may be missing; both missing gives "".
export const assetName = (forName: string | null | undefined, item: string | null | undefined): string =>
  [clean(forName), clean(item)].filter((p): p is string => p !== null).join(" - ");

const DASH = /\s+[-\u2013\u2014]\s+/;

// Splits the name an asset had before For and Item existed, for the one-time change of the database and for old backup files. "Thishi - Bangles"
// is For Thishi, Item Bangles. A name with no dash is checked against the For names found in the other rows ("Thishi Ear Ring" starts with
// Thishi, a name that is already a For); one that matches none is all Item, to be corrected by hand. `known` are the For names seen in the
// rows that did have a dash, which is why the whole list is split together.
export function deriveForAndItem(names: readonly string[]): { forName: string | null; item: string | null }[] {
  const dashed = names.map((n) => {
    const parts = n.trim().split(DASH);
    return parts.length > 1 && parts[0].trim() !== "" ? { forName: parts[0].trim(), item: parts.slice(1).join(" - ").trim() } : null;
  });
  const known = new Map<string, string>();
  for (const d of dashed) if (d && !known.has(d.forName.toLowerCase())) known.set(d.forName.toLowerCase(), d.forName);
  const byLength = [...known.values()].sort((x, y) => y.length - x.length);

  return names.map((raw, i) => {
    const d = dashed[i];
    if (d) return { forName: d.forName, item: clean(d.item) };
    const name = raw.trim();
    const lower = name.toLowerCase();
    const match = byLength.find((f) => lower.startsWith(`${f.toLowerCase()} `));
    if (match) return { forName: match, item: clean(name.slice(match.length)) };
    return { forName: null, item: clean(name) };
  });
}

// Makes a row consistent: the unit follows the type, purity and a pledge exist only on gold, and a row with no lender has no
// pledge details left over. Used by the form and again by the database layer.
export function normaliseAsset(a: AssetFields): AssetFields {
  const units = unitsFor(a.type);
  const unit = units.length === 0 ? null : a.unit !== null && units.includes(a.unit) ? a.unit : units[0];
  const quantity = unit === null ? null : a.quantity;
  const gold = a.type === "gold";
  const lender = gold ? clean(a.lender) : null;
  const forName = clean(a.forName);
  const item = clean(a.item);
  return {
    type: a.type,
    forName,
    item,
    // a piece saved with no For or Item (an old file) keeps the name it came with
    name: assetName(forName, item) || a.name.trim(),
    exchangeId: clean(a.exchangeId),
    status: a.status,
    quantity,
    unit,
    purityK: gold ? a.purityK : null,
    investedPaise: a.investedPaise,
    acquiredDate: a.acquiredDate,
    description: clean(a.description),
    lender,
    ticketNo: lender ? clean(a.ticketNo) : null,
    pledgedDate: lender ? a.pledgedDate : null,
    dueDate: lender ? a.dueDate : null,
    loanPaise: lender ? a.loanPaise : null,
    pledgeNote: lender ? clean(a.pledgeNote) : null,
  };
}

// ---------------------------------------------------------------------------------------------
// Quantity and words

// 12500 -> "12.5 g", 482351 -> "482.351 units". Grams read the same as in Gifts.
export function formatQuantity(quantity: number, unit: AssetUnit): string {
  return unit === "g" ? formatGrams(quantity) : `${Number((quantity / 1000).toFixed(3))} ${UNIT_WORD[unit]}`;
}

// The right-hand side of a card: "12.5 g · 22K", "5 cent", "482.351 units". Empty when no quantity was entered.
export function describeQuantity(a: Pick<AssetFields, "quantity" | "unit" | "purityK">): string {
  if (a.quantity === null || a.unit === null) return a.purityK ? `${a.purityK}K` : "";
  const text = formatQuantity(a.quantity, a.unit);
  return a.purityK ? `${text} · ${a.purityK}K` : text;
}

export const typeLabel = (type: AssetType): string => ASSET_TYPES.find((t) => t.value === type)?.label ?? type;

// "Paid ₹70,000" for things bought, "Invested ₹1,00,000" for funds and the rest.
export function investedText(type: AssetType, paise: number): string {
  return `${type === "gold" || type === "land" ? "Paid" : "Invested"} ${rupeesText(paise)}`;
}

export const quantityInputText = (quantity: number): string => gramsInputText(quantity);
export const loanInputText = (paise: number): string => String(paise / 100);

// ---------------------------------------------------------------------------------------------
// Pledge on the card

const DAY_MS = 24 * 60 * 60 * 1000;

// "Due in 12 days", "Due today", "Overdue by 3 days"; months once it is more than two months away. `today` is yyyy-mm-dd.
export function dueText(due: string, today: string): string {
  const days = Math.round((fromISODate(due).getTime() - fromISODate(today).getTime()) / DAY_MS);
  const span = (n: number) => {
    if (n > 60) return `${Math.round(n / 30)} months`;
    return `${n} ${n === 1 ? "day" : "days"}`;
  };
  if (days === 0) return "Due today";
  return days > 0 ? `Due in ${span(days)}` : `Overdue by ${span(-days)}`;
}

// The first line of the pledge on a card: "Pledged · Muthoot".
export const pledgeTitle = (a: Pick<AssetFields, "lender">): string => `Pledged · ${a.lender}`;

// The small print under it: ticket number, the date it was pledged, and when it is due.
export function pledgeDetails(a: Pick<AssetFields, "ticketNo" | "pledgedDate" | "dueDate">, today: string): string[] {
  const parts: string[] = [];
  if (a.ticketNo) parts.push(`Ticket ${a.ticketNo}`);
  if (a.pledgedDate) parts.push(`Pledged ${formatLongDate(a.pledgedDate)}`);
  if (a.dueDate) parts.push(dueText(a.dueDate, today));
  return parts;
}

// ---------------------------------------------------------------------------------------------
// The form

export interface AssetFormInput {
  type: AssetType;
  forName: string;
  item: string;
  exchangeId: string | null;
  status: "ACTIVE" | "SOLD";
  quantityText: string;
  unit: AssetUnit | null;
  purityK: number | null;
  investedText: string;
  acquiredDate: string | null;
  description: string;
  pledged: boolean;
  lender: string;
  ticketNo: string;
  pledgedDate: string | null;
  dueDate: string | null;
  loanText: string;
  pledgeNote: string;
}

export type AssetFormResult = { ok: true; fields: AssetFields } | { ok: false; error: string };

// Reads what was chosen and typed. Only the Item is needed (what it is), and the lender when the gold is pledged.
export function readAssetForm(f: AssetFormInput): AssetFormResult {
  if (f.item.trim() === "") return { ok: false, error: "Choose what it is (Item)" };

  const units = unitsFor(f.type);
  let quantity: number | null = null;
  if (units.length > 0 && f.quantityText.trim() !== "") {
    quantity = parseGramsInput(f.quantityText);
    if (quantity === null) return { ok: false, error: `${f.type === "gold" ? "Weight" : "Quantity"} should be a number, such as 12.5` };
  }

  let investedPaise: number | null = null;
  if (f.investedText.trim() !== "") {
    investedPaise = parseAmountInput(f.investedText);
    if (investedPaise === null) return { ok: false, error: "Amount paid should be a number, such as 70000" };
  }

  const pledged = f.type === "gold" && f.pledged;
  let loanPaise: number | null = null;
  if (pledged) {
    if (f.lender.trim() === "") return { ok: false, error: "Enter who it is pledged to" };
    if (f.loanText.trim() !== "") {
      loanPaise = parseAmountInput(f.loanText);
      if (loanPaise === null) return { ok: false, error: "Loan amount should be a number, such as 50000" };
    }
    if (f.pledgedDate && f.dueDate && f.dueDate < f.pledgedDate) return { ok: false, error: "The due date is before the pledged date" };
  }

  return {
    ok: true,
    fields: normaliseAsset({
      type: f.type,
      forName: f.forName,
      item: f.item,
      name: "",
      exchangeId: f.exchangeId,
      status: f.status,
      quantity,
      unit: f.unit,
      purityK: f.purityK,
      investedPaise,
      acquiredDate: f.acquiredDate,
      description: f.description,
      lender: pledged ? f.lender : null,
      ticketNo: f.ticketNo,
      pledgedDate: f.pledgedDate,
      dueDate: f.dueDate,
      loanPaise,
      pledgeNote: f.pledgeNote,
    }),
  };
}

// ---------------------------------------------------------------------------------------------
// From a gift

interface GiftForAsset {
  direction: "received" | "given";
  type: string;
  unit: string;
  value: number | null;
}

// Only gold received, counted in grams, can be added to assets.
export const canAddToAssets = (g: GiftForAsset): boolean =>
  g.direction === "received" && g.type === "gold" && g.unit === "g" && g.value !== null && g.value > 0;

// What the asset form starts with for a gold gift: the gift's note names the piece ("Chain"), which becomes the Item (For is chosen by the
// owner), and the giver and function are the description.
export function draftFromGift(g: { name: string; note: string | null; value: number | null; occasionTitle: string; occasionDate: string }): {
  item: string;
  quantity: number | null;
  description: string;
  acquiredDate: string;
} {
  return {
    item: clean(g.note) ?? "Gold",
    quantity: g.value,
    description: `Gift from ${g.name} · ${g.occasionTitle}`,
    acquiredDate: g.occasionDate,
  };
}

// ---------------------------------------------------------------------------------------------
// List filters and search

// A piece given to a shop in an exchange: sold (it is no longer owned) and linked to the exchange. A plain sale has no exchange.
export const isGivenInExchange = (a: Pick<AssetFields, "status" | "exchangeId">): boolean => a.status === "SOLD" && a.exchangeId !== null;

export type AssetShow = "holding" | "pledged" | "sold" | "exchanged" | "all";

export const ASSET_SHOWS: { value: AssetShow; label: string }[] = [
  { value: "holding", label: "Holding" },
  { value: "pledged", label: "Pledged" },
  { value: "sold", label: "Sold" },
  { value: "exchanged", label: "Given in exchange" },
  { value: "all", label: "All" },
];

export interface AssetFilters {
  type: AssetType | null; // null: every type
  show: AssetShow;
  search: string;
  forName: string | null; // null: everyone
  item: string | null; // null: every item
}

export const NO_ASSET_FILTERS: AssetFilters = { type: null, show: "holding", search: "", forName: null, item: null };

export const hasAssetFilters = (f: AssetFilters): boolean =>
  f.type !== null || f.show !== "holding" || f.search.trim() !== "" || f.forName !== null || f.item !== null;

interface Searchable
  extends Pick<AssetFields, "type" | "forName" | "item" | "name" | "status" | "exchangeId" | "description" | "lender" | "ticketNo" | "pledgeNote"> {}

const sameText = (a: string | null, b: string | null): boolean => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

// For and Item, name, description, lender, ticket and note all count, and so does the kind ("gold", "mutual fund").
export function filterAssets<A extends Searchable>(assets: readonly A[], f: AssetFilters): A[] {
  const words = f.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return assets.filter((a) => {
    if (f.type !== null && a.type !== f.type) return false;
    if (f.forName !== null && !sameText(a.forName, f.forName)) return false;
    if (f.item !== null && !sameText(a.item, f.item)) return false;
    if (f.show === "holding" && a.status !== "ACTIVE") return false;
    if (f.show === "pledged" && (a.status !== "ACTIVE" || !isPledged(a))) return false;
    if (f.show === "sold" && (a.status !== "SOLD" || a.exchangeId !== null)) return false;
    if (f.show === "exchanged" && !isGivenInExchange(a)) return false;
    if (words.length === 0) return true;
    const haystack = `${a.forName ?? ""} ${a.item ?? ""} ${a.name} ${typeLabel(a.type)} ${a.description ?? ""} ${a.lender ?? ""} ${a.ticketNo ?? ""} ${a.pledgeNote ?? ""}`.toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
}
