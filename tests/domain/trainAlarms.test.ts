import { test } from "node:test";
import assert from "node:assert/strict";
import {
  alarmUuid,
  bookingOpenDate,
  bookingOpensAt,
  capNotifications,
  describeStatus,
  formatClock,
  journeyStatus,
  planAlarms,
  planJourneyAlarms,
  planNotifications,
  tatkalOpenDate,
  tatkalOpensAt,
  validateAlarms,
  validateLabel,
  type JourneyForAlarms,
} from "../../src/domain/trainAlarms";

const journey = (over: Partial<JourneyForAlarms> = {}): JourneyForAlarms => ({
  id: "tj-1",
  label: "Chennai to Madurai",
  journeyDate: "2027-01-12",
  advance: true,
  tatkal: "none",
  wakeLeadMinutes: 30,
  ...over,
});

const hm = (d: Date) => [d.getDate(), d.getHours(), d.getMinutes()];

test("advance booking opens 60 days before the journey, across months and years", () => {
  assert.equal(bookingOpenDate("2027-01-12"), "2026-11-13");
  assert.equal(bookingOpenDate("2026-12-31"), "2026-11-01");
  assert.equal(bookingOpenDate("2028-03-01"), "2028-01-01"); // 2028 is a leap year
});

test("advance booking opens at 8:00 AM on the booking date", () => {
  const at = bookingOpensAt("2027-01-12");
  assert.deepEqual([at.getFullYear(), at.getMonth(), at.getDate(), at.getHours(), at.getMinutes()], [2026, 10, 13, 8, 0]);
});

test("Tatkal opens the day before the journey: 10:00 AM for AC, 11:00 AM for the rest", () => {
  assert.equal(tatkalOpenDate("2027-01-12"), "2027-01-11");
  assert.equal(tatkalOpenDate("2027-01-01"), "2026-12-31");
  const ac = tatkalOpensAt("2027-01-12", "ac")!;
  assert.deepEqual([ac.getFullYear(), ac.getMonth(), ac.getDate(), ac.getHours(), ac.getMinutes()], [2027, 0, 11, 10, 0]);
  const rest = tatkalOpensAt("2027-01-12", "non_ac")!;
  assert.deepEqual([rest.getDate(), rest.getHours()], [11, 11]);
  assert.equal(tatkalOpensAt("2027-01-12", "none"), null);
});

test("clock times read like 8:00 AM", () => {
  assert.equal(formatClock(new Date(2026, 0, 1, 8, 0)), "8:00 AM");
  assert.equal(formatClock(new Date(2026, 0, 1, 0, 5)), "12:05 AM");
  assert.equal(formatClock(new Date(2026, 0, 1, 12, 30)), "12:30 PM");
  assert.equal(formatClock(new Date(2026, 0, 1, 20, 0)), "8:00 PM");
});

test("a journey is waiting, open or past, and says so", () => {
  const morning = new Date(2026, 10, 2, 7, 0); // 2 Nov 2026, 7:00 AM
  const later = new Date(2026, 10, 2, 10, 0);
  const advance = (journeyDate: string) => ({ journeyDate, advance: true, tatkal: "none" as const });

  const far = journeyStatus(advance("2027-01-12"), later);
  assert.equal(far.phase, "waiting");
  assert.equal(far.kind, "advance");
  assert.equal(far.daysToOpen, 11);
  assert.equal(describeStatus(far), "Opens in 11 days");

  assert.equal(describeStatus(journeyStatus(advance("2027-01-02"), later)), "Opens tomorrow at 8:00 AM");

  const today = journeyStatus(advance("2027-01-01"), morning);
  assert.equal(today.phase, "waiting");
  assert.equal(describeStatus(today), "Opens today at 8:00 AM");

  const opened = journeyStatus(advance("2027-01-01"), later);
  assert.equal(opened.phase, "open");
  assert.equal(describeStatus(opened), "Booking is open");

  const gone = journeyStatus(advance("2026-11-01"), later);
  assert.equal(gone.phase, "past");
  assert.equal(describeStatus(gone), "Journey over");
});

