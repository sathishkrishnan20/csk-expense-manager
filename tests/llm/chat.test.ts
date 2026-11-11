import assert from "node:assert/strict";
import test from "node:test";
import type { SpendingSummary } from "../../src/db/transactions";
import { askExpenseChat, buildChatSystemPrompt, buildChatUserPrompt, CHAT_SCHEMA, type ChatContext } from "../../src/llm/chat";
import type { ChatEntries } from "../../src/domain/expenseChat";
import type { CategoryDef } from "../../src/domain/masterData";

const CATEGORIES: CategoryDef[] = [
  {
    category: "Food & Groceries",
    subcategories: ["Snacks", "Chaats"],
    descriptions: { Chaats: "Dikky poori, Panipuri" },
  },
  { category: "Personal and Family Care", subcategories: ["Clothing", "Gift"] },
  { category: "Income", subcategories: ["Salary"] },
  { category: "Others", subcategories: ["Uncategorised"] },
];

const SUMMARY: SpendingSummary = {
  incomePaise: 5_000_000,
  expensePaise: 1_234_500,
  byCategory: [
    {
      category: "Food & Groceries",
      subcategory: "Snacks",
      totalPaise: 123_400,
      count: 1,
      items: [{ label: "Jumbo Sweets mixture", totalPaise: 44_500, count: 1 }],
    },
    { category: "Personal and Family Care", subcategory: "Clothing", totalPaise: 500_000, count: 3, items: [] },
  ],
  months: [
    { month: "2026-10", expensePaise: 600_000 },
    { month: "2026-11", expensePaise: 634_500 },
  ],
  topPayees: [
    { payee: "SAVO MART", totalPaise: 90_000 },
    { payee: "Rest", totalPaise: 10_000 },
  ],
};

const CTX: ChatContext = { scopeLabel: "Main", periodLabel: "Last 3 months", start: "2026-09-01", end: "2026-11-30", today: "2026-11-11" };

