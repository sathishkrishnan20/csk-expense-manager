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
import type { CachedRates } from "../../src/domain/metalRates";

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
    savings: async () => ({ months: [], accounts: [], holdings: [] }),
    monthTemplate: async () => ({ groups: [], lines: [] }),
    exchanges: async () => [],
    gifts: async () => [],
    journeys: async () => [],
    groups: async () => [],
    occasions: async () => [],
    categories: async () => [],
    paymentMethods: async () => [],
    metalRates: async () => null,
    nagercoilRates: async () => null,
    ...over,
  };
  return {
    seen,
    ctx: { data, writes: { addTransaction: async () => undefined, addJourney: async () => "", addGift: async () => undefined, addAsset: async () => undefined }, pageGroupId: "main", scopeLabel: "Main", range: { start: "2026-10-01", end: "2026-10-31" }, now: new Date(2026, 10, 3, 12, 0), groupNames: new Map([["main", "Main"]]), spansGroups: false },
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
  assert.deepEqual(CAPABILITIES.map((c) => c.id), ["expenses", "assets", "savings", "gifts", "trains", "groups", "month_template", "rates"]);
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

// ---- gold and silver rates

const session = (am: number | null, pm: number | null) => ({ am, pm });
const goldRates = (am: number, pm: number | null) => ({ "999": session(am, pm), "995": session(am - 600, pm === null ? null : pm - 600), "916": session(am - 10000, pm === null ? null : pm - 10000) });
const ibja = (): CachedRates => ({
  fetchedAt: new Date(2026, 10, 3, 11, 30).getTime(),
  snapshot: {
    gold: { date: "2026-11-03", rates: goldRates(138000, 139000) },
    silver: { date: "2026-11-03", rate: session(170000, null) },
    history: [
      { date: "2026-11-03", gold: goldRates(138000, 139000), silver: session(170000, null) },
      { date: "2026-11-02", gold: goldRates(136000, 137000), silver: session(168000, 169000) },
    ],
  },
});

test("ibja_rates gives gold and silver per gram with the session and date, and the amounts are worked out for the AI", async () => {
  const { ctx } = context({ metalRates: async () => ibja() });
  const r = await run("ibja_rates", {}, ctx);
  assert.equal(r.gold.date, "2026-11-03");
  assert.equal(r.gold.is_today, true);
  assert.deepEqual(r.gold.gold_24k_999, { session: "PM", per_gram: "₹13,900", per_8_grams: "₹1,11,200", per_10_grams: "₹1,39,000" });
  assert.equal(r.gold.gold_22k_916.per_gram, "₹12,900");
  assert.deepEqual(r.silver, { date: "2026-11-03", is_today: true, session: "AM", per_gram: "₹170", per_kg: "₹1,70,000" });
  assert.equal(r.earlier_days, undefined);
  assert.match(r.checked, /today at 11:30 AM/);
});

test("ibja_rates shows earlier days with the move from the day before when asked", async () => {
  const { ctx } = context({ metalRates: async () => ibja() });
  const r = await run("ibja_rates", { days: 2 }, ctx);
  assert.equal(r.earlier_days.length, 2);
  assert.equal(r.earlier_days[0].date, "2026-11-03");
  assert.equal(r.earlier_days[0].gold_24k_999.per_gram, "₹13,900");
  assert.match(r.earlier_days[0].gold_24k_999.change_from_day_before, /^▲ ₹200 \(1\.46%\)$/);
  assert.equal(r.earlier_days[1].gold_24k_999.change_from_day_before, undefined, "the oldest day has nothing to compare with");
});

test("ibja_rates says plainly when the rates could not be loaded", async () => {
  const { ctx } = context();
  const r = await run("ibja_rates", {}, ctx);
  assert.equal(r.available, false);
  assert.match(r.note, /could not be loaded/);
});

test("nagercoil_gold_rates gives the local 22K and 24K price with its move, newest first", async () => {
  const { ctx } = context({
    nagercoilRates: async () => [
      { date: "2026-11-03", price22k: 12650, price24k: 13800 },
      { date: "2026-11-02", price22k: 12600, price24k: 13750 },
      { date: "2026-11-01", price22k: 12600, price24k: 13750 },
    ],
  });
  const latest = await run("nagercoil_gold_rates", {}, ctx);
  assert.equal(latest.latest_date, "2026-11-03");
  assert.equal(latest.is_today, true);
  assert.deepEqual(latest.days, [{ date: "2026-11-03", gold_22k_per_gram: "₹12,650", gold_24k_per_gram: "₹13,800", change_22k_from_day_before: "▲ ₹50 (0.40%)", change_24k_from_day_before: "▲ ₹50 (0.36%)" }]);
  const three = await run("nagercoil_gold_rates", { days: 3 }, ctx);
  assert.equal(three.days.length, 3);
  assert.equal(three.days[1].change_22k_from_day_before, "No change");
  assert.equal(three.days[2].change_22k_from_day_before, undefined);
});

test("nagercoil_gold_rates says plainly when the backend is not set up or cannot be reached", async () => {
  const { ctx } = context();
  const r = await run("nagercoil_gold_rates", {}, ctx);
  assert.equal(r.available, false);
  assert.match(r.note, /not available/);
});

// ---- Savings

const savingsData = () => ({
  months: [
    { kind: "mf" as const, account: "", month: "2026-10", ownPaise: 4100000, employerPaise: 0, pensionPaise: 0, source: "statement" as const, creditedDate: null },
    { kind: "nps" as const, account: "123456789012", month: "2026-10", ownPaise: 0, employerPaise: 1886000, pensionPaise: 0, source: "statement" as const, creditedDate: "2026-11-02" },
    { kind: "pf" as const, account: "ABCDE12345670000012345", month: "2026-10", ownPaise: 2263200, employerPaise: 2263200, pensionPaise: 0, source: "estimate" as const, creditedDate: null },
    { kind: "nps" as const, account: "123456789012", month: "2026-09", ownPaise: 0, employerPaise: 1886000, pensionPaise: 0, source: "statement" as const, creditedDate: "2026-10-05" },
  ],
  accounts: [
    { kind: "pf" as const, account: "ABCDE12345670000012345", label: null, status: "ACTIVE" as const, asOf: "2026-11-13", fy: 2026, valuePaise: null, investedPaise: null, xirr: null, ownPaise: 23544200, employerPaise: 23544200, pensionPaise: 0, autoAdd: true, autoFrom: "2026-10", estOwnPaise: 2263200, estEmployerPaise: 2263200, estPensionPaise: 0 },
    { kind: "nps" as const, account: "123456789012", label: "NPS Tier I", status: "ACTIVE" as const, asOf: "2026-11-13", fy: null, valuePaise: 41241429, investedPaise: 39117839, xirr: "5.24", ownPaise: null, employerPaise: null, pensionPaise: null, autoAdd: false, autoFrom: null, estOwnPaise: 0, estEmployerPaise: 0, estPensionPaise: 0 },
  ],
  holdings: [
    { kind: "mf" as const, account: "111/1", code: "INF000A01001", name: "Alpha Fund", unitsE4: 2000000, navE4: 500000, valuePaise: 1000000, investedPaise: 800000, asOf: "2026-10-31", navDate: "2026-10-31", liveNavE4: 600000, liveNavDate: "2026-11-12" },
  ],
});

test("savings_summary gives the total, each part with its date, and only the last digits of an account", async () => {
  const { ctx } = context({ savings: async () => savingsData() });
  const r = await run("savings_summary", {}, ctx);
  assert.equal(r.total_value, "₹8,95,298.29", "12,000 (funds at the newer NAV) + 4,12,414.29 (NPS) + 4,70,884 (PF employee + employer)");
  assert.equal(r.mutual_funds.value, "₹12,000.00", "units x the newer NAV");
  assert.equal(r.mutual_funds.invested, "₹8,000.00");
  assert.equal(r.mutual_funds.gain, "₹4,000.00");
  assert.equal(r.mutual_funds.value_uses_todays_nav, true);
  assert.equal(r.nps.value, "₹4,12,414.29");
  assert.equal(r.nps.statement_return_percent, "5.24");
  assert.equal(r.pf[0].account, "…2345");
  assert.equal(r.pf[0].balance_employee_plus_employer, "₹4,70,884.00");
  assert.equal(r.pf[0].estimated_since_passbook, "₹45,264.00");
  const text = JSON.stringify(r);
  assert.ok(!text.includes("ABCDE12345670000012345") && !text.includes("123456789012"), "no whole PRAN or member ID");
});

test("savings_summary says so when nothing has been imported", async () => {
  const r = await run("savings_summary", {}, context().ctx);
  assert.equal(r.imported, false);
});

test("savings_months lists the months newest first with totals by kind, and filters by kind and dates", async () => {
  const { ctx } = context({ savings: async () => savingsData() });
  const all = await run("savings_months", {}, ctx);
  assert.deepEqual(all.months.map((m: { month: string }) => m.month), ["Oct 2026", "Sep 2026"]);
  assert.deepEqual(all.months[0], { month: "Oct 2026", mutual_funds: "₹41,000.00", nps: "₹18,860.00", pf: "₹45,264.00", pf_includes_estimate: true, total: "₹1,05,124.00" });
  assert.equal(all.totals_for_these_months.NPS, "₹37,720.00");
  const nps = await run("savings_months", { kind: "nps", from: "2026-10-01" }, ctx);
  assert.equal(nps.months_with_figures, 1);
  assert.equal(nps.totals_for_these_months.all, "₹18,860.00");
  const none = await run("savings_months", { from: "2030-01-01" }, ctx);
  assert.equal(none.months, 0);
});

// ---- Monthly template

test("month_template lists Main and each group with its switches and entries, and says so when there is no template", async () => {
  const none = await run("month_template", {}, context().ctx);
  assert.equal(none.set_up, false);

  const { ctx } = context({
    monthTemplate: async () => ({
      groups: [
        { id: "a", parentId: null, name: "{Month} {Year} - Savings", sort: 1, openingIncome: true, fundsHere: true, home: false },
        { id: "b", parentId: "a", name: "Day to day", sort: 2, openingIncome: true, fundsHere: false, home: true },
      ],
      lines: [
        { id: "s", groupId: "main", sort: 1, direction: "credit" as const, category: "Income", subcategory: "Salary", payee: "Blend", paymentMethod: null, description: null, amountPaise: null, day: 1, createsGroupId: "a" },
        { id: "r", groupId: "a", sort: 1, direction: "debit" as const, category: "Households", subcategory: "Rent", payee: "Rent", paymentMethod: null, description: null, amountPaise: 2400000, day: 1, createsGroupId: null },
        { id: "m", groupId: "a", sort: 2, direction: "debit" as const, category: "Expenses", subcategory: "Monthly Expenses", payee: "Monthly Expenses", paymentMethod: null, description: null, amountPaise: 2500000, day: 3, createsGroupId: "b" },
      ],
    }),
  });
  const r = await run("month_template", {}, ctx);
  assert.deepEqual(r.containers.map((c: { name: string }) => c.name), ["Main", "{Month} {Year} - Savings", "Day to day"]);
  assert.deepEqual(r.containers[0].entries, [{ payee: "Blend", kind: "income", category: "Income / Salary", amount: "asked each month", day_of_month: 1, creates_group: "{Month} {Year} - Savings" }]);
  assert.deepEqual([r.containers[1].mutual_fund_purchases_go_here, r.containers[2].home_opens_on_it], [true, true]);
  assert.deepEqual(r.containers[1].entries.map((e: { payee: string; amount: string }) => [e.payee, e.amount]), [["Rent", "₹24,000.00"], ["Monthly Expenses", "₹25,000.00"]]);
});