test("the status follows the next opening: advance first, then Tatkal, then open", () => {
  const both = { journeyDate: "2027-01-12", advance: true, tatkal: "ac" as const };
  assert.equal(journeyStatus(both, new Date(2026, 10, 2)).kind, "advance");

  const afterAdvance = journeyStatus(both, new Date(2027, 0, 5, 9, 0));
  assert.equal(afterAdvance.kind, "tatkal");
  assert.equal(afterAdvance.phase, "waiting");
  assert.equal(describeStatus(afterAdvance), "Tatkal opens in 6 days");

  const tatkalOnly = { journeyDate: "2026-11-04", advance: false, tatkal: "ac" as const };
  assert.equal(describeStatus(journeyStatus(tatkalOnly, new Date(2026, 10, 2, 7, 0))), "Tatkal opens tomorrow at 10:00 AM");
  assert.equal(describeStatus(journeyStatus({ ...tatkalOnly, journeyDate: "2026-11-03" }, new Date(2026, 10, 2, 7, 0))), "Tatkal opens today at 10:00 AM");

  const opened = journeyStatus(both, new Date(2027, 0, 11, 11, 0));
  assert.equal(opened.phase, "open");
  assert.equal(describeStatus(opened), "Tatkal is open");
});

test("advance booking plans an evening reminder, a wake-up alarm and a 5-minute alarm, in time order", () => {
  const plans = planJourneyAlarms(journey(), new Date(2026, 10, 2, 10, 0));
  assert.deepEqual(
    plans.map((p) => p.kind),
    ["evening", "wake", "ready"],
  );
  assert.deepEqual(hm(plans[0].at), [12, 20, 0]);
  assert.deepEqual(hm(plans[1].at), [13, 7, 30]);
  assert.deepEqual(hm(plans[2].at), [13, 7, 55]);
  assert.match(plans[1].title, /8:00 AM/);
  assert.match(plans[0].body, /Chennai to Madurai/);
});

test("Tatkal alone is just one wake-up alarm the day before the journey", () => {
  const plans = planJourneyAlarms(journey({ advance: false, tatkal: "ac" }), new Date(2026, 10, 2));
  assert.deepEqual(
    plans.map((p) => p.kind),
    ["tatkal"],
  );
  assert.deepEqual(hm(plans[0].at), [11, 9, 30]); // 11 Jan, 30 minutes before 10:00 AM
  assert.match(plans[0].title, /Tatkal opens at 10:00 AM/);

  const nonAc = planJourneyAlarms(journey({ advance: false, tatkal: "non_ac", wakeLeadMinutes: 60 }), new Date(2026, 10, 2));
  assert.deepEqual(hm(nonAc[0].at), [11, 10, 0]);
});

test("advance and Tatkal together give both sets, in time order", () => {
  const plans = planJourneyAlarms(journey({ tatkal: "ac" }), new Date(2026, 10, 2));
  assert.deepEqual(
    plans.map((p) => p.kind),
    ["evening", "wake", "ready", "tatkal"],
  );
});

test("the wake-up lead is the owner's choice", () => {
  const plans = planJourneyAlarms(journey({ wakeLeadMinutes: 60 }), new Date(2026, 10, 2));
  const wake = plans.find((p) => p.kind === "wake")!;
  assert.deepEqual([wake.at.getHours(), wake.at.getMinutes()], [7, 0]);
});

test("alarms that are already in the past are left out", () => {
  const plans = planJourneyAlarms(journey(), new Date(2026, 10, 13, 7, 40));
  assert.deepEqual(
    plans.map((p) => p.kind),
    ["ready"],
  );
  assert.deepEqual(planJourneyAlarms(journey(), new Date(2026, 10, 13, 9, 0)), []);
});