test("the prompt carries the spending data and lists category names apart from their descriptions", () => {
  const prompt = buildChatSystemPrompt(CATEGORIES, SUMMARY, CTX);
  assert.match(prompt, /Spending data for Main, Last 3 months \(2026-09-01 to 2026-11-30\)/);
  assert.match(prompt, /Money received: ₹50,000\.00\. Money spent: ₹12,345\.00\./);
  assert.match(prompt, /- Personal and Family Care : Clothing: ₹5,000\.00 \(3 entries\)/);
  assert.match(prompt, /- Food & Groceries : Snacks: ₹1,234\.00 \(1 entry\)/);
  assert.match(prompt, /- 2026-11: ₹6,345\.00/);
  assert.match(prompt, /- SAVO MART: ₹900\.00/);
  assert.match(prompt, /All other payees together: ₹100\.00/);
  // names and descriptions are apart, so the model cannot answer with the two together
  assert.match(prompt, /- Food & Groceries: Snacks, Chaats\n/);
  assert.match(prompt, /- Food & Groceries > Chaats: Dikky poori, Panipuri/);
  assert.doesNotMatch(prompt, /Chaats \(/);
  // expenses are filed under expense categories only
  assert.doesNotMatch(prompt, /- Income: Salary/);
  assert.match(prompt, /Today is 2026-11-11/);
});

test("what the account holder wrote for entries is listed under its subcategory, and the model is told to use it", () => {
  const prompt = buildChatSystemPrompt(CATEGORIES, SUMMARY, CTX);
  assert.match(prompt, /- Food & Groceries : Snacks: ₹1,234\.00 \(1 entry\)\n    item "Jumbo Sweets mixture": ₹445\.00 \(1\)\n/);
  // a subcategory without any text has no item line
  assert.doesNotMatch(prompt, /Clothing: ₹5,000\.00 \(3 entries\)\n    item/);
  assert.match(prompt, /or the item lines under a subcategory when there is no list of entries/);
  assert.match(prompt, /so do not claim to know/);
});

const ENTRIES: ChatEntries = {
  total: 3,
  entries: [
    {
      date: "2026-11-03",
      direction: "debit",
      amountPaise: 3500,
      category: "Food & Groceries",
      subcategory: "Chaats",
      payee: "Kaveri condimen",
      paymentMethod: "UPI",
      description: "Panipuri",
      note: "panipuri",
      balancePaise: 1_368_865,
      groupName: null,
    },
    {
      date: "2026-11-02",
      direction: "debit",
      amountPaise: 1000,
      category: "Home office",
      subcategory: "Stationary",
      payee: "SRI LAKSHM",
      paymentMethod: null,
      description: null,
      note: "ballpoint",
      balancePaise: null,
      groupName: "Goa trip",
    },
    {
      date: "2026-11-01",
      direction: "credit",
      amountPaise: 25_000_000,
      category: "Income",
      subcategory: "Salary",
      payee: "Blend",
      paymentMethod: "Cash",
      description: "  Oct   salary\n ",
      note: null,
      balancePaise: null,
      groupName: null,
    },
  ],
};

test("with the entries shared, every one is listed on a line of its own, newest first, with what was written for it", () => {
  const prompt = buildChatSystemPrompt(CATEGORIES, SUMMARY, CTX, ENTRIES);
  assert.match(prompt, /Every entry in this period, newest first \(all 3\)/);
  assert.match(
    prompt,
    /- 2026-11-03 \| spent \| ₹35\.00 \| Food & Groceries : Chaats \| payee: Kaveri condimen \| via: UPI \| description: Panipuri \| balance after: ₹13,688\.65\n/,
  );
  // a note that only repeats the description is left out; one that adds something stays; empty fields are left out
  assert.doesNotMatch(prompt, /note: panipuri/);
  assert.match(prompt, /- 2026-11-02 \| spent \| ₹10\.00 \| Home office : Stationary \| payee: SRI LAKSHM \| note: ballpoint \| group: Goa trip\n/);
  assert.match(prompt, /- 2026-11-01 \| received \| ₹2,50,000\.00 \| Income : Salary \| payee: Blend \| via: Cash \| description: Oct salary/);
  // the entries carry what the item lines would, so those are not sent twice
  assert.doesNotMatch(prompt, /item "/);
  // never the bank's narration, UPI id or any id
  assert.doesNotMatch(prompt, /UPI\/|@ybl|upi:/);
});

test("a list cut short says so, and that the totals still cover everything", () => {
  const prompt = buildChatSystemPrompt(CATEGORIES, SUMMARY, CTX, { ...ENTRIES, total: 900 });
  assert.match(prompt, /the newest 3 of 900; older ones are not listed, but the totals above include them/);
  assert.match(prompt, /suggest a shorter period/);
});

test("with sharing off there is no entry list, and the largest items are sent instead", () => {
  const off = buildChatSystemPrompt(CATEGORIES, SUMMARY, CTX, null);
  assert.doesNotMatch(off, /Every entry in this period/);
  assert.match(off, /item "Jumbo Sweets mixture"/);
  // an empty list is the same as none
  assert.doesNotMatch(buildChatSystemPrompt(CATEGORIES, SUMMARY, CTX, { entries: [], total: 0 }), /Every entry in this period/);
});

test("the prompt tells the model not to force a loose fit and to propose a better one for approval", () => {
  const prompt = buildChatSystemPrompt(CATEGORIES, SUMMARY, CTX);
  assert.match(prompt, /A loose or wrong fit is worse than none/);
  assert.match(prompt, /photo album/);
  assert.match(prompt, /proposedCategory and proposedSubcategory/);
  assert.match(prompt, /you never add anything yourself/);
  assert.match(prompt, /not investment, tax or legal advice/);
});

test("with no expenses the prompt says so, and a single month is not listed as a trend", () => {
  const prompt = buildChatSystemPrompt(CATEGORIES, { incomePaise: 0, expensePaise: 0, byCategory: [], months: [], topPayees: [] }, CTX);
  assert.match(prompt, /There are no expenses in this period/);
  assert.doesNotMatch(prompt, /Spent per month/);
});

test("the conversation goes as one message ending with the question to answer", () => {
  const text = buildChatUserPrompt([
    { role: "user", text: "Where am I spending most?" },
    { role: "assistant", text: "On clothing." },
    { role: "user", text: "And last month?" },
  ]);
  assert.match(text, /Account holder: Where am I spending most\?\nAssistant: On clothing\.\nAccount holder: And last month\?/);
  assert.match(text, /Reply to the account holder's last message\.$/);
});

test("the answer comes back with a usable proposal, or none", async () => {
  const history = [{ role: "user" as const, text: "I bought a photo album" }];
  const proposing = await askExpenseChat(
    async () => ({
      answer: " Photo albums are not a Gift. ",
      proposedCategory: "Personal and Family Care",
      proposedSubcategory: "Photo Albums",
      proposedDescription: "Albums, prints and frames",
    }),
    CATEGORIES,
    SUMMARY,
    CTX,
    history,
  );
  assert.equal(proposing.answer, "Photo albums are not a Gift.");
  assert.deepEqual(proposing.proposal, {
    category: "Personal and Family Care",
    subcategory: "Photo Albums",
    description: "Albums, prints and frames",
    status: "new-subcategory",
  });

  const plain = await askExpenseChat(
    async () => ({ answer: "Food & Groceries : Snacks.", proposedCategory: "", proposedSubcategory: "", proposedDescription: "" }),
    CATEGORIES,
    SUMMARY,
    CTX,
    history,
  );
  assert.equal(plain.proposal, null);

  // a proposal for a name already in the list, or for Others, is dropped but the answer stays
  const unusable = await askExpenseChat(
    async () => ({ answer: "Try Gift.", proposedCategory: "Personal and Family Care", proposedSubcategory: "Gift", proposedDescription: "" }),
    CATEGORIES,
    SUMMARY,
    CTX,
    history,
  );
  assert.equal(unusable.proposal, null);
});

test("an empty or malformed answer is an error to show, not a blank message", async () => {
  const ask = (raw: unknown) => askExpenseChat(async () => raw, CATEGORIES, SUMMARY, CTX, [{ role: "user", text: "hi" }]);
  await assert.rejects(() => ask({ answer: "  " }), /empty/);
  await assert.rejects(() => ask(null), /empty/);
  await assert.rejects(() => ask({ answer: 5 }), /empty/);
});

test("the schema requires every field, so a model always answers all of them", () => {
  const schema = CHAT_SCHEMA as { required: string[] };
  assert.deepEqual(schema.required, ["answer", "proposedCategory", "proposedSubcategory", "proposedDescription"]);
});
