// "Create a group for this entry": the group a Main entry can create, its prefilled name and dates, the income it starts
// with, and the same for a duplicate of such an entry.

import type { Direction } from "./taxonomy";
import { INCOME_CATEGORY, INCOME_FALLBACK, type CategoryDef, type Classification } from "./masterData";

export interface GroupPlan {
  name: string;
  startDate: string | null;
  endDate: string | null;
}

const pad = (n: number) => String(n).padStart(2, "0");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// 2026-10-05 -> 2026-10-31
export function endOfMonth(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}`;
}

// The prefilled group: "Category - Subcategory", or the description (then the payee) when no category is chosen;
// it starts on the entry's date and ends on the last day of that month. All of it can be edited.
export function suggestGroup(e: {
  category: string;
  subcategory: string;
  description: string | null;
  payee: string | null;
  txnDate: string;
}): GroupPlan {
  const name =
    e.category && e.subcategory ? `${e.category} - ${e.subcategory}` : e.description?.trim() || e.payee?.trim() || "";
  return { name, startDate: e.txnDate, endDate: endOfMonth(e.txnDate) };
}

// "Bengaluru" -> "Bengaluru Dec 2026" for a copy dated in December 2026. A month label already on the name is replaced,
// so repeated duplicates do not pile them up.
export function copyGroupName(baseName: string, isoDate: string): string {
  const [y, m] = isoDate.split("-").map(Number);
  const base = baseName.replace(/\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}$/, "").trim();
  return `${base} ${MONTHS[m - 1]} ${y}`.trim();
}

// One error text (or null) per planned group: a name is needed, it must not match an existing group or another new one,
// and the end date cannot be before the start date.
export function validateNewGroups(plans: readonly GroupPlan[], existingNames: readonly string[]): (string | null)[] {
  const taken = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  const seen = new Set<string>();
  return plans.map((p) => {
    const name = p.name.trim();
    if (!name) return "Enter a name for the group";
    const key = name.toLowerCase();
    if (taken.has(key)) return "A group with this name already exists. Change the name.";
    if (seen.has(key)) return "Another new group has this name. Change the name.";
    seen.add(key);
    if (p.startDate && p.endDate && p.endDate < p.startDate) return "The end date must be on or after the start date";
    return null;
  });
}

// The income a new group starts with. The group id is filled in when it is saved.
export interface OpeningIncome {
  txnDate: string;
  direction: Direction;
  amountPaise: number;
  category: string;
  subcategory: string;
  payee: string;
  paymentMethod: string | null;
  description: string | null;
}

// "Account Transfer" under Income when the owner still has it, otherwise Income : Others (always present).
export function incomeClassFor(categories: readonly CategoryDef[]): Classification {
  const income = categories.find((c) => c.category === INCOME_CATEGORY);
  return income?.subcategories.includes("Account Transfer")
    ? { category: INCOME_CATEGORY, subcategory: "Account Transfer" }
    : INCOME_FALLBACK;
}

export function openingIncomeFor(
  entry: { txnDate: string; amountPaise: number; paymentMethod: string | null; payee: string; description: string | null },
  incomeClass: Classification,
): OpeningIncome {
  return {
    txnDate: entry.txnDate,
    direction: "credit",
    amountPaise: entry.amountPaise,
    category: incomeClass.category,
    subcategory: incomeClass.subcategory,
    payee: "Main",
    paymentMethod: entry.paymentMethod,
    description: entry.description || entry.payee || null,
  };
}
