import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { formatLongDate, fromISODate, toISODate } from "./format";

// Train booking alarms. A journey has one kind of booking: advance booking opens 60 days before the journey date at 8:00 AM, Tatkal
// booking opens the day before the journey (10:00 AM for AC classes, 11:00 AM for the rest). The owner forgets a single alarm, so each
// journey gets a run of alarms on the booking day, at times he can edit (they start as 7:45, 7:55, 7:58, 8:00 and the like), plus two
// notifications: one the evening before and one at 7:00 AM that day. Pure functions, no database and no device calls, so they are tested
// under Node (the scheduling itself is in alarms/).

export type Booking = "advance" | "tatkal_ac" | "tatkal_non_ac";

export interface BookingInfo {
  value: Booking;
  label: string;
  tatkal: boolean;
  daysBefore: number; // booking opens this many days before the journey date
  opensHour: number; // ... at this hour (local time)
  defaultTimes: string[]; // alarm times a new journey starts with, "HH:MM" on the booking day
}

export const BOOKINGS: BookingInfo[] = [
  { value: "advance", label: "Advance booking", tatkal: false, daysBefore: 60, opensHour: 8, defaultTimes: ["07:45", "07:55", "07:58", "08:00"] },
  { value: "tatkal_ac", label: "Tatkal AC", tatkal: true, daysBefore: 1, opensHour: 10, defaultTimes: ["09:45", "09:55", "09:58", "10:00"] },
  { value: "tatkal_non_ac", label: "Tatkal Non AC", tatkal: true, daysBefore: 1, opensHour: 11, defaultTimes: ["10:45", "10:55", "10:58", "11:00"] },
];

export const DEFAULT_BOOKING: Booking = "advance";

export const bookingInfo = (b: Booking): BookingInfo => BOOKINGS.find((x) => x.value === b) ?? BOOKINGS[0];

// At most this many alarms per journey (each is a separate alarm in iOS).
export const MAX_ALARMS = 8;

// The two notifications: the evening before the booking day (8 PM) and that morning (7 AM).
export const EVENING_HOUR = 20;
export const MORNING_HOUR = 7;

// When AlarmKit is not available the alarms are notifications, and one notification is easy to sleep through, so each alarm is
// repeated a minute apart. iOS keeps at most 64 pending local notifications, so the nearest ones win (see capNotifications).
export const ALARM_CHAIN = 3;
export const MAX_PENDING_NOTIFICATIONS = 60;

export const MAX_LABEL_LENGTH = 60;

// "evening" and "morning" are the notifications; a0, a1, ... are the alarms, numbered in time order.
export type AlarmKind = "evening" | "morning" | `a${number}`;

// Every id a real alarm can have, for cancelling by id (AlarmKit alarms are found by id; there is no list to ask).
export const REAL_ALARM_KINDS: AlarmKind[] = Array.from({ length: MAX_ALARMS }, (_, i): AlarmKind => `a${i}`);
// Ids earlier builds of the app used, cancelled too so an alarm they set does not outlive its journey.
export const LEGACY_ALARM_KINDS: string[] = [
  "wake",
  "ready",
  "tatkal",
  ...["advance", "tatkal"].flatMap((m) => ["t15", "t5", "t2", "t0"].map((s) => `${m}-${s}`)),
];

export interface JourneyFields {
  label: string;
  journeyDate: string; // yyyy-mm-dd
  booking: Booking;
  alarmTimes: string[]; // "HH:MM" (24-hour) on the booking day, in time order
}

export interface JourneyForAlarms extends JourneyFields {
  id: string;
}

export interface PlannedAlarm {
  journeyId: string;
  kind: AlarmKind;
  reminder: boolean; // a notification (evening / morning), not one of the alarms
  at: Date;
  title: string;
  body: string;
}

const addMinutes = (date: Date, minutes: number): Date => new Date(date.getTime() + minutes * 60_000);

// --- times of day -------------------------------------------------------------------------------------------------------------------

const HM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const isValidHm = (hm: string): boolean => HM.test(hm);

