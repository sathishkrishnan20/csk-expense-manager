import { test } from "node:test";
import assert from "node:assert/strict";
import { addAssetAction } from "../../src/chat/capabilities/assetActions";
import { addGiftAction } from "../../src/chat/capabilities/giftActions";
import { addJourneyAction } from "../../src/chat/capabilities/trainActions";
import type { ChatToolContext } from "../../src/chat/types";
import type { AssetFields } from "../../src/domain/assets";
import { validateArgs, type ChatAction, type PreparedAction, type ToolArgs } from "../../src/domain/chatTools";

const NOW = new Date(2026, 10, 11, 12, 0); // 11 Nov 2026

function setup(occasions: { id: string; title: string; date: string }[] = []) {
  const saved: { kind: string; input: unknown }[] = [];
  const ctx = {
    data: { occasions: async () => occasions },
    writes: {
      addJourney: async (i: unknown) => (saved.push({ kind: "journey", input: i }), "Alarms set."),
      addGift: async (i: unknown) => void saved.push({ kind: "gift", input: i }),
      addAsset: async (i: AssetFields) => void saved.push({ kind: "asset", input: i }),
    },
    now: NOW,
  } as unknown as ChatToolContext;
  return { ctx, saved };
}

async function prepare(action: ChatAction<ChatToolContext>, raw: object, ctx: ChatToolContext): Promise<{ prepared: PreparedAction } | { problem: string }> {
  const checked = validateArgs(action.args, raw);
  if (!checked.ok) return { problem: checked.error };
  const outcome = await action.prepare((checked as { args: ToolArgs }).args, ctx);
  return outcome.ok ? { prepared: outcome.prepared } : { problem: outcome.problem };
}
const problem = (r: { prepared: PreparedAction } | { problem: string }): string => ("problem" in r ? r.problem : "no problem");

// ---- train journeys

test("a journey is prepared with the usual alarm times for its booking, and saved with its alarms only on Save", async () => {
  const { ctx, saved } = setup();
  const r = await prepare(addJourneyAction, { label: "Chennai to Madurai", date: "2027-02-20", booking: "tatkal_ac" }, ctx);
  assert.ok("prepared" in r);
  const lines = Object.fromEntries(r.prepared.lines.map((l) => [l.label, l.value]));
  assert.equal(lines.Alarms, "9:45 AM, 9:55 AM, 9:58 AM, 10:00 AM");
  assert.match(lines["Booking opens"], /February 19, 2027 at 10:00 AM/);
  assert.equal(saved.length, 0);
  assert.match(await r.prepared.save(), /Added the journey Chennai to Madurai on .*2027\. Alarms set\./);
  assert.deepEqual(saved[0].input, { label: "Chennai to Madurai", journeyDate: "2027-02-20", booking: "tatkal_ac", alarmTimes: ["09:45", "09:55", "09:58", "10:00"], booked: false, pnr: null, note: null });
});

test("a journey needs a place and a date that has not passed, and alarm times that are real times", async () => {
  const { ctx } = setup();
  assert.match(problem(await prepare(addJourneyAction, { date: "2027-02-20" }, ctx)), /"label" is required/);
  assert.match(problem(await prepare(addJourneyAction, { label: "Trip", date: "2026-11-01" }, ctx)), /already over|in the past/);
  assert.match(problem(await prepare(addJourneyAction, { label: "Trip", date: "2027-02-20", alarm_times: ["7:45 am"] }, ctx)), /24-hour HH:MM/);
  const custom = await prepare(addJourneyAction, { label: "Trip", date: "2027-02-20", alarm_times: ["08:00", "07:50", "08:00"] }, ctx);
  assert.ok("prepared" in custom);
  assert.equal(custom.prepared.lines.find((l) => l.label === "Alarms")!.value, "7:50 AM, 8:00 AM"); // in order, each once
});

// ---- gifts

