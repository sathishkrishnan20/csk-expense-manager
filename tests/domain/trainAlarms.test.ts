import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LEGACY_ALARM_KINDS,
  REAL_ALARM_KINDS,
  alarmUuid,
  bookingFromColumns,
  bookingOpenDate,
  bookingOpensAt,
  bookingToColumns,
  capNotifications,
  describeSchedule,
  describeStatus,
  describeSyncOutcome,
  formatClock,
  formatDay,
  formatHm,
  isValidHm,
  journeyStatus,
  listClock,
  normalizeTimes,
  planAlarms,
  planJourneyAlarms,
  planNotifications,
  toHm,
  validateLabel,
  validateTimes,
  type Booking,
  type JourneyForAlarms,
} from "../../src/domain/trainAlarms";

const ADVANCE_TIMES = ["07:45", "07:55", "07:58", "08:00"];

const journey = (over: Partial<JourneyForAlarms> = {}): JourneyForAlarms => ({
  id: "tj-1",
  label: "Chennai to Madurai",
  journeyDate: "2027-01-12",
  booking: "advance",
  alarmTimes: ADVANCE_TIMES,
  ...over,
});

const NOW = new Date(2026, 10, 2, 10, 0); // 2 Nov 2026, 10:00 AM
// "day hour:minute" of every plan, e.g. "13 7:45"
const when = (plans: { at: Date }[]) => plans.map((p) => `${p.at.getDate()} ${p.at.getHours()}:${String(p.at.getMinutes()).padStart(2, "0")}`);

test("advance booking opens 60 days before the journey, across months and years", () => {
  assert.equal(bookingOpenDate("2027-01-12", "advance"), "2026-11-13");
  assert.equal(bookingOpenDate("2026-12-31", "advance"), "2026-11-01");
  assert.equal(bookingOpenDate("2028-03-01", "advance"), "2028-01-01"); // 2028 is a leap year
});

test("Tatkal opens the day before the journey", () => {
  assert.equal(bookingOpenDate("2027-01-12", "tatkal_ac"), "2027-01-11");
  assert.equal(bookingOpenDate("2027-01-01", "tatkal_non_ac"), "2026-12-31");
});

test("booking opens at 8:00 AM (advance), 10:00 AM (Tatkal AC) or 11:00 AM (Tatkal Non AC)", () => {
  const at = (journeyDate: string, b: Booking) => {
    const d = bookingOpensAt(journeyDate, b);
    return [d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()];
  };
  assert.deepEqual(at("2027-01-12", "advance"), [2026, 10, 13, 8, 0]);
  assert.deepEqual(at("2027-01-12", "tatkal_ac"), [2027, 0, 11, 10, 0]);
  assert.deepEqual(at("2027-01-12", "tatkal_non_ac"), [2027, 0, 11, 11, 0]);
});

test("times of day are read, kept in order and written in plain words", () => {
  assert.equal(formatHm("07:45"), "7:45 AM");
  assert.equal(formatHm("00:05"), "12:05 AM");
  assert.equal(formatHm("12:30"), "12:30 PM");
  assert.equal(formatHm("20:00"), "8:00 PM");
  assert.equal(formatClock(new Date(2026, 0, 1, 8, 0)), "8:00 AM");
  assert.equal(toHm(new Date(2026, 0, 1, 7, 5)), "07:05");
  assert.equal(isValidHm("07:45"), true);
  assert.equal(isValidHm("24:00"), false);
  assert.equal(isValidHm("7:45"), false);
  assert.deepEqual(normalizeTimes(["08:00", "07:45", "07:45", "bad", "7:5"]), ["07:45", "08:00"]);
  assert.equal(listClock(["07:45"]), "7:45 AM");
  assert.equal(listClock(["07:45", "08:00"]), "7:45 AM and 8:00 AM");
  assert.equal(listClock(ADVANCE_TIMES), "7:45 AM, 7:55 AM, 7:58 AM and 8:00 AM");
});

