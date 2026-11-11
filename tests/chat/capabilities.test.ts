import { test } from "node:test";
import assert from "node:assert/strict";
import { CAPABILITIES } from "../../src/chat/capabilities";
import type { ChatData, ChatToolContext } from "../../src/chat/types";
import type { AssetRecord } from "../../src/db/assets";
import type { GiftRecord } from "../../src/db/gifts";
import type { ExchangeRecord } from "../../src/db/assetExchanges";
import type { JourneyRecord } from "../../src/db/trainJourneys";
import type { EntriesResult, ExpenseFilter, TotalsResult } from "../../src/domain/chatQuery";
import { registryProblems, validateArgs, type ToolArgs } from "../../src/domain/chatTools";
import type { GroupWithBalance } from "../../src/domain/groups";

const tool = (name: string) => {
  const found = CAPABILITIES.flatMap((c) => c.tools).find((t) => t.name === name);
  assert.ok(found, name);
  return found;
};

const asset = (o: Partial<AssetRecord>): AssetRecord => ({
  id: "a", giftId: null, createdAt: "", type: "gold", forName: null, item: "Chain", exchangeId: null, name: "Chain", status: "ACTIVE", quantity: 16000, unit: "g", purityK: 22,
  investedPaise: null, acquiredDate: null, description: null, lender: null, ticketNo: null, pledgedDate: null, dueDate: null, loanPaise: null, pledgeNote: null, ...o,
});
const gift = (o: Partial<GiftRecord>): GiftRecord => ({
  id: "g", createdAt: "", occasionId: "o1", occasionTitle: "Marriage", occasionDate: "2026-11-01", name: "Kannaki", direction: "received", type: "gold", value: 3000, unit: "g", ratePaise: null, note: null, ...o,
});
const journey = (o: Partial<JourneyRecord>): JourneyRecord => ({ id: "j", createdAt: "", note: null, booked: false, pnr: null, label: "SMVT to VLY", journeyDate: "2026-11-04", booking: "tatkal_non_ac", alarmTimes: ["10:45", "11:00"], ...o });
const group = (o: Partial<GroupWithBalance>): GroupWithBalance => ({
  id: "g1", name: "Goa trip", startDate: "2026-12-01", endDate: null, status: "ACTIVE", parentId: "main", pinned: false, heldPaise: 0,
  inPaise: 100000, outPaise: 40000, subgroupsInPaise: 0, subgroupsOutPaise: 0, subgroupsPaise: 0, ...o,
});

function context(over: Partial<ChatData> = {}): { ctx: ChatToolContext; seen: { filters: ExpenseFilter[] } } {
  const seen = { filters: [] as ExpenseFilter[] };
  const totals: TotalsResult = {
    totalPaise: 244000,
    count: 17,
    rows: [{ label: "bakery snacks", totalPaise: 7000, count: 1 }, { label: "chips", totalPaise: 1500, count: 2 }],
    moreRows: false,
  };
  const entries: EntriesResult = {
    matching: 3,
    entries: [
      { date: "2026-11-03", direction: "debit", amountPaise: 3500, category: "Food & Groceries", subcategory: "Chaats", payee: "Kaveri condimen", paymentMethod: "UPI", description: "Panipuri", note: "panipuri", groupId: "main" },
    ],
  };
  const data: ChatData = {
    expenseTotals: async (f) => (seen.filters.push(f), totals),
    expenseEntries: async (f) => (seen.filters.push(f), entries),
    assets: async () => [],
    exchanges: async () => [],
    gifts: async () => [],
    journeys: async () => [],
    groups: async () => [],
    ...over,
  };
  return {
    seen,
    ctx: { data, scopeLabel: "Main", range: { start: "2026-10-01", end: "2026-10-31" }, now: new Date(2026, 10, 3, 12, 0), groupNames: new Map([["main", "Main"]]), spansGroups: false },
  };
}

const run = async (name: string, raw: object, ctx: ChatToolContext) => {
  const t = tool(name);
  const checked = validateArgs(t.args, raw);
  assert.ok(checked.ok, JSON.stringify(checked));
  return JSON.parse(JSON.stringify(await t.run((checked as { args: ToolArgs }).args, ctx)));
};

test("every feature in the list keeps the rules: unique names, described tools and arguments", () => {
  assert.deepEqual(registryProblems(CAPABILITIES), []);
  assert.deepEqual(CAPABILITIES.map((c) => c.id), ["expenses", "assets", "gifts", "trains", "groups"]);
  assert.deepEqual(CAPABILITIES.find((c) => c.id === "assets")!.tools.map((t) => t.name), ["assets_list", "assets_totals", "asset_exchanges"]);
});

