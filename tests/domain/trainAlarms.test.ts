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
  advanceMissed,
  buildCheckList,
  alarmTimeMarks,
  droppedText,
  triggerToDate,
  parseNotificationId,
  parseSetAlarms,
  type SetAlarm,
  bookedLockedText,
  bookingInfo,
  canMarkBooked,
  describeBooked,
  filterJourneys,
  normalisePnr,
  planAlarms,
  validatePnr,
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
  booked: false,
  pnr: null,
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

// ---- booked and the PNR

test("a PNR is 10 digits, optional, and spaces or hyphens between them are ignored", () => {
  assert.equal(validatePnr(""), null);
  assert.equal(validatePnr("  "), null);
  assert.equal(validatePnr("4521398760"), null);
  assert.equal(validatePnr("452-139 8760"), null);
  for (const bad of ["452139876", "45213987601", "45213987AB", "PNR4521398760"]) assert.equal(validatePnr(bad), "A PNR has 10 digits", bad);
});

test("a PNR is stored as digits, and only on a booked journey", () => {
  assert.equal(normalisePnr(" 452-139 8760 ", true), "4521398760");
  assert.equal(normalisePnr("", true), null);
  assert.equal(normalisePnr(null, true), null);
  assert.equal(normalisePnr("4521398760", false), null); // not booked: the PNR is dropped
  assert.equal(describeBooked({ pnr: "4521398760" }), "Booked · PNR 4521398760");
  assert.equal(describeBooked({ pnr: null }), "Booked");
});

test("a booked journey sets no alarms, and one that is not booked still does", () => {
  const now = new Date(2026, 10, 1, 12, 0);
  const alarms = (j: JourneyForAlarms[]) => planAlarms(j, now).map((a) => a.journeyId);
  const open = journey({ id: "open" });
  const booked = journey({ id: "booked", booked: true, pnr: "4521398760" });
  assert.ok(alarms([open]).includes("open"));
  assert.deepEqual(alarms([booked]), []);
  assert.ok(!alarms([open, booked]).includes("booked") && alarms([open, booked]).includes("open"));
  // un-booking brings the alarms back
  assert.ok(alarms([{ ...booked, booked: false }]).includes("booked"));
});

// ---- the list filter, and switching a journey that is not booked to Tatkal

test("the list can show everything, what is still to book, or what is booked", () => {
  const list = [
    { id: "ahead-open", journeyDate: "2026-12-01", booked: false },
    { id: "ahead-booked", journeyDate: "2026-12-05", booked: true },
    { id: "over-unbooked", journeyDate: "2026-10-01", booked: false },
    { id: "over-booked", journeyDate: "2026-10-02", booked: true },
  ];
  const ids = (show: Parameters<typeof filterJourneys>[1]) => filterJourneys(list, show, "2026-11-10").map((j) => j.id);
  assert.deepEqual(ids("all"), ["ahead-open", "ahead-booked", "over-unbooked", "over-booked"]);
  assert.deepEqual(ids("not_booked"), ["ahead-open"]); // one that is over without a booking is of no use any more
  assert.deepEqual(ids("booked"), ["ahead-booked", "over-booked"]); // kept as a record
  assert.deepEqual(filterJourneys([], "booked", "2026-11-10"), []);
});

test("a journey whose advance booking was missed can be switched to Tatkal, and its alarms move to the day before", () => {
  const now = new Date(2026, 10, 10, 12, 0); // 10 Nov 2026
  const base = journey({ id: "trip", journeyDate: "2026-11-20", booking: "advance", alarmTimes: bookingInfo("advance").defaultTimes });

  // Advance opened 60 days before (21 Sep): nothing is left to ring, and the form can say Tatkal is the way
  assert.deepEqual(planAlarms([base], now), []);
  assert.equal(advanceMissed(base, now), true);

  // The same journey, saved as Tatkal AC: it opens on 19 Nov at 10:00, so the alarms ring then, with the reminder the evening before
  const tatkal = { ...base, booking: "tatkal_ac" as const, alarmTimes: bookingInfo("tatkal_ac").defaultTimes };
  const plan = planAlarms([tatkal], now);
  const at = (a: (typeof plan)[number]) => `${a.at.getFullYear()}-${String(a.at.getMonth() + 1).padStart(2, "0")}-${String(a.at.getDate()).padStart(2, "0")} ${String(a.at.getHours()).padStart(2, "0")}:${String(a.at.getMinutes()).padStart(2, "0")}`;
  assert.deepEqual(plan.filter((a) => !a.reminder).map(at), ["2026-11-19 09:45", "2026-11-19 09:55", "2026-11-19 09:58", "2026-11-19 10:00"]);
  assert.deepEqual(plan.filter((a) => a.reminder).map(at), ["2026-11-18 20:00", "2026-11-19 07:00"]);
  assert.equal(advanceMissed(tatkal, now), false); // already Tatkal

  // Tatkal Non AC opens an hour later
  const nonAc = { ...base, booking: "tatkal_non_ac" as const, alarmTimes: bookingInfo("tatkal_non_ac").defaultTimes };
  assert.equal(planAlarms([nonAc], now).filter((a) => !a.reminder).map(at).at(-1), "2026-11-19 11:00");
});

