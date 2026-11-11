import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_CHAT_TURNS,
  MAX_DETAIL_ENTRIES,
  MAX_DETAIL_ENTRIES_LOCAL,
  detailLimit,
  privacyNote,
  MAX_ITEMS_PER_SUBCATEGORY,
  MAX_ITEM_CHARS,
  MAX_MESSAGE_CHARS,
  acceptProposal,
  chatPeriodLabel,
  chatPeriodRange,
  itemKey,
  itemsBySubcategory,
  recentTurns,
  type ChatMessage,
} from "../../src/domain/expenseChat";
import type { CategoryDef } from "../../src/domain/masterData";

const MASTER: CategoryDef[] = [
  { category: "Personal and Family Care", subcategories: ["Clothing", "Donation", "Gift", "Child Care"] },
  { category: "Income", subcategories: ["Salary"] },
  { category: "Others", subcategories: ["Uncategorised"] },
];

test("periods are whole calendar months, today's month included", () => {
  const today = new Date(2026, 10, 11); // 11 Nov 2026
  assert.deepEqual(chatPeriodRange("this_month", today), { start: "2026-11-01", end: "2026-11-30" });
  assert.deepEqual(chatPeriodRange("last_month", today), { start: "2026-10-01", end: "2026-10-31" });
  assert.deepEqual(chatPeriodRange("last_3_months", today), { start: "2026-09-01", end: "2026-11-30" });
  assert.deepEqual(chatPeriodRange("this_year", today), { start: "2026-01-01", end: "2026-12-31" });
  const all = chatPeriodRange("all", today);
  assert.ok(all.start < "1970-01-01" && all.end > "2100-01-01");
});

test("periods that reach into the last year", () => {
  const today = new Date(2026, 0, 15); // 15 Jan 2026
  assert.deepEqual(chatPeriodRange("last_month", today), { start: "2025-12-01", end: "2025-12-31" });
  assert.deepEqual(chatPeriodRange("last_3_months", today), { start: "2025-11-01", end: "2026-01-31" });
  assert.equal(chatPeriodLabel("last_3_months"), "Last 3 months");
});

test("only the most recent turns go out, each cut to a length, without the proposals", () => {
  const history: ChatMessage[] = Array.from({ length: MAX_CHAT_TURNS + 5 }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    text: `message ${i}`,
  }));
  history[history.length - 1] = {
    role: "assistant",
    text: "x".repeat(MAX_MESSAGE_CHARS + 50),
    proposal: { category: "A", subcategory: "B", description: "", status: "new-category" },
  };
  const turns = recentTurns(history);
  assert.equal(turns.length, MAX_CHAT_TURNS);
  assert.equal(turns[0].text, "message 5");
  assert.equal(turns[turns.length - 1].text.length, MAX_MESSAGE_CHARS + 1); // the cut text and the "…"
  assert.ok(turns.every((t) => !("proposal" in t)));
});

test("a proposal for a new subcategory in a category that exists is accepted, with the list's own spelling", () => {
  assert.deepEqual(acceptProposal(MASTER, "personal and family care", "  Photo   Albums ", "Photo albums,\n frames and prints"), {
    category: "Personal and Family Care",
    subcategory: "Photo Albums",
    description: "Photo albums, frames and prints",
    status: "new-subcategory",
  });
});

test("a proposal for a new category is accepted and says so", () => {
  const p = acceptProposal(MASTER, "Photography", "Photoshoot", "");
  assert.equal(p?.status, "new-category");
  assert.equal(p?.description, "");
});

test("an empty, listed, protected or too long proposal is not offered", () => {
  assert.equal(acceptProposal(MASTER, "", "", ""), null); // nothing proposed
  assert.equal(acceptProposal(MASTER, "Personal and Family Care", "gift", ""), null); // already in the list
  assert.equal(acceptProposal(MASTER, "Income", "Bonus", ""), null); // Income is for credits
  assert.equal(acceptProposal(MASTER, "Others", "Photos", ""), null); // Others is the place for what has none
  assert.equal(acceptProposal(MASTER, "Photography", "x".repeat(41), ""), null);
  assert.equal(acceptProposal(MASTER, 5, { a: 1 }, null), null); // not text
});

test("a description is kept to one line and a length", () => {
  const p = acceptProposal(MASTER, "Photography", "Photoshoot", `a\n${"b".repeat(500)}`);
  assert.ok(p && p.description.length <= 200 && !p.description.includes("\n"));
});

test("items are kept largest first, a few per subcategory, one line each and cut to a length", () => {
  const rows = [
    ...Array.from({ length: MAX_ITEMS_PER_SUBCATEGORY + 3 }, (_, i) => ({
      category: "Food",
      subcategory: "Snacks",
      label: `snack ${i}`,
      totalPaise: 1000 - i,
      count: 1,
    })),
    { category: "Food", subcategory: "Chaats", label: "  Pani\n puri  ", totalPaise: 60, count: 2 },
    { category: "Food", subcategory: "Chaats", label: "x".repeat(200), totalPaise: 50, count: 1 },
    { category: "Food", subcategory: "Chaats", label: "   ", totalPaise: 40, count: 1 },
  ];
  const items = itemsBySubcategory(rows);
  const snacks = items.get(itemKey("Food", "Snacks"))!;
  assert.equal(snacks.length, MAX_ITEMS_PER_SUBCATEGORY);
  assert.deepEqual(snacks[0], { label: "snack 0", totalPaise: 1000, count: 1 });
  const chaats = items.get(itemKey("Food", "Chaats"))!;
  assert.equal(chaats.length, 2); // the blank one is left out
  assert.equal(chaats[0].label, "Pani puri");
  assert.equal(chaats[1].label.length, MAX_ITEM_CHARS + 1);
  assert.equal(items.get(itemKey("Food", "Fruits")), undefined);
});

test("a model on your own computer is sent fewer entries than a cloud one", () => {
  assert.equal(detailLimit(false), MAX_DETAIL_ENTRIES);
  assert.equal(detailLimit(true), MAX_DETAIL_ENTRIES_LOCAL);
  assert.ok(MAX_DETAIL_ENTRIES_LOCAL < MAX_DETAIL_ENTRIES);
});

test("the privacy note says plainly what the AI can look at, what is sent and where, with no switches", () => {
  const kinds = ["Expenses", "Assets", "Gifts", "Train journeys", "Groups"];
  const cloud = privacyNote("Gemini", false, kinds);
  assert.match(cloud, /the AI can look things up in the data on this phone: Expenses, Assets, Gifts, Train journeys, Groups\./);
  assert.match(cloud, /first sends only your question, your category names and a list of what the AI may look up, to Gemini, the AI you chose in Config/);
  assert.match(cloud, /only what those lookups return \(totals, lists and single payments, up to 50 at a time\) is sent too/);
  assert.match(cloud, /up to 600 of the newest entries/); // the fallback
  assert.match(cloud, /Ollama in Config > AI/);
  assert.match(cloud, /on your Google account for Gemini/);
  assert.match(cloud, /Bank narrations, UPI ids and account ids are never sent/);
  assert.doesNotMatch(cloud, /switch/i);

  const local = privacyNote("Ollama", true, kinds);
  assert.match(local, /up to 100 of the newest entries/);
  assert.match(local, /on your own computer, so nothing leaves your network/);
  assert.doesNotMatch(local, /Google account/);
});