test("a day is named with its weekday", () => {
  assert.equal(formatDay("2026-11-13"), "Friday, November 13, 2026");
  assert.equal(formatDay("2027-01-11"), "Monday, January 11, 2027");
});

test("the stored columns map to one booking and back", () => {
  for (const b of ["advance", "tatkal_ac", "tatkal_non_ac"] as const) {
    const c = bookingToColumns(b);
    assert.equal(bookingFromColumns(c.advance, c.tatkal), b);
  }
  assert.equal(bookingFromColumns(true, "ac"), "advance"); // a row from when both could be set
  assert.equal(bookingFromColumns(false, "none"), "advance");
});

test("a journey is waiting, open or past, and says so", () => {
  const morning = new Date(2026, 10, 2, 7, 0);
  const advance = (journeyDate: string) => ({ journeyDate, booking: "advance" as const });

  const far = journeyStatus(advance("2027-01-12"), NOW);
  assert.equal(far.phase, "waiting");
  assert.equal(far.daysToOpen, 11);
  assert.equal(describeStatus(far), "Opens in 11 days");
  assert.equal(describeStatus(journeyStatus(advance("2027-01-02"), NOW)), "Opens tomorrow at 8:00 AM");

  const today = journeyStatus(advance("2027-01-01"), morning);
  assert.equal(today.phase, "waiting");
  assert.equal(describeStatus(today), "Opens today at 8:00 AM");

  const opened = journeyStatus(advance("2027-01-01"), NOW);
  assert.equal(opened.phase, "open");
  assert.equal(describeStatus(opened), "Booking is open");

  const gone = journeyStatus(advance("2026-11-01"), NOW);
  assert.equal(gone.phase, "past");
  assert.equal(describeStatus(gone), "Journey over");
});

test("Tatkal status says Tatkal", () => {
  const ac = (journeyDate: string) => ({ journeyDate, booking: "tatkal_ac" as const });
  const early = new Date(2026, 10, 2, 7, 0);
  assert.equal(describeStatus(journeyStatus(ac("2026-11-04"), early)), "Tatkal opens tomorrow at 10:00 AM");
  assert.equal(describeStatus(journeyStatus(ac("2026-11-03"), early)), "Tatkal opens today at 10:00 AM");
  assert.equal(describeStatus(journeyStatus(ac("2026-11-03"), NOW)), "Tatkal is open");
  assert.equal(describeStatus(journeyStatus({ journeyDate: "2026-11-03", booking: "tatkal_non_ac" }, NOW)), "Tatkal opens today at 11:00 AM");
});

test("advance booking: notifications the evening before and at 7:00 AM, alarms at the chosen times", () => {
  const plans = planJourneyAlarms(journey(), NOW);
  assert.deepEqual(
    plans.map((p) => p.kind),
    ["evening", "morning", "a0", "a1", "a2", "a3"],
  );
  assert.deepEqual(when(plans), ["12 20:00", "13 7:00", "13 7:45", "13 7:55", "13 7:58", "13 8:00"]);
  assert.deepEqual(
    plans.map((p) => p.reminder),
    [true, true, false, false, false, false],
  );
  assert.match(plans[0].title, /Booking opens tomorrow at 8:00 AM/);
  assert.match(plans[1].title, /Booking opens today at 8:00 AM/);
  assert.match(plans[2].title, /Wake up: Booking opens at 8:00 AM/);
  assert.match(plans[3].title, /in 5 minutes/);
  assert.match(plans[4].title, /in 2 minutes/);
  assert.match(plans[5].title, /opens now/);
  assert.match(plans[0].body, /Chennai to Madurai/);
});