test("past journeys plan nothing, and journeys are planned together in time order", () => {
  const now = new Date(2026, 10, 2, 10, 0);
  const plans = planAlarms(
    [journey({ id: "late", journeyDate: "2027-02-01" }), journey({ id: "gone", journeyDate: "2026-10-01" }), journey({ id: "early" })],
    now,
  );
  assert.equal(plans.length, 6);
  assert.ok(plans.every((p) => p.journeyId !== "gone"));
  assert.equal(plans[0].journeyId, "early");
  assert.deepEqual(
    plans.map((p) => p.at.getTime()),
    [...plans.map((p) => p.at.getTime())].sort((a, b) => a - b),
  );
});

test("a journey needs advance booking, Tatkal, or both", () => {
  assert.equal(validateAlarms({ advance: true, tatkal: "none" }), null);
  assert.equal(validateAlarms({ advance: false, tatkal: "non_ac" }), null);
  assert.notEqual(validateAlarms({ advance: false, tatkal: "none" }), null);
});

test("an alarm id is a stable UUID that differs by journey and by kind", () => {
  const id = alarmUuid("tj-1", "wake");
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(alarmUuid("tj-1", "wake"), id);
  assert.notEqual(alarmUuid("tj-1", "ready"), id);
  assert.notEqual(alarmUuid("tj-1", "tatkal"), id);
  assert.notEqual(alarmUuid("tj-2", "wake"), id);
});

test("without AlarmKit the wake-up, 5-minute and Tatkal alarms are repeated a minute apart", () => {
  const plans = planJourneyAlarms(journey(), new Date(2026, 10, 2));
  const list = planNotifications(plans, false);
  assert.equal(list.length, 1 + 5 + 3);
  assert.equal(new Set(list.map((n) => n.identifier)).size, list.length);
  assert.ok(list.every((n) => n.identifier.startsWith("train-tj-1-")));
  const wake = list.filter((n) => n.identifier.includes("-wake-"));
  assert.deepEqual(
    wake.map((n) => n.at.getMinutes()),
    [30, 31, 32, 33, 34],
  );
  assert.deepEqual(
    list.map((n) => n.at.getTime()),
    [...list.map((n) => n.at.getTime())].sort((a, b) => a - b),
  );

  const tatkal = planNotifications(planJourneyAlarms(journey({ advance: false, tatkal: "ac" }), new Date(2026, 10, 2)), false);
  assert.equal(tatkal.length, 5);
  const everything = planNotifications(planJourneyAlarms(journey({ tatkal: "ac" }), new Date(2026, 10, 2)), false);
  assert.equal(everything.length, 1 + 5 + 3 + 5);
});

test("with AlarmKit only the evening reminder is a notification", () => {
  const list = planNotifications(planJourneyAlarms(journey({ tatkal: "ac" }), new Date(2026, 10, 2)), true);
  assert.equal(list.length, 1);
  assert.ok(list[0].identifier.includes("-evening-"));
  assert.equal(planNotifications(planJourneyAlarms(journey({ advance: false, tatkal: "ac" }), new Date(2026, 10, 2)), true).length, 0);
});

test("only the soonest notifications are kept", () => {
  const plans = planAlarms(
    Array.from({ length: 12 }, (_, i) => journey({ id: `j${i}`, journeyDate: `2027-0${(i % 9) + 1}-15` })),
    new Date(2026, 10, 2),
  );
  const all = planNotifications(plans, false);
  assert.ok(all.length > 60);
  const kept = capNotifications(all);
  assert.equal(kept.length, 60);
  assert.deepEqual(kept, all.slice(0, 60));
});

test("the journey label is required and kept short", () => {
  assert.notEqual(validateLabel("  "), null);
  assert.equal(validateLabel("Chennai to Madurai"), null);
  assert.notEqual(validateLabel("x".repeat(61)), null);
});