test("the Tatkal hint shows only for an advance booking that has opened and is not booked, still ahead", () => {
  const now = new Date(2026, 10, 10, 12, 0);
  assert.equal(advanceMissed({ journeyDate: "2026-11-20", booking: "advance", booked: false }, now), true);
  assert.equal(advanceMissed({ journeyDate: "2026-11-20", booking: "advance", booked: true }, now), false); // already booked
  assert.equal(advanceMissed({ journeyDate: "2027-06-01", booking: "advance", booked: false }, now), false); // booking has not opened yet
  assert.equal(advanceMissed({ journeyDate: "2026-11-01", booking: "advance", booked: false }, now), false); // the journey is over
  assert.equal(advanceMissed({ journeyDate: "2026-11-20", booking: "tatkal_ac", booked: false }, now), false);
});

test("a journey switched from advance to Tatkal and back is the same journey with its own alarms each time", () => {
  const now = new Date(2026, 10, 10, 12, 0);
  const trip = journey({ id: "trip", journeyDate: "2027-01-12", booking: "advance", alarmTimes: ADVANCE_TIMES });
  const asTatkal = { ...trip, booking: "tatkal_non_ac" as const, alarmTimes: bookingInfo("tatkal_non_ac").defaultTimes };
  const ids = (j: JourneyForAlarms) => new Set(planAlarms([j], now).map((a) => a.journeyId));
  assert.deepEqual([...ids(trip)], ["trip"]);
  assert.deepEqual([...ids(asTatkal)], ["trip"]); // same id, so the old alarms are replaced, not duplicated
  assert.ok(planAlarms([trip], now)[0].at.getTime() !== planAlarms([asTatkal], now)[0].at.getTime());
});

// ---- Booked can be set only once booking has opened

test("a journey 72 days away on an advance booking cannot be marked booked yet: advance opens 60 days before, at 8:00 AM", () => {
  const trip = { journeyDate: "2027-01-12", booking: "advance" as const }; // opens on 13 Nov 2026 at 8:00
  assert.equal(canMarkBooked(trip, new Date(2026, 10, 1, 12, 0)), false); // 72 days before: not open
  assert.equal(canMarkBooked(trip, new Date(2026, 10, 12, 23, 59)), false); // the evening before it opens
  assert.equal(canMarkBooked(trip, new Date(2026, 10, 13, 7, 59)), false); // a minute before
  assert.equal(canMarkBooked(trip, new Date(2026, 10, 13, 8, 0)), true); // the moment it opens
  assert.equal(canMarkBooked(trip, new Date(2026, 11, 20, 9, 0)), true); // any time after
});

test("Tatkal can be marked booked from the day before, at 10:00 (AC) or 11:00 (Non AC)", () => {
  const ac = { journeyDate: "2026-11-20", booking: "tatkal_ac" as const };
  const nonAc = { journeyDate: "2026-11-20", booking: "tatkal_non_ac" as const };
  assert.equal(canMarkBooked(ac, new Date(2026, 10, 18, 12, 0)), false); // two days before
  assert.equal(canMarkBooked(ac, new Date(2026, 10, 19, 9, 59)), false);
  assert.equal(canMarkBooked(ac, new Date(2026, 10, 19, 10, 0)), true);
  assert.equal(canMarkBooked(nonAc, new Date(2026, 10, 19, 10, 59)), false);
  assert.equal(canMarkBooked(nonAc, new Date(2026, 10, 19, 11, 0)), true);
});