test("Tatkal AC and Tatkal Non AC wake the owner the day before the journey", () => {
  const ac = planJourneyAlarms(journey({ booking: "tatkal_ac", alarmTimes: ["09:45", "09:55", "09:58", "10:00"] }), NOW);
  assert.deepEqual(when(ac), ["10 20:00", "11 7:00", "11 9:45", "11 9:55", "11 9:58", "11 10:00"]);
  assert.match(ac[2].title, /Tatkal opens at 10:00 AM/);
  assert.match(ac[0].title, /Tatkal opens tomorrow at 10:00 AM/);

  const rest = planJourneyAlarms(journey({ booking: "tatkal_non_ac", alarmTimes: ["10:45", "10:55", "10:58", "11:00"] }), NOW);
  assert.deepEqual(when(rest), ["10 20:00", "11 7:00", "11 10:45", "11 10:55", "11 10:58", "11 11:00"]);
});

test("the owner's own alarm times are used, in time order, even after the opening", () => {
  const plans = planJourneyAlarms(journey({ alarmTimes: ["07:30", "06:30", "08:05", "07:59"] }), NOW);
  const alarms = plans.filter((p) => !p.reminder);
  assert.deepEqual(when(alarms), ["13 6:30", "13 7:30", "13 7:59", "13 8:05"]);
  assert.match(alarms[0].title, /Wake up: Booking opens at 8:00 AM/);
  assert.match(alarms[1].title, /in 30 minutes/);
  assert.match(alarms[2].title, /in 1 minute$/);
  assert.match(alarms[3].title, /is open: book now/);
});

test("alarms and notifications that are already in the past are left out, and the rest keep their numbers", () => {
  assert.deepEqual(
    planJourneyAlarms(journey(), new Date(2026, 10, 13, 7, 56)).map((p) => p.kind),
    ["a2", "a3"],
  );
  assert.deepEqual(planJourneyAlarms(journey(), new Date(2026, 10, 13, 8, 1)), []);
});

test("past journeys plan nothing, and journeys are planned together in time order", () => {
  const plans = planAlarms(
    [journey({ id: "late", journeyDate: "2027-02-01" }), journey({ id: "gone", journeyDate: "2026-10-01" }), journey({ id: "early" })],
    NOW,
  );
  assert.equal(plans.length, 12);
  assert.ok(plans.every((p) => p.journeyId !== "gone"));
  assert.equal(plans[0].journeyId, "early");
  assert.deepEqual(
    plans.map((p) => p.at.getTime()),
    [...plans.map((p) => p.at.getTime())].sort((a, b) => a - b),
  );
});

test("the screen says when booking opens and when the owner is woken, with weekdays", () => {
  const s = describeSchedule(journey(), NOW);
  assert.equal(s.opens, "Your booking opens on Friday, November 13, 2026 at 8:00 AM, 60 days before your journey date.");
  assert.equal(s.wake, "I will wake you on Friday, November 13, 2026 at 7:45 AM, 7:55 AM, 7:58 AM and 8:00 AM.");
  assert.equal(s.reminders, "You also get a notification on Thursday, November 12, 2026 at 8:00 PM and on Friday, November 13, 2026 at 7:00 AM.");

  const tatkal = describeSchedule(journey({ booking: "tatkal_ac", alarmTimes: ["09:45", "10:00"] }), NOW);
  assert.equal(tatkal.opens, "Your booking opens on Monday, January 11, 2027 at 10:00 AM, 1 day before your journey date.");
  assert.equal(tatkal.wake, "I will wake you on Monday, January 11, 2027 at 9:45 AM and 10:00 AM.");
});

test("the screen says so when some or all alarm times have passed", () => {
  const some = describeSchedule(journey(), new Date(2026, 10, 13, 7, 50));
  assert.equal(some.wake, "I will wake you on Friday, November 13, 2026 at 7:55 AM, 7:58 AM and 8:00 AM. (1 earlier time has already passed.)");
  assert.equal(some.reminders, "");

  const none = describeSchedule(journey(), new Date(2026, 10, 13, 9, 0));
  assert.equal(none.wake, "Every alarm time on Friday, November 13, 2026 has already passed, so no alarm will be set.");

  assert.match(describeSchedule(journey({ alarmTimes: [] }), NOW).wake, /Add at least one alarm time/);
});

