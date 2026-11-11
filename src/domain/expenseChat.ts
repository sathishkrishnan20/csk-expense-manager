import { monthRange, toISODate } from "./format";
import { MAX_SUBCATEGORY_DESCRIPTION, cleanDescription, type CategoryDef } from "./masterData";
import { acceptSuggestion, suggestionStatus, type SuggestionStatus } from "./suggestions";

// The "Ask AI" page: questions about your own spending, answered by the AI you chose in Config. This file holds the parts that need no
// phone: the periods to choose from, what a conversation is, and how much of it is sent.

// A category and subcategory the AI thinks fits better than anything in the list. It is only added to the list when the owner approves.
export interface ChatProposal {
  category: string;
  subcategory: string;
  description: string; // what belongs in it, for the subcategory's description; may be empty
  status: Exclude<SuggestionStatus, "existing">; // a new category, or a new subcategory in a category that is there
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  proposal?: ChatProposal; // an assistant message may carry one
  toolsUsed?: string[]; // what the AI looked at to answer, shown under it
}

// What the model sent as a proposal, or null when there is none or it cannot be used (names missing or too long, Income or Others, or
// already in the list, in which case there is nothing to add).
export function acceptProposal(
  master: readonly CategoryDef[],
  rawCategory: unknown,
  rawSubcategory: unknown,
  rawDescription: unknown,
): ChatProposal | null {
  const suggestion = acceptSuggestion(master, "debit", rawCategory, rawSubcategory);
  if (!suggestion) return null;
  const status = suggestionStatus(master, suggestion);
  if (status === "existing") return null;
  const description = cleanDescription(typeof rawDescription === "string" ? rawDescription : "").slice(0, MAX_SUBCATEGORY_DESCRIPTION).trim();
  return { ...suggestion, description, status };
}

// What was bought, for the AI: the text the account holder wrote for an entry (its description, or failing that the UPI note), summed per
// subcategory. Without it the AI only knows totals and cannot say which snacks, or which shop, the money went to.
export const MAX_ITEMS_PER_SUBCATEGORY = 8;
export const MAX_ITEM_CHARS = 60;

export interface SpendItem {
  label: string;
  totalPaise: number;
  count: number;
}

export interface ItemRow extends SpendItem {
  category: string;
  subcategory: string;
}

export const itemKey = (category: string, subcategory: string): string => `${category}\u0000${subcategory}`;

// `rows` come largest first. Keeps the largest few items of each subcategory, each label on one line and cut to a length.
export function itemsBySubcategory(rows: readonly ItemRow[]): Map<string, SpendItem[]> {
  const out = new Map<string, SpendItem[]>();
  for (const r of rows) {
    const label = r.label.replace(/\s+/g, " ").trim();
    if (!label) continue;
    const key = itemKey(r.category, r.subcategory);
    const items = out.get(key) ?? [];
    if (items.length >= MAX_ITEMS_PER_SUBCATEGORY) continue;
    items.push({ label: label.length > MAX_ITEM_CHARS ? `${label.slice(0, MAX_ITEM_CHARS)}…` : label, totalPaise: r.totalPaise, count: r.count });
    out.set(key, items);
  }
  return out;
}

// Every entry of the chosen groups and period, as the AI sees it when "Share every transaction" is on (the default). Not the bank narration,
// the UPI id or any internal id: the narration only repeats the payee, the UPI id and the note.
export interface ChatEntry {
  date: string; // yyyy-mm-dd
  direction: "debit" | "credit";
  amountPaise: number;
  category: string;
  subcategory: string;
  payee: string | null;
  paymentMethod: string | null;
  description: string | null;
  note: string | null; // the UPI note
  balancePaise: number | null; // the bank balance after it, for imported entries
  groupName: string | null; // set when the page covers several groups
}

export interface ChatEntries {
  entries: ChatEntry[]; // newest first
  total: number; // how many there are in the period, of which `entries` are the newest
}