export function toHm(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

// A Date today at hh:mm, for the time picker.
export function hmToDate(hm: string, day: Date = new Date()): Date {
  const [h, m] = hm.split(":").map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0, 0);
}

// "7:45 AM" from "07:45".
export function formatHm(hm: string): string {
  const [h, m] = hm.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

// "8:00 AM" from a Date.
export const formatClock = (date: Date): string => formatHm(toHm(date));

// Valid times only, each once, in time order.
export function normalizeTimes(times: readonly string[]): string[] {
  return [...new Set(times.filter(isValidHm))].sort();
}

// "7:45 AM", "7:45 AM and 8:00 AM", "7:45 AM, 7:55 AM and 8:00 AM"
export function listClock(times: readonly string[]): string {
  const parts = times.map(formatHm);
  return parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

// --- booking dates ------------------------------------------------------------------------------------------------------------------

// The date booking opens for a journey on `journeyDate`: 60 days earlier for advance booking, the day before for Tatkal.
export function bookingOpenDate(journeyDate: string, booking: Booking): string {
  const journey = fromISODate(journeyDate);
  return toISODate(new Date(journey.getFullYear(), journey.getMonth(), journey.getDate() - bookingInfo(booking).daysBefore));
}

// The moment booking opens: 8:00 AM (advance), 10:00 AM (Tatkal AC) or 11:00 AM (Tatkal Non AC) on the booking date.
export function bookingOpensAt(journeyDate: string, booking: Booking): Date {
  const open = fromISODate(bookingOpenDate(journeyDate, booking));
  return new Date(open.getFullYear(), open.getMonth(), open.getDate(), bookingInfo(booking).opensHour, 0, 0, 0);
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// "Friday, November 13, 2026"
export function formatDay(iso: string): string {
  return `${WEEKDAYS[fromISODate(iso).getDay()]}, ${formatLongDate(iso)}`;
}

export function validateLabel(label: string): string | null {
  const trimmed = label.trim();
  if (trimmed === "") return "Enter where the journey is, for example Chennai to Madurai.";
  if (trimmed.length > MAX_LABEL_LENGTH) return `Keep it to ${MAX_LABEL_LENGTH} characters or fewer.`;
  return null;
}

export function validateTimes(times: readonly string[]): string | null {
  if (times.length === 0) return "Add at least one alarm time.";
  if (times.length > MAX_ALARMS) return `Use at most ${MAX_ALARMS} alarm times.`;
  return times.every(isValidHm) ? null : "One of the alarm times is not a valid time.";
}

// --- how the booking columns are stored -------------------------------------------------------------------------------------------
// The table keeps two columns from when a journey could have advance and Tatkal alarms together: `advance` (0|1) and `tatkal`
// (none|ac|non_ac). A journey now has one booking; a row that has both is read as advance booking.

export function bookingFromColumns(advance: boolean, tatkal: string): Booking {
  if (advance) return "advance";
  return tatkal === "ac" ? "tatkal_ac" : tatkal === "non_ac" ? "tatkal_non_ac" : "advance";
}

export function bookingToColumns(booking: Booking): { advance: boolean; tatkal: "none" | "ac" | "non_ac" } {
  return {
    advance: booking === "advance",
    tatkal: booking === "tatkal_ac" ? "ac" : booking === "tatkal_non_ac" ? "non_ac" : "none",
  };
}

// --- status ----------------------------------------------------------------------------------------------------------------------------

export type JourneyPhase = "waiting" | "open" | "past";

export interface JourneyStatus {
  phase: JourneyPhase;
  tatkal: boolean;
  opensAt: Date;
  // Whole days from today to the booking date; 0 on the day, negative once it has passed.
  daysToOpen: number;
}

const dayNumber = (iso: string): number => {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
};

// waiting: booking has not opened yet. open: it has and the journey is still ahead. past: the journey date is gone.
export function journeyStatus(j: Pick<JourneyFields, "journeyDate" | "booking">, now: Date): JourneyStatus {
  const opensAt = bookingOpensAt(j.journeyDate, j.booking);
  const today = toISODate(now);
  const phase: JourneyPhase = j.journeyDate < today ? "past" : opensAt.getTime() > now.getTime() ? "waiting" : "open";
  return {
    phase,
    tatkal: bookingInfo(j.booking).tatkal,
    opensAt,
    daysToOpen: dayNumber(bookingOpenDate(j.journeyDate, j.booking)) - dayNumber(today),
  };
}

// "Opens in 12 days", "Tatkal opens tomorrow at 10:00 AM", "Booking is open", "Journey over".
export function describeStatus(s: JourneyStatus): string {
  if (s.phase === "past") return "Journey over";
  if (s.phase === "open") return s.tatkal ? "Tatkal is open" : "Booking is open";
  const opens = s.tatkal ? "Tatkal opens" : "Opens";
  if (s.daysToOpen === 0) return `${opens} today at ${formatClock(s.opensAt)}`;
  if (s.daysToOpen === 1) return `${opens} tomorrow at ${formatClock(s.opensAt)}`;
  return `${opens} in ${s.daysToOpen} days`;
}

// --- what to tell the owner after the alarms are set ---------------------------------------------------------------------------------

export interface SyncOutcome {
  backend: "alarmkit" | "notifications" | "none"; // what rings the alarms
  alarmKitDenied: boolean; // AlarmKit is in the build but iOS did not allow it
  failed: number; // alarms or notifications iOS refused
  errors: string[]; // why, as iOS or the module said it
}

// One or two sentences for the message after a save: what rings, and, when something was refused, how many and why.
export function describeSyncOutcome(r: SyncOutcome): string {
  let text: string;
  if (r.backend === "alarmkit") text = "Alarms set. They ring like a Clock alarm.";
  else if (r.backend === "notifications") text = (r.alarmKitDenied ? "iOS did not allow alarms for this app, so the " : "The ") + "reminders are notifications.";
  else text = "No reminders were set: notifications are switched off for this app in iOS Settings.";
  if (r.failed > 0) {
    const why = r.errors.length > 0 ? `: ${r.errors.join("; ")}` : "";
    text += ` ${r.failed} could not be set${why}.`;
  }
  return text;
}

// --- the plan -------------------------------------------------------------------------------------------------------------------------

// The alarms and notifications one journey wants, in time order, leaving out any that are already in the past.
export function planJourneyAlarms(j: JourneyForAlarms, now: Date): PlannedAlarm[] {
  const info = bookingInfo(j.booking);
  const what = info.tatkal ? "Tatkal" : "Booking";
  const opensAt = bookingOpensAt(j.journeyDate, j.booking);
  const opens = formatClock(opensAt);
  const journey = formatLongDate(j.journeyDate);
  const times = normalizeTimes(j.alarmTimes);
  const day = (hour: number, daysBefore: number) =>
    new Date(opensAt.getFullYear(), opensAt.getMonth(), opensAt.getDate() - daysBefore, hour, 0, 0, 0);
  const first = times.length > 0 ? formatHm(times[0]) : opens;

  const plan: PlannedAlarm[] = [
    {
      journeyId: j.id,
      kind: "evening",
      reminder: true,
      at: day(EVENING_HOUR, 1),
      title: `${what} opens tomorrow at ${opens}`,
      body: `${j.label} on ${journey}. Keep your IRCTC login and passenger list ready. Alarms start at ${first}.`,
    },
    {
      journeyId: j.id,
      kind: "morning",
      reminder: true,
      at: day(MORNING_HOUR, 0),
      title: `${what} opens today at ${opens}`,
      body: `${j.label} on ${journey}. Alarms ring from ${first}.`,
    },
  ];

  times.forEach((hm, i) => {
    const at = hmToDate(hm, opensAt);
    const minutes = Math.round((opensAt.getTime() - at.getTime()) / 60_000);
    const title =
      i === 0 && minutes > 0
        ? `Wake up: ${what} opens at ${opens}`
        : minutes > 0
          ? `${what} opens in ${minutes} ${minutes === 1 ? "minute" : "minutes"}`
          : minutes === 0
            ? `${what} opens now`
            : `${what} is open: book now`;
    plan.push({ journeyId: j.id, kind: `a${i}`, reminder: false, at, title, body: `${j.label} on ${journey}. Log in to IRCTC and get ready.` });
  });

  return plan.filter((a) => a.at.getTime() > now.getTime()).sort((a, b) => a.at.getTime() - b.at.getTime());
}

export function planAlarms(journeys: readonly JourneyForAlarms[], now: Date): PlannedAlarm[] {
  return journeys
    .filter((j) => j.journeyDate >= toISODate(now))
    .flatMap((j) => planJourneyAlarms(j, now))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

export interface ScheduleText {
  opens: string; // when booking opens
  wake: string; // when the alarms ring
  reminders: string; // the two notifications; empty when both have passed
}

// The three sentences at the bottom of the add-journey screen, so the booking date and the wake-up date are never in doubt.
export function describeSchedule(j: JourneyFields, now: Date): ScheduleText {
  const info = bookingInfo(j.booking);
  const openDate = bookingOpenDate(j.journeyDate, j.booking);
  const before = info.daysBefore === 1 ? "1 day" : `${info.daysBefore} days`;
  const opens = `Your booking opens on ${formatDay(openDate)} at ${formatClock(bookingOpensAt(j.journeyDate, j.booking))}, ${before} before your journey date.`;

  const plans = planJourneyAlarms({ id: "preview", ...j }, now);
  const alarms = plans.filter((p) => !p.reminder);
  const skipped = normalizeTimes(j.alarmTimes).length - alarms.length;
  let wake: string;
  if (normalizeTimes(j.alarmTimes).length === 0) wake = "Add at least one alarm time and I will wake you at those times.";
  else if (alarms.length === 0) wake = `Every alarm time on ${formatDay(openDate)} has already passed, so no alarm will be set.`;
  else {
    wake = `I will wake you on ${formatDay(openDate)} at ${listClock(alarms.map((p) => toHm(p.at)))}.`;
    if (skipped > 0) wake += ` (${skipped} earlier ${skipped === 1 ? "time has" : "times have"} already passed.)`;
  }

  const notes = plans.filter((p) => p.reminder);
  const reminders =
    notes.length === 0
      ? ""
      : `You also get a notification ${notes.map((p) => `on ${formatDay(toISODate(p.at))} at ${formatClock(p.at)}`).join(" and ")}.`;
  return { opens, wake, reminders };
}

// --- ids and notifications ---------------------------------------------------------------------------------------------------------

// A UUID-shaped id that is always the same for a journey and kind. AlarmKit needs a UUID for every alarm, and this lets the app
// cancel or replace an alarm later without keeping a list of what it scheduled.
export function alarmUuid(journeyId: string, kind: string): string {
  const hex = bytesToHex(sha256(new TextEncoder().encode(`${journeyId}|${kind}`))).slice(0, 32);
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export const NOTIFICATION_ID_PREFIX = "train-";

export interface PlannedNotification {
  identifier: string;
  at: Date;
  title: string;
  body: string;
}

// What to schedule as notifications. The evening and morning reminders always are. With AlarmKit the alarms are real alarms, so they
// are not notifications; without it they are, each repeated a minute apart so they are hard to sleep through.
export function planNotifications(plans: readonly PlannedAlarm[], alarmKit: boolean): PlannedNotification[] {
  const out: PlannedNotification[] = [];
  for (const p of plans) {
    const copies = p.reminder ? 1 : alarmKit ? 0 : ALARM_CHAIN;
    for (let i = 0; i < copies; i++) {
      out.push({ identifier: `${NOTIFICATION_ID_PREFIX}${p.journeyId}-${p.kind}-${i}`, at: addMinutes(p.at, i), title: p.title, body: p.body });
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

// iOS keeps only the soonest 64 pending notifications and drops the rest, so keep the nearest ones. The next sync (every launch and
// every save) schedules the later ones once earlier ones have fired.
export function capNotifications(list: readonly PlannedNotification[], max = MAX_PENDING_NOTIFICATIONS): PlannedNotification[] {
  return list.slice(0, max);
}