test("a journey needs between one and eight valid alarm times", () => {
  assert.equal(validateTimes(ADVANCE_TIMES), null);
  assert.notEqual(validateTimes([]), null);
  assert.notEqual(validateTimes(["07:45", "nope"]), null);
  assert.notEqual(validateTimes(["01:00", "02:00", "03:00", "04:00", "05:00", "06:00", "07:00", "08:00", "09:00"]), null);
});

test("an alarm id is a stable UUID that differs by journey and by alarm number", () => {
  const id = alarmUuid("tj-1", "a0");
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(alarmUuid("tj-1", "a0"), id);
  assert.notEqual(alarmUuid("tj-1", "a1"), id);
  assert.notEqual(alarmUuid("tj-2", "a0"), id);
});

test("every alarm number has its own id, and the ids earlier builds used are also cancelled", () => {
  assert.equal(REAL_ALARM_KINDS.length, 8);
  assert.equal(new Set(REAL_ALARM_KINDS.map((k) => alarmUuid("tj-1", k))).size, 8);
  assert.ok(REAL_ALARM_KINDS.every((k) => /^a\d$/.test(k)));
  assert.ok(LEGACY_ALARM_KINDS.includes("wake") && LEGACY_ALARM_KINDS.includes("advance-t15"));
  assert.ok(LEGACY_ALARM_KINDS.every((k) => !REAL_ALARM_KINDS.includes(k as never)));
});

test("without AlarmKit every alarm is three notifications a minute apart, besides the two reminders", () => {
  const list = planNotifications(planJourneyAlarms(journey(), NOW), false);
  assert.equal(list.length, 2 + 4 * 3);
  assert.equal(new Set(list.map((n) => n.identifier)).size, list.length);
  assert.ok(list.every((n) => n.identifier.startsWith("train-tj-1-")));
  const first = list.filter((n) => n.identifier.includes("-a0-"));
  assert.deepEqual(
    first.map((n) => `${n.at.getHours()}:${n.at.getMinutes()}`),
    ["7:45", "7:46", "7:47"],
  );
  assert.deepEqual(
    list.map((n) => n.at.getTime()),
    [...list.map((n) => n.at.getTime())].sort((a, b) => a - b),
  );
});

test("with AlarmKit only the two reminders are notifications", () => {
  const list = planNotifications(planJourneyAlarms(journey(), NOW), true);
  assert.equal(list.length, 2);
  assert.ok(list.every((n) => n.identifier.includes("-evening-") || n.identifier.includes("-morning-")));
});

test("only the soonest notifications are kept", () => {
  const plans = planAlarms(
    Array.from({ length: 6 }, (_, i) => journey({ id: `j${i}`, journeyDate: `2027-0${i + 1}-15` })),
    NOW,
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

test("the message after a save says what rings, and how many alarms were refused and why", () => {
  const ok = { alarmKitDenied: false, failed: 0, errors: [] };
  assert.equal(describeSyncOutcome({ ...ok, backend: "alarmkit" }), "Alarms set. They ring like a Clock alarm.");
  assert.equal(describeSyncOutcome({ ...ok, backend: "notifications" }), "The reminders are notifications.");
  assert.match(describeSyncOutcome({ ...ok, backend: "notifications", alarmKitDenied: true }), /^iOS did not allow alarms for this app, so the reminders are notifications\.$/);
  assert.match(describeSyncOutcome({ ...ok, backend: "none" }), /notifications are switched off/);
  assert.equal(
    describeSyncOutcome({ backend: "alarmkit", alarmKitDenied: false, failed: 2, errors: ["iOS did not accept the alarm", "limit reached"] }),
    "Alarms set. They ring like a Clock alarm. 2 could not be set: iOS did not accept the alarm; limit reached.",
  );
  assert.equal(describeSyncOutcome({ backend: "notifications", alarmKitDenied: false, failed: 1, errors: [] }), "The reminders are notifications. 1 could not be set.");
});