// How many entries go with one question. About 45 tokens each, so 600 is roughly 27,000 tokens; a model on your own computer (Ollama) has
// a much smaller window, so it gets fewer. Narrow the period to have the AI see everything in it.
export const MAX_DETAIL_ENTRIES = 600;
export const MAX_DETAIL_ENTRIES_LOCAL = 100;
export const detailLimit = (local: boolean): number => (local ? MAX_DETAIL_ENTRIES_LOCAL : MAX_DETAIL_ENTRIES);

// The one place the Ask AI page says where the data goes, so the wording follows the AI chosen in Config. `kinds` are the titles of the kinds of
// data the AI can look at (Expenses, Gifts, ...). There are no switches: the owner is the one asking, and the page says plainly what that sends.
export function privacyNote(providerLabel: string, local: boolean, kinds: readonly string[]): string {
  const where = local
    ? `${providerLabel}, the AI on your own computer, so nothing leaves your network`
    : `${providerLabel}, the AI you chose in Config`;
  const tail = local
    ? ""
    : " For full privacy choose Ollama in Config > AI, which runs on your own computer. What the AI company does with data is set by its own settings (for example on your Google account for Gemini); this app cannot change them.";
  return `When you ask, the AI can look things up in the data on this phone: ${kinds.join(", ")}. The app first sends only your question, your category names and a list of what the AI may look up, to ${where}. The AI then asks the app for what the question needs, and only what those lookups return (totals, lists and single payments, up to 50 at a time) is sent too. If the AI cannot follow that exchange, the app instead sends a summary of your expenses and up to ${detailLimit(local)} of the newest entries. Bank narrations, UPI ids and account ids are never sent.${tail}`;
}

export type ChatPeriod = "this_month" | "last_month" | "last_3_months" | "this_year" | "all";

export const CHAT_PERIODS: { value: ChatPeriod; label: string }[] = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last_3_months", label: "Last 3 months" },
  { value: "this_year", label: "This year" },
  { value: "all", label: "All time" },
];

export const DEFAULT_CHAT_PERIOD: ChatPeriod = "last_3_months";

export const chatPeriodLabel = (period: ChatPeriod): string => CHAT_PERIODS.find((p) => p.value === period)?.label ?? "";

// First and last day (yyyy-mm-dd) of the period, counted in whole calendar months, today's month included.
export function chatPeriodRange(period: ChatPeriod, today: Date): { start: string; end: string } {
  const y = today.getFullYear();
  const m = today.getMonth();
  switch (period) {
    case "this_month":
      return monthRange(today);
    case "last_month":
      return monthRange(new Date(y, m - 1, 1));
    case "last_3_months":
      return { start: toISODate(new Date(y, m - 2, 1)), end: monthRange(today).end };
    case "this_year":
      return { start: toISODate(new Date(y, 0, 1)), end: toISODate(new Date(y, 11, 31)) };
    case "all":
      return { start: "0000-01-01", end: "9999-12-31" };
  }
}

// What of the conversation is sent with each question: the most recent messages, each cut to a length. Older turns are dropped so a long
// chat does not grow the request (and its cost) without limit.
export const MAX_CHAT_TURNS = 12;
export const MAX_MESSAGE_CHARS = 1500;
export const MAX_QUESTION_CHARS = 1000;

export function recentTurns(history: readonly ChatMessage[]): ChatMessage[] {
  return history.slice(-MAX_CHAT_TURNS).map((m) => ({
    role: m.role,
    text: m.text.length > MAX_MESSAGE_CHARS ? `${m.text.slice(0, MAX_MESSAGE_CHARS)}…` : m.text,
  }));
}

// Example questions shown before the first message; tapping one fills the box.
export const EXAMPLE_QUESTIONS: string[] = [
  "I bought a phone cover for ₹250. Which category and subcategory should I use?",
  "How much did I spend on snacks last month, and on what?",
  "Where am I spending the most, and what can I cut down on?",
  "How much gold do I have, and how much of it is pledged?",
  "What did we receive at the marriage, and from whom?",
  "When does booking open for my next train journey?",
];