test("switching the same journey to Tatkal unlocks Booked when Tatkal has opened, and the reverse locks it", () => {
  const now = new Date(2026, 10, 19, 12, 0); // the day before a 20 Nov journey
  assert.equal(canMarkBooked({ journeyDate: "2026-11-20", booking: "tatkal_ac" }, now), true);
  assert.equal(canMarkBooked({ journeyDate: "2027-03-01", booking: "tatkal_ac" }, now), false); // a far journey, whatever the type
  assert.equal(canMarkBooked({ journeyDate: "2027-03-01", booking: "advance" }, now), false);
});

test("the reason Booked is locked says when booking opens and how long that is", () => {
  const now = new Date(2026, 10, 1, 12, 0);
  const far = bookedLockedText({ journeyDate: "2027-01-12", booking: "advance" }, now);
  assert.match(far, /^Advance booking has not opened yet: it opens on .*13.* at 8:00 AM \(in 12 days\)\. You can set Booked to Yes after that\.$/);
  const tomorrow = bookedLockedText({ journeyDate: "2026-11-03", booking: "tatkal_ac" }, now);
  assert.match(tomorrow, /^Tatkal booking has not opened yet: .* at 10:00 AM \(tomorrow\)\./);
  assert.match(bookedLockedText({ journeyDate: "2026-11-02", booking: "tatkal_non_ac" }, now), /at 11:00 AM \(today\)/);
});

// ---- the list of what is set on the iPhone

const setAlarm = (over: Partial<SetAlarm>): SetAlarm => ({ id: "x", journeyId: "tj-abc-123", kind: "a0", at: "2026-11-19T04:15:00.000Z", title: "Wake up: Tatkal opens at 10:00 AM", via: "alarm", ...over });

test("a notification identifier is read back into its journey, kind and copy", () => {
  assert.deepEqual(parseNotificationId("train-tj-abc-123-a0-1"), { journeyId: "tj-abc-123", kind: "a0", copy: 1 });
  assert.deepEqual(parseNotificationId("train-tj-m3k9-x2-evening-0"), { journeyId: "tj-m3k9-x2", kind: "evening", copy: 0 });
  assert.equal(parseNotificationId("traintest-0"), null);
  assert.equal(parseNotificationId("other-tj-1-a0-0"), null);
  assert.equal(parseNotificationId("train-tj-1-bogus-0"), null);
});

test("what was stored is read back, and anything malformed is dropped", () => {
  const good = setAlarm({ id: "g" });
  assert.deepEqual(parseSetAlarms(JSON.stringify([good, { id: 5 }, null, { ...good, via: "carrier-pigeon" }, { ...good, at: "soon" }])), [good]);
  assert.deepEqual(parseSetAlarms(null), []);
  assert.deepEqual(parseSetAlarms("not json"), []);
  assert.deepEqual(parseSetAlarms('{"a":1}'), []);
});

test("a trigger read back from iOS is turned into a time, in each shape iOS gives it", () => {
  assert.equal(triggerToDate({ type: "date", value: Date.UTC(2026, 10, 19, 4, 15) })?.toISOString(), "2026-11-19T04:15:00.000Z"); // milliseconds
  assert.equal(triggerToDate({ type: "date", value: Date.UTC(2026, 10, 19, 4, 15) / 1000 })?.toISOString(), "2026-11-19T04:15:00.000Z"); // seconds
  const calendar = triggerToDate({ type: "calendar", dateComponents: { year: 2026, month: 11, day: 19, hour: 9, minute: 45, second: 0 } })!;
  assert.deepEqual([calendar.getFullYear(), calendar.getMonth(), calendar.getDate(), calendar.getHours(), calendar.getMinutes()], [2026, 10, 19, 9, 45]);
  assert.equal(triggerToDate({ type: "timeInterval", seconds: 60 }), null);
  assert.equal(triggerToDate(null), null);
  assert.equal(triggerToDate("soon"), null);
  assert.equal(triggerToDate({ dateComponents: { year: 2026 } }), null);
});

// ---- the list: records plus one mark

const CHECK_NOW = new Date(2026, 10, 10, 12, 0); // 10 Nov 2026
const TRIP = journey({ id: "tj-abc-123", label: "SMVT to VLY", journeyDate: "2026-11-20", booking: "tatkal_ac", alarmTimes: bookingInfo("tatkal_ac").defaultTimes });
const PLANS = planAlarms([TRIP], CHECK_NOW); // the evening reminder, the morning reminder and four wake-up alarms
const LABELS = [{ id: "tj-abc-123", label: "SMVT to VLY" }];
const ALARM_IDS = ["a0", "a1", "a2", "a3"].map((k) => alarmUuid("tj-abc-123", k));
const asPhoneAlarms = (ids: string[], at: (i: number) => Date | null = (i) => PLANS.filter((p) => !p.reminder)[i].at) =>
  ids.map((id, i) => ({ id: id.toUpperCase(), state: "scheduled", at: at(i) })); // Swift writes UUIDs in capitals