test("expense_totals uses the page's period when no dates are given, and formats the amounts", async () => {
  const { ctx, seen } = context();
  const r = await run("expense_totals", { subcategory: "Snacks", groupBy: "description" }, ctx);
  assert.deepEqual(seen.filters[0], { type: "spent", from: "2026-10-01", to: "2026-10-31", category: undefined, subcategory: "Snacks", payee: undefined, textContains: undefined });
  assert.equal(r.groups, "Main");
  assert.equal(r.period, "2026-10-01 to 2026-10-31");
  assert.equal(r.total, "₹2,440.00");
  assert.equal(r.entries, 17);
  assert.equal(r.subcategory, "Snacks");
  assert.deepEqual(r.rows[0], { label: "bakery snacks", total: "₹70.00", entries: 1 });
  assert.equal(r.moreRowsNotShown, false);
});

test("expense_totals takes its own dates, and refuses an upside-down range", async () => {
  const { ctx, seen } = context();
  await run("expense_totals", { from: "2026-09-01", to: "2026-09-30", type: "received", textContains: ["milk", "paal"] }, ctx);
  assert.deepEqual([seen.filters[0].from, seen.filters[0].to, seen.filters[0].type, seen.filters[0].textContains], ["2026-09-01", "2026-09-30", "received", ["milk", "paal"]]);
  await assert.rejects(() => run("expense_totals", { from: "2026-11-01", to: "2026-10-01" }, ctx), /after "to"/);
});

test("expense_entries shows what was bought, leaves out a note that repeats the description, and names the group only across groups", async () => {
  const { ctx } = context();
  const one = await run("expense_entries", {}, ctx);
  assert.equal(one.matchingEntries, 3);
  assert.equal(one.showing, 1);
  assert.deepEqual(one.entries[0], { date: "2026-11-03", type: "spent", amount: "₹35.00", category: "Food & Groceries : Chaats", payee: "Kaveri condimen", via: "UPI", description: "Panipuri" });
  const many = await run("expense_entries", {}, { ...ctx, spansGroups: true });
  assert.equal(many.entries[0].group, "Main");
});

test("assets_totals adds up by kind, with the gold by purity, what was paid and what is pledged", async () => {
  const { ctx } = context({
    assets: async () => [
      asset({ id: "1", quantity: 16000, purityK: 22, investedPaise: 7000000 }),
      asset({ id: "2", quantity: 40000, purityK: 22 }),
      asset({ id: "3", quantity: 5000, purityK: 24, lender: "Muthoot", loanPaise: 3000000 }),
      asset({ id: "4", type: "land", unit: "cent", quantity: 5000, name: "Plot" }),
      asset({ id: "5", status: "SOLD", name: "Old ring" }),
    ],
  });
  const r = await run("assets_totals", {}, ctx);
  assert.equal(r.counting, "holding");
  assert.deepEqual(r.kinds.map((k: { kind: string }) => k.kind), ["Gold", "Land"]);
  const gold = r.kinds[0];
  assert.equal(gold.items, 3); // the sold one is not counted
  assert.deepEqual(gold.quantity, ["61 g"]);
  assert.deepEqual(gold.goldByPurity, { "24K": "5 g", "22K": "56 g" });
  assert.equal(gold.totalPaid, "₹70,000.00");
  assert.equal(gold.pledgedItems, 1);
  assert.equal(gold.loanTotal, "₹30,000.00");
  const sold = await run("assets_totals", { show: "sold" }, ctx);
  assert.equal(sold.kinds[0].items, 1);
  // pledged with no loan amount entered: no loan total, not a total of zero
  const noLoan = context({ assets: async () => [asset({ lender: "Muthoot" })] });
  const r2 = await run("assets_totals", {}, noLoan.ctx);
  assert.equal(r2.kinds[0].pledgedItems, 1);
  assert.equal(r2.kinds[0].loanTotal, undefined);
});

test("assets_list shows the pledge, and finds by search", async () => {
  const { ctx } = context({ assets: async () => [asset({ lender: "Muthoot", loanPaise: 3000000, dueDate: "2027-01-01" }), asset({ id: "2", name: "Plot", type: "land", unit: "cent", quantity: 5000, purityK: null })] });
  const r = await run("assets_list", { search: "plot" }, ctx);
  assert.equal(r.matching, 1);
  assert.equal(r.assets[0].kind, "Land");
  const pledged = await run("assets_list", { show: "pledged" }, ctx);
  assert.deepEqual(pledged.assets[0].pledge, { lender: "Muthoot", loan: "₹30,000.00", due: "2027-01-01" });
});