test("a gift in an occasion already in the list goes into it; a new occasion says it is new", async () => {
  const { ctx, saved } = setup([{ id: "o1", title: "Priya's Marriage", date: "2026-11-01" }]);
  const same = await prepare(addGiftAction, { person: "Kannaki", occasion: "priya's marriage", type: "gold", amount: "8" }, ctx);
  assert.ok("prepared" in same);
  assert.equal(same.prepared.lines.find((l) => l.label === "Occasion")!.value, "Priya's Marriage (in your list)");
  assert.equal(same.prepared.lines.find((l) => l.label === "Gift")!.value, "8 g gold");
  await same.prepared.save();
  assert.deepEqual(saved[0].input, { name: "Kannaki", direction: "received", type: "gold", value: 8000, unit: "g", ratePaise: null, note: null, occasionId: "o1", occasionTitle: "priya's marriage", occasionDate: "2026-11-01", changeOccasionDate: false });

  const fresh = await prepare(addGiftAction, { person: "Ravi", occasion: "Housewarming", type: "cash", amount: "1000", direction: "given", occasion_date: "2026-12-05" }, ctx);
  assert.ok("prepared" in fresh);
  assert.match(fresh.prepared.lines.find((l) => l.label === "Occasion")!.value, /^Housewarming \(new, .*December 05, 2026\)$/);
  assert.equal(fresh.prepared.title, "Add a gift you gave");
});

test("a gift needs what the form needs: an amount for cash and gold, and a note saying what another kind of gift is", async () => {
  const { ctx } = setup();
  assert.match(problem(await prepare(addGiftAction, { person: "A", occasion: "Marriage", type: "cash" }, ctx)), /Enter the amount/);
  assert.match(problem(await prepare(addGiftAction, { person: "A", occasion: "Marriage", type: "gold" }, ctx)), /weight in grams/);
  assert.match(problem(await prepare(addGiftAction, { person: "A", occasion: "Marriage", type: "other" }, ctx)), /what the gift is/);
  assert.match(problem(await prepare(addGiftAction, { person: "A", occasion: "Marriage", type: "cash", amount: "lots" }, ctx)), /Amount should be a number/);
  assert.match(problem(await prepare(addGiftAction, { occasion: "Marriage", type: "cash", amount: "5" }, ctx)), /"person" is required/);
  const lamp = await prepare(addGiftAction, { person: "A", occasion: "Marriage", type: "other", note: "Silver lamp" }, ctx);
  assert.ok("prepared" in lamp);
  assert.equal(lamp.prepared.lines.find((l) => l.label === "Gift")!.value, "Silver lamp");
});

// ---- assets

test("an asset is checked by the form's own rules and saved only on Save", async () => {
  const { ctx, saved } = setup();
  const r = await prepare(addAssetAction, { type: "gold", item: "Ring", for: "Thishi", quantity: "3.5", purity: 22, amount_paid: "21000", acquired_date: "2026-11-01" }, ctx);
  assert.ok("prepared" in r);
  const lines = Object.fromEntries(r.prepared.lines.map((l) => [l.label, l.value]));
  assert.deepEqual([lines.Type, lines.Item, lines.For, lines.Paid], ["Gold", "Ring", "Thishi", "₹21,000.00"]);
  assert.match(lines.Quantity, /3\.5 g/);
  assert.equal(saved.length, 0);
  assert.equal(await r.prepared.save(), "Added Thishi - Ring to your assets.");
  const fields = saved[0].input as AssetFields;
  assert.deepEqual([fields.type, fields.item, fields.forName, fields.quantity, fields.unit, fields.purityK, fields.investedPaise, fields.status, fields.lender], ["gold", "Ring", "Thishi", 3500, "g", 22, 2100000, "ACTIVE", null]);
});

test("an asset with a wrong unit, purity or number is sent back as words", async () => {
  const { ctx } = setup();
  assert.match(problem(await prepare(addAssetAction, { type: "gold", item: "Ring", unit: "acre" }, ctx)), /counted in g/);
  assert.match(problem(await prepare(addAssetAction, { type: "gold", item: "Ring", purity: 20 }, ctx)), /purity must be one of 24, 22, 18/);
  assert.match(problem(await prepare(addAssetAction, { type: "land", item: "Plot", purity: 22 }, ctx)), /only for gold/);
  assert.match(problem(await prepare(addAssetAction, { type: "gold", item: "Ring", quantity: "heavy" }, ctx)), /Weight should be a number/);
  assert.match(problem(await prepare(addAssetAction, { type: "gold", for: "Thishi" }, ctx)), /"item" is required/);
  const land = await prepare(addAssetAction, { type: "land", item: "Plot at Madurai", quantity: "5", unit: "cent" }, ctx);
  assert.ok("prepared" in land);
  assert.match(land.prepared.lines.find((l) => l.label === "Quantity")!.value, /5 cent/);
});