const asPhoneReminders = () => PLANS.filter((p) => p.reminder).map((p) => ({ identifier: `train-tj-abc-123-${p.kind}-0`, title: p.title, at: p.at }));

test("every alarm and reminder the journeys call for is listed, soonest first, and each is a check when iOS holds it", () => {
  const list = buildCheckList({ plans: PLANS, journeys: LABELS, alarms: asPhoneAlarms(ALARM_IDS), reminders: asPhoneReminders(), record: [] });
  assert.equal(list.rows.length, 6);
  assert.deepEqual(list.rows.map((r) => r.type), ["Reminder", "Reminder", "Alarm", "Alarm", "Alarm", "Alarm"]);
  assert.ok(list.rows.every((r) => r.set));
  assert.ok(list.rows.every((r) => r.journeyLabel === "SMVT to VLY"));
  assert.deepEqual(list.rows.map((r) => r.at.getTime()), [...list.rows.map((r) => r.at.getTime())].sort((a, b) => a - b));
  assert.equal(list.alarmsFrom, "ios");
  assert.equal(list.unlinked, 0);
});

test("an alarm iOS does not hold is a cross, and so is a reminder it does not hold", () => {
  const list = buildCheckList({ plans: PLANS, journeys: LABELS, alarms: asPhoneAlarms(ALARM_IDS.slice(0, 2)), reminders: asPhoneReminders().slice(0, 1), record: [] });
  const marks = list.rows.map((r) => `${r.type}:${r.set}`);
  assert.deepEqual(marks, ["Reminder:true", "Reminder:false", "Alarm:true", "Alarm:true", "Alarm:false", "Alarm:false"]);
  // nothing set at all
  const none = buildCheckList({ plans: PLANS, journeys: LABELS, alarms: [], reminders: [], record: [] });
  assert.ok(none.rows.every((r) => !r.set));
  assert.equal(none.rows.length, 6); // still listed: the list is what the journeys call for
});

test("an alarm iOS holds at the wrong time is stale, so it is a cross until it is set again", () => {
  const wrong = asPhoneAlarms(ALARM_IDS, (i) => new Date(PLANS.filter((p) => !p.reminder)[i].at.getTime() + 10 * 60_000)); // ten minutes off
  const list = buildCheckList({ plans: PLANS, journeys: LABELS, alarms: wrong, reminders: asPhoneReminders(), record: [] });
  assert.deepEqual(list.rows.filter((r) => r.type === "Alarm").map((r) => r.set), [false, false, false, false]);
  // a minute off is fine; and a time iOS did not give does not count against it
  const close = asPhoneAlarms(ALARM_IDS, (i) => new Date(PLANS.filter((p) => !p.reminder)[i].at.getTime() + 60_000));
  assert.ok(buildCheckList({ plans: PLANS, journeys: LABELS, alarms: close, reminders: asPhoneReminders(), record: [] }).rows.every((r) => r.set));
  assert.ok(buildCheckList({ plans: PLANS, journeys: LABELS, alarms: asPhoneAlarms(ALARM_IDS, () => null), reminders: asPhoneReminders(), record: [] }).rows.every((r) => r.set));
});

test("without real alarms, a wake-up counts as set when its run of notifications is pending", () => {
  const wake = PLANS.filter((p) => !p.reminder);
  const run = wake.flatMap((p) => [0, 1, 2].map((i) => ({ identifier: `train-tj-abc-123-${p.kind}-${i}`, title: p.title, at: new Date(p.at.getTime() + i * 60_000) })));
  const list = buildCheckList({ plans: PLANS, journeys: LABELS, alarms: [], reminders: [...asPhoneReminders(), ...run], record: [] });
  assert.ok(list.rows.every((r) => r.set));
  // one copy of the run missing: that alarm is a cross
  const short = run.filter((r) => r.identifier !== "train-tj-abc-123-a1-2");
  const partial = buildCheckList({ plans: PLANS, journeys: LABELS, alarms: [], reminders: [...asPhoneReminders(), ...short], record: [] });
  assert.deepEqual(partial.rows.filter((r) => r.type === "Alarm").map((r) => r.set), [true, false, true, true]);
});

