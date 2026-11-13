import { test } from "node:test";
import assert from "node:assert/strict";
import { CHAT_HISTORY_DAYS, fromRows, historyCutoff, sqliteUtcToMs, threadTitle, toRows } from "../../src/domain/chatHistory";
import { recentTurns, type ChatMessage } from "../../src/domain/expenseChat";

test("a chat is kept for 30 days: the cutoff is exactly 30 days before now, written the way SQLite writes its times", () => {
  assert.equal(CHAT_HISTORY_DAYS, 30);
  assert.equal(historyCutoff(new Date("2026-11-11T10:30:15Z")), "2026-10-12 10:30:15");
  assert.equal(historyCutoff(new Date("2026-03-05T00:00:00Z")), "2026-02-03 00:00:00"); // across a month end
  assert.equal(sqliteUtcToMs("2026-11-11 10:30:15"), Date.parse("2026-11-11T10:30:15Z"));
});

test("a chat is titled by the first thing the owner said, on one line and cut to a length", () => {
  assert.equal(threadTitle([{ role: "assistant", text: "Hi" }, { role: "user", text: "  How much on\n snacks   last month? " }]), "How much on snacks last month?");
  assert.equal(threadTitle([{ role: "user", text: "x".repeat(100) }]), `${"x".repeat(60)}…`);
  assert.equal(threadTitle([]), "Chat");
});

const LINES = [{ label: "Amount", value: "₹250.00" }, { label: "Paid to", value: "Tea stall" }];
const CHAT: ChatMessage[] = [
  { role: "user", text: "Add 250 for tea" },
  { role: "assistant", text: "Check it.", toolsUsed: ["Expenses", "Gifts"], action: { title: "Add an expense", lines: LINES, save: async () => "" } },
  { role: "assistant", text: "Saved. Added ₹250.00 expense." },
  { role: "user", text: "Which category for a photo album?" },
  { role: "assistant", text: "Photography.", proposal: { category: "Personal Care", subcategory: "Photography", description: "Photo shoots", status: "new-subcategory" } },
];

test("a chat becomes rows and comes back as it was, with each card's outcome and each proposal's state", () => {
  const rows = toRows(CHAT, (i) => (i === 1 ? "saved" : "not_saved"), (i) => (i === 4 ? "dismissed" : undefined));
  assert.deepEqual(rows.map((r) => r.seq), [0, 1, 2, 3, 4]);
  assert.equal(rows[1].toolsUsed, "Expenses\nGifts");
  assert.equal(rows[0].card, null);

  const back = fromRows([...rows].reverse()); // order comes from seq, not from the order given
  assert.deepEqual(back.messages.map((m) => m.text), CHAT.map((m) => m.text));
  assert.deepEqual(back.messages[1].toolsUsed, ["Expenses", "Gifts"]);
  assert.deepEqual(back.messages[1].pastCard, { title: "Add an expense", lines: LINES, outcome: "saved" });
  assert.equal(back.messages[1].action, undefined); // nothing in a restored card can be saved
  assert.equal(back.messages[4].proposal?.subcategory, "Photography");
  assert.deepEqual(back.proposals, { 4: "dismissed" });
  // and writing it again gives the same rows, so reading an old chat writes nothing
  assert.deepEqual(toRows(back.messages, () => "not_saved", (i) => back.proposals[i]), rows);
});

test("a row with damaged JSON comes back without the card or proposal instead of failing", () => {
  const rows = toRows(CHAT, () => "saved", () => undefined).map((r) => ({ ...r, card: r.card ? "{not json" : r.card, proposal: r.proposal ? '{"category":1}' : r.proposal }));
  const back = fromRows(rows);
  assert.equal(back.messages.length, 5);
  assert.ok(back.messages.every((m) => m.pastCard === undefined && m.proposal === undefined));
});

test("the AI is told about a card from an earlier visit, so it does not add the same thing again", () => {
  const rows = toRows(CHAT, () => "saved", () => undefined);
  const text = recentTurns(fromRows(rows).messages)[1].text;
  assert.match(text, /\[Card shown earlier \(accepted and saved\): Add an expense\. Amount: ₹250\.00; Paid to: Tea stall\]/);
});

test("how the owner answered a card is kept: accepted, rejected, or no decision", () => {
  const card = { title: "Add an expense", lines: LINES, save: async () => "" };
  const chat: ChatMessage[] = [
    { role: "assistant", text: "A", action: card },
    { role: "assistant", text: "B", action: card },
    { role: "assistant", text: "C", action: card },
  ];
  const outcomes = ["saved", "cancelled", "not_saved"] as const;
  const back = fromRows(toRows(chat, (i) => outcomes[i], () => undefined));
  assert.deepEqual(back.messages.map((m) => m.pastCard?.outcome), ["saved", "cancelled", "not_saved"]);
  const told = recentTurns(back.messages).map((m) => m.text);
  assert.match(told[1], /rejected by the owner, not saved/);
  assert.match(told[2], /no decision, not saved/);
});