test("gifts_totals keeps cash, gold and silver apart and can group by occasion, kind or person", async () => {
  const { ctx } = context({
    gifts: async () => [
      gift({ id: "1", name: "Kannaki", type: "gold", value: 3000, unit: "g" }),
      gift({ id: "2", name: "Gopal", type: "cash", value: 1000000, unit: "INR" }),
      gift({ id: "3", name: "Gopal", type: "cash", value: 500000, unit: "INR", occasionId: "o2", occasionTitle: "Housewarming" }),
      gift({ id: "4", name: "Ananthi", direction: "given", type: "silver", value: 100000, unit: "g" }),
    ],
  });
  const all = await run("gifts_totals", { direction: "received" }, ctx);
  assert.equal(all.gifts, 3);
  assert.deepEqual(all.totals, ["Cash ₹15,000", "Gold 3 g"]);
  const byOccasion = await run("gifts_totals", { direction: "received", groupBy: "occasion" }, ctx);
  assert.deepEqual(byOccasion.groups.map((g: { label: string; totals: string[] }) => [g.label, g.totals]), [["Marriage", ["Cash ₹10,000", "Gold 3 g"]], ["Housewarming", ["Cash ₹5,000"]]]);
  const marriage = await run("gifts_totals", { occasion: "marr" }, ctx);
  assert.equal(marriage.gifts, 3); // Kannaki, Gopal, and the silver one (all Marriage here)
  const gopal = await run("gifts_list", { search: "gopal", type: "cash" }, ctx);
  assert.deepEqual(gopal.gifts.map((g: { what: string }) => g.what), ["₹10,000", "₹5,000"]);
});

test("train_journeys lists what is ahead, with whether booking is open and the alarm times", async () => {
  const { ctx } = context({ journeys: async () => [journey({ id: "1" }), journey({ id: "2", label: "Old trip", journeyDate: "2026-10-01", booking: "advance" })] });
  const upcoming = await run("train_journeys", {}, ctx);
  assert.equal(upcoming.today, "2026-11-03");
  assert.deepEqual(upcoming.journeys.map((j: { label: string }) => j.label), ["SMVT to VLY"]);
  assert.equal(upcoming.journeys[0].booking, "Tatkal Non AC");
  assert.match(upcoming.journeys[0].status, /Tatkal/);
  const past = await run("train_journeys", { when: "past" }, ctx);
  assert.deepEqual(past.journeys.map((j: { label: string }) => j.label), ["Old trip"]);
  assert.equal((await run("train_journeys", { when: "all" }, ctx)).matching, 2);
});

test("groups_list gives each group's own figures and balance, and leaves out closed ones unless asked", async () => {
  const { ctx } = context({
    groups: async () => [
      group({ id: "main", name: "Main", parentId: null, inPaise: 500000, outPaise: 200000 }),
      group({}),
      group({ id: "g2", name: "Old trip", status: "CLOSED" }),
      group({ id: "g3", name: "Gone", status: "DELETED" }),
    ],
  });
  const open = await run("groups_list", {}, ctx);
  assert.deepEqual(open.groups.map((g: { name: string }) => g.name), ["Main", "Goa trip"]);
  assert.deepEqual(open.groups[1], { name: "Goa trip", status: "open", under: "Main", from: "2026-12-01", income: "₹1,000.00", expenses: "₹400.00", balance: "₹600.00" });
  assert.deepEqual((await run("groups_list", { status: "all" }, ctx)).groups.map((g: { name: string }) => g.name), ["Main", "Goa trip", "Old trip"]);
  assert.deepEqual((await run("groups_list", { search: "goa" }, ctx)).groups.map((g: { name: string }) => g.name), ["Goa trip"]);
});

const person = (over: Partial<AssetRecord>) => asset({ forName: "Thishi", item: "Bangles", name: "Thishi - Bangles", ...over });