test("alarms iOS holds that are not in the list are counted, so nothing that will still ring is hidden", () => {
  const stray = { id: alarmUuid("tj-deleted", "a0").toUpperCase(), state: "scheduled", at: new Date(2026, 10, 25, 9, 45) };
  const list = buildCheckList({ plans: PLANS, journeys: LABELS, alarms: [...asPhoneAlarms(ALARM_IDS), stray], reminders: asPhoneReminders(), record: [] });
  assert.equal(list.unlinked, 1);
  assert.equal(list.rows.length, 6); // the stray is not a row: the list is what the journeys call for
  // a booked journey plans nothing, so its alarms left on the phone are "not in the list" too
  const booked = buildCheckList({ plans: planAlarms([{ ...TRIP, booked: true }], CHECK_NOW), journeys: LABELS, alarms: asPhoneAlarms(ALARM_IDS), reminders: [], record: [] });
  assert.deepEqual([booked.rows.length, booked.unlinked], [0, 4]);
});

test("in a build that cannot read real alarms, the app's record of what iOS accepted stands in, and the list says so", () => {
  const record = ALARM_IDS.map((id, i) => setAlarm({ id, kind: `a${i}`, journeyId: "tj-abc-123", at: PLANS.filter((p) => !p.reminder)[i].at.toISOString() }));
  const list = buildCheckList({ plans: PLANS, journeys: LABELS, alarms: null, reminders: asPhoneReminders(), record });
  assert.equal(list.alarmsFrom, "record");
  assert.ok(list.rows.every((r) => r.set));
  assert.equal(list.unlinked, 0);
  // not in the record either: a cross
  const empty = buildCheckList({ plans: PLANS, journeys: LABELS, alarms: null, reminders: asPhoneReminders(), record: [] });
  assert.deepEqual(empty.rows.filter((r) => r.type === "Alarm").map((r) => r.set), [false, false, false, false]);
});

test("when iOS's reminders cannot be read either, the record decides, and a journey that is booked or over has no rows", () => {
  const record = PLANS.filter((p) => p.reminder).map((p) => setAlarm({ id: `train-tj-abc-123-${p.kind}-0`, kind: p.kind, at: p.at.toISOString(), via: "notification" }));
  const list = buildCheckList({ plans: PLANS, journeys: LABELS, alarms: [], reminders: null, record });
  assert.deepEqual(list.rows.filter((r) => r.type === "Reminder").map((r) => r.set), [true, true]);
  assert.deepEqual(buildCheckList({ plans: [], journeys: LABELS, alarms: [], reminders: [], record: [] }).rows, []);
});

test("each alarm time of a saved journey gets its own mark, and a time with no row gets none", () => {
  const list = buildCheckList({ plans: PLANS, journeys: LABELS, alarms: asPhoneAlarms(ALARM_IDS.slice(0, 2)), reminders: asPhoneReminders(), record: [] });
  const marks = alarmTimeMarks(list, "tj-abc-123");
  const times = bookingInfo("tatkal_ac").defaultTimes;
  assert.deepEqual(Object.keys(marks).sort(), [...times].sort());
  assert.deepEqual(times.map((hm) => marks[hm]), [true, true, false, false]); // the first two alarms are held, the last two are not
  assert.equal("09:30" in marks, false); // a time typed on the form and not saved has no mark
  assert.deepEqual(alarmTimeMarks(list, "another-journey"), {});
});

test("a journey with something not set on the iPhone gets a warning that says what and what to do, and one that is all set gets none", () => {
  const all = buildCheckList({ plans: PLANS, journeys: LABELS, alarms: asPhoneAlarms(ALARM_IDS), reminders: asPhoneReminders(), record: [] });
  assert.equal(droppedText(all, "tj-abc-123"), null);
  const some = buildCheckList({ plans: PLANS, journeys: LABELS, alarms: asPhoneAlarms(ALARM_IDS.slice(0, 3)), reminders: asPhoneReminders(), record: [] });
  assert.equal(droppedText(some, "tj-abc-123"), "1 alarm not set on this iPhone. Open this journey and tap Update to set it again.");
  const none = buildCheckList({ plans: PLANS, journeys: LABELS, alarms: [], reminders: [], record: [] });
  assert.equal(droppedText(none, "tj-abc-123"), "4 alarms and 2 reminders not set on this iPhone. Open this journey and tap Update to set them again.");
  assert.equal(droppedText(none, "another-journey"), null);
});
