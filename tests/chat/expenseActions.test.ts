import { test } from "node:test";
import assert from "node:assert/strict";
import { addTransactionAction, resolveGroup } from "../../src/chat/capabilities/expenseActions";
import { CAPABILITIES } from "../../src/chat/capabilities";
import type { ChatToolContext } from "../../src/chat/types";
import type { TransactionInput } from "../../src/db/transactions";
import { offeredActions, registryProblems, validateArgs, type PreparedAction, type ToolArgs } from "../../src/domain/chatTools";
import type { GroupWithBalance } from "../../src/domain/groups";
import type { CategoryDef } from "../../src/domain/masterData";

const CATEGORIES: CategoryDef[] = [
  { category: "Food & Groceries", subcategories: ["Snacks", "Chaats", "Others"] },
  { category: "Income", subcategories: ["Salary", "Gift received"] },
  { category: "Others", subcategories: ["Uncategorised"] },
];
const group = (id: string, name: string, status: "ACTIVE" | "CLOSED" = "ACTIVE"): GroupWithBalance => ({
  id, name, startDate: null, endDate: null, status, parentId: "main", pinned: false, heldPaise: 0, inPaise: 0, outPaise: 0, subgroupsInPaise: 0, subgroupsOutPaise: 0, subgroupsPaise: 0,
});
const GROUPS = [group("main", "Main"), group("goa", "Goa trip"), group("old", "Old trip", "CLOSED")];

function setup(pageGroupId = "main") {
  const written: TransactionInput[] = [];
  const ctx = {
    data: { groups: async () => GROUPS, categories: async () => CATEGORIES, paymentMethods: async () => ["UPI", "Cash"] },
    writes: { addTransaction: async (i: TransactionInput) => void written.push(i) },
    pageGroupId,
    now: new Date(2026, 10, 11, 12, 0),
  } as unknown as ChatToolContext;
  return { ctx, written };
}

async function prepare(raw: object, ctx: ChatToolContext): Promise<{ prepared: PreparedAction } | { problem: string }> {
  const checked = validateArgs(addTransactionAction.args, raw);
  if (!checked.ok) return { problem: checked.error };
  const outcome = await addTransactionAction.prepare((checked as { args: ToolArgs }).args, ctx);
  return outcome.ok ? { prepared: outcome.prepared } : { problem: outcome.problem };
}

test("the feature list keeps the rules with the add action in it", () => {
  assert.deepEqual(registryProblems(CAPABILITIES), []);
  assert.deepEqual(offeredActions(CAPABILITIES).map((a) => a.action.name).sort(), ["add_asset", "add_gift", "add_train_journey", "add_transaction"]);
});

test("an expense is prepared with the page's group, today's date and a category from the owner's list, and written only by save", async () => {
  const { ctx, written } = setup("goa");
  const r = await prepare({ amount: "250", payee: "Tea stall", description: "tea", category: "food & groceries", subcategory: "SNACKS", payment_method: "upi" }, ctx);
  assert.ok("prepared" in r);
  const lines = Object.fromEntries(r.prepared.lines.map((l) => [l.label, l.value]));
  assert.deepEqual(lines, {
    Amount: "₹250.00",
    "Paid to": "Tea stall",
    Category: "Food & Groceries : Snacks",
    Group: "Goa trip",
    Date: lines.Date,
    "Paid by": "UPI",
    For: "tea",
  });
  assert.match(lines.Date, /2026/);
  assert.deepEqual(written, []);
  assert.equal(await r.prepared.save(), "Added ₹250.00 expense (Tea stall) to Goa trip.");
  assert.deepEqual(written, [
    { groupId: "goa", txnDate: "2026-11-11", direction: "debit", amountPaise: 25000, category: "Food & Groceries", subcategory: "Snacks", categoriseLater: false, payee: "Tea stall", paymentMethod: "UPI", description: "tea" },
  ]);
});

test("a category that is not in the owner's list is never invented: the entry is left for the AI to file later", async () => {
  const { ctx, written } = setup();
  for (const extra of [{}, { category: "Pet care", subcategory: "Food" }, { category: "Food & Groceries", subcategory: "Imaginary" }, { category: "Food & Groceries" }]) {
    const r = await prepare({ amount: "99", payee: "Shop", ...extra }, ctx);
    assert.ok("prepared" in r);
    assert.match(r.prepared.lines.find((l) => l.label === "Category")!.value, /Not chosen yet/);
    await r.prepared.save();
  }
  assert.ok(written.every((w) => w.categoriseLater && w.category === "" && w.subcategory === ""));
});

test("income goes under the Income category, and a subcategory outside its list is left for later", async () => {
  const { ctx, written } = setup();
  const r = await prepare({ type: "income", amount: "1,25,000", payee: "Employer", subcategory: "Salary" }, ctx);
  assert.ok("prepared" in r);
  assert.equal(r.prepared.title, "Add income");
  assert.equal(r.prepared.lines[1].label, "Received from");
  await r.prepared.save();
  assert.deepEqual([written[0].direction, written[0].category, written[0].subcategory, written[0].amountPaise], ["credit", "Income", "Salary", 12500000]);
});

test("what cannot be saved is sent back as words, and nothing is prepared", async () => {
  const { ctx } = setup();
  assert.match((await prepare({ amount: "two fifty", payee: "x" }, ctx) as { problem: string }).problem, /not a positive number of rupees/);
  assert.match((await prepare({ amount: "0", payee: "x" }, ctx) as { problem: string }).problem, /not a positive number/);
  assert.match((await prepare({ amount: "10" }, ctx) as { problem: string }).problem, /"payee" is required/);
  assert.match((await prepare({ amount: "10", payee: "x", payment_method: "Bitcoin" }, ctx) as { problem: string }).problem, /not one of the payment methods: UPI, Cash/);
  assert.match((await prepare({ amount: "10", payee: "x", group: "Moon base" }, ctx) as { problem: string }).problem, /no open group called "Moon base"\. The groups are: Main, Goa trip/);
  assert.match((await prepare({ amount: "10", payee: "x", date: "2026-13-45" }, ctx) as { problem: string }).problem, /yyyy-mm-dd/);
});

test("the group is the one named, or the page's group for 'home' and for none; a closed group takes nothing", () => {
  assert.deepEqual(resolveGroup(undefined, GROUPS, "goa"), { id: "goa", name: "Goa trip" });
  assert.deepEqual(resolveGroup("goa TRIP", GROUPS, "main"), { id: "goa", name: "Goa trip" });
  assert.deepEqual(resolveGroup("goa", GROUPS, "main"), { id: "goa", name: "Goa trip" }); // one group contains the word
  assert.deepEqual(resolveGroup("home group", GROUPS, "main"), { id: "main", name: "Main" });
  assert.ok("problem" in resolveGroup("Old trip", GROUPS, "main"));
  assert.deepEqual(resolveGroup(undefined, GROUPS, "old"), { id: "main", name: "Main" }); // a closed or unknown page group falls back to Main
});