test("assets can be filtered by For and Item, and totalled by person or by item", async () => {
  const { ctx } = context({
    assets: async () => [
      person({ id: "1", quantity: 4000 }),
      person({ id: "2", item: "Ear Ring", name: "Thishi - Ear Ring", quantity: 3360 }),
      person({ id: "3", forName: "Thika", name: "Thika - Bangles", quantity: 8000 }),
      person({ id: "4", forName: null, item: "Anklet", name: "Anklet", quantity: 12000 }),
      person({ id: "5", status: "SOLD", exchangeId: "ax-1", quantity: 6000 }), // given to a shop
    ],
  });
  const thishi = await run("assets_list", { for: "thishi" }, ctx);
  assert.deepEqual(thishi.assets.map((a: { item: string }) => a.item), ["Bangles", "Ear Ring"]);
  assert.equal(thishi.assets[0].for, "Thishi");
  assert.equal((await run("assets_list", { item: "bangles" }, ctx)).matching, 2); // Thishi's and Thika's, not the one given away
  const given = await run("assets_list", { show: "exchanged" }, ctx);
  assert.equal(given.assets[0].status, "given to a shop in an exchange");

  const byPerson = await run("assets_totals", { groupBy: "for" }, ctx);
  assert.deepEqual(byPerson.groups.map((g: { label: string; kinds: { quantity: string[] }[] }) => [g.label, g.kinds[0].quantity[0]]), [["Thishi", "7.36 g"], ["Thika", "8 g"], ["Not set", "12 g"]]);
  assert.equal(byPerson.overall[0].quantity[0], "27.36 g");
  const byItem = await run("assets_totals", { groupBy: "item", for: "Thishi" }, ctx);
  assert.deepEqual(byItem.groups.map((g: { label: string }) => g.label), ["Bangles", "Ear Ring"]);
});

test("asset_exchanges tells what was given and what was bought in its place, with the weights", async () => {
  const exchange = (over: Partial<ExchangeRecord> = {}): ExchangeRecord => ({
    id: "ax-1", exchangeDate: "2026-11-05", shop: "Joyalukkas", extraPaise: 250000, note: null, createdAt: "",
    given: [person({ id: "g1", quantity: 4000, status: "SOLD", exchangeId: "ax-1" }), person({ id: "g2", item: "Chain", name: "Thishi - Chain", quantity: 8000, status: "SOLD", exchangeId: "ax-1" })],
    bought: [person({ id: "b1", item: "Long chain", name: "Thishi - Long chain", quantity: 14000, exchangeId: "ax-1" })],
    ...over,
  });
  const { ctx } = context({
    exchanges: async () => [exchange(), exchange({ id: "ax-2", exchangeDate: "2026-09-01", shop: "Other shop", extraPaise: null, bought: [] })],
  });
  const r = await run("asset_exchanges", {}, ctx);
  assert.equal(r.matching, 2);
  assert.deepEqual(r.exchanges[0], {
    date: "2026-11-05",
    shop: "Joyalukkas",
    gave: ["Thishi - Bangles · 4 g · 22K", "Thishi - Chain · 8 g · 22K"],
    totalGave: "12 g",
    bought: ["Thishi - Long chain · 14 g · 22K"],
    totalBought: "14 g",
    difference: "2 g more than given",
    extraPaid: "₹2,500.00",
  });
  assert.equal(r.exchanges[1].bought, "nothing added yet");
  assert.equal(r.exchanges[1].totalBought, undefined);
  assert.equal((await run("asset_exchanges", { shop: "other" }, ctx)).matching, 1);
  assert.equal((await run("asset_exchanges", { from: "2026-10-01" }, ctx)).matching, 1);
});

test("train_journeys says which are booked, with the PNR, and can filter by it", async () => {
  const { ctx } = context({
    journeys: async () => [
      journey({ id: "1", label: "Booked trip", journeyDate: "2026-11-20", booked: true, pnr: "4521398760" }),
      journey({ id: "2", label: "To book", journeyDate: "2026-11-25" }),
    ],
  });
  const all = await run("train_journeys", {}, ctx);
  const booked = all.journeys.find((j: { label: string }) => j.label === "Booked trip");
  assert.equal(booked.booked, true);
  assert.equal(booked.pnr, "4521398760");
  assert.equal(booked.status, "Booked · PNR 4521398760");
  assert.equal(booked.alarms, undefined); // a booked journey has no alarms
  const toBook = all.journeys.find((j: { label: string }) => j.label === "To book");
  assert.equal(toBook.booked, false);
  assert.ok(toBook.alarms);
  assert.deepEqual((await run("train_journeys", { booked: "yes" }, ctx)).journeys.map((j: { label: string }) => j.label), ["Booked trip"]);
  assert.deepEqual((await run("train_journeys", { booked: "no" }, ctx)).journeys.map((j: { label: string }) => j.label), ["To book"]);
});
