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
  // Set once the ticket is booked. The alarms only exist to wake the owner for booking, so a booked journey has none (planAlarms).
  booked: boolean;
  pnr: string | null; // the 10-digit PNR, optional, and only on a booked journey
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
    .filter((j) => !j.booked && j.journeyDate >= toISODate(now))
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

// --- booked and the PNR -----------------------------------------------------------------------------------------------------------------

// A PNR is 10 digits. It is optional: nothing typed is fine, and spaces or hyphens between the digits are ignored ("123-456 7890").
export function validatePnr(text: string): string | null {
  const digits = text.replace(/[\s-]/g, "");
  if (digits === "") return null;
  return /^\d{10}$/.test(digits) ? null : "A PNR has 10 digits";
}

// The PNR as it is stored: digits only, or null when none was typed. Only a booked journey keeps one.
export function normalisePnr(text: string | null | undefined, booked: boolean): string | null {
  if (!booked) return null;
  const digits = (text ?? "").replace(/[\s-]/g, "");
  return digits === "" ? null : digits;
}

// "Booked" or "Booked · PNR 4521398760", for the list and for Ask AI.
export const describeBooked = (j: Pick<JourneyFields, "pnr">): string => (j.pnr ? `Booked · PNR ${j.pnr}` : "Booked");

// --- the list filter and switching to Tatkal ----------------------------------------------------------------------------------------

export type TrainShow = "all" | "not_booked" | "booked";

export const TRAIN_SHOWS: { value: TrainShow; label: string }[] = [
  { value: "all", label: "All journeys" },
  { value: "not_booked", label: "Not booked yet" },
  { value: "booked", label: "Booked" },
];

// The list's Show filter. "Not booked yet" is the journeys still ahead that have no ticket (one that is over without a booking is of no use
// any more); "Booked" is every booked journey, over or not, as a record.
export function filterJourneys<J extends Pick<JourneyFields, "journeyDate" | "booked">>(journeys: readonly J[], show: TrainShow, today: string): J[] {
  return journeys.filter((j) => (show === "all" ? true : show === "booked" ? j.booked : !j.booked && j.journeyDate >= today));
}

// An advance booking that has already opened and has not been booked: the case for choosing Tatkal instead, which opens the day before the
// journey. The form says so then. Booked journeys and journeys that are over are left alone.
export function advanceMissed(j: Pick<JourneyFields, "journeyDate" | "booking" | "booked">, now: Date): boolean {
  return !j.booked && j.booking === "advance" && journeyStatus(j, now).phase === "open";
}

// --- when a journey can be marked booked ------------------------------------------------------------------------------------------------

// A ticket cannot be booked before booking opens: 60 days before the journey (8:00 AM) for advance booking, the day before (10:00 or 11:00 AM) for
// Tatkal. So Booked can be set to Yes only from that moment on. A journey 72 days away on an advance booking stays "not booked" until day 60.
export const canMarkBooked = (j: Pick<JourneyFields, "journeyDate" | "booking">, now: Date): boolean =>
  bookingOpensAt(j.journeyDate, j.booking).getTime() <= now.getTime();

// Why Booked is locked, in plain words, while booking has not opened: "Advance booking opens on Monday, 12 January at 8:00 AM (in 60 days)."
export function bookedLockedText(j: Pick<JourneyFields, "journeyDate" | "booking">, now: Date): string {
  const info = bookingInfo(j.booking);
  const opensAt = bookingOpensAt(j.journeyDate, j.booking);
  const when = `${formatDay(toISODate(opensAt))} at ${formatClock(opensAt)}`;
  const days = Math.round((dayNumber(toISODate(opensAt)) - dayNumber(toISODate(now))));
  const soon = days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
  return `${info.tatkal ? "Tatkal" : "Advance"} booking has not opened yet: it opens on ${when} (${soon}). You can set Booked to Yes after that.`;
}

// --- what is set on the iPhone ----------------------------------------------------------------------------------------------------------

// One alarm or reminder iOS accepted, as the app records it each time it sets them (alarms/sync.ts). iOS lets the app read its pending notifications
// back, but not its AlarmKit alarms, so this record is what the "Alarms set on this iPhone" list is made from; each notification is then checked
// against what iOS still has pending.
export interface SetAlarm {
  id: string; // the AlarmKit UUID, or the notification identifier
  journeyId: string;
  kind: string; // "a0".."a7" (a wake-up alarm), "evening" or "morning" (a reminder)
  at: string; // ISO time it will ring or show
  title: string;
  via: "alarm" | "notification";
}

// "train-tj-abc-123-a0-1" -> { journeyId: "tj-abc-123", kind: "a0", copy: 1 }; null for anything else.
export function parseNotificationId(identifier: string): { journeyId: string; kind: string; copy: number } | null {
  if (!identifier.startsWith(NOTIFICATION_ID_PREFIX)) return null;
  const m = /^(.+)-(evening|morning|a\d+)-(\d+)$/.exec(identifier.slice(NOTIFICATION_ID_PREFIX.length));
  return m ? { journeyId: m[1], kind: m[2], copy: Number(m[3]) } : null;
}

// Reads what was stored; anything that is not a well-formed record is dropped.
export function parseSetAlarms(text: string | null): SetAlarm[] {
  if (!text) return [];
  try {
    const raw: unknown = JSON.parse(text);
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (r): r is SetAlarm =>
        typeof r === "object" && r !== null && typeof r.id === "string" && typeof r.journeyId === "string" && typeof r.kind === "string" &&
        typeof r.title === "string" && typeof r.at === "string" && !Number.isNaN(Date.parse(r.at)) && (r.via === "alarm" || r.via === "notification"),
    );
  } catch {
    return [];
  }
}

// --- the list as iOS reports it -----------------------------------------------------------------------------------------------------------

// A real (AlarmKit) alarm exactly as iOS holds it: only this app's alarms are ever in iOS's list for it.
export interface PhoneAlarm {
  id: string; // the UUID it was scheduled under
  state: string;
  at: Date | null;
}

// A pending reminder (a local notification) exactly as iOS holds it.
export interface PhoneReminder {
  identifier: string;
  title: string;
  at: Date | null; // null when iOS gave its time in a shape this app does not read; the app's record of it is used then
}

// A notification's trigger as iOS gives it back, as a time. A date trigger comes as a number (milliseconds, or seconds) and a calendar one as its
// date parts; anything else (a repeating or interval trigger, which this app never sets) is null.
export function triggerToDate(trigger: unknown): Date | null {
  if (typeof trigger !== "object" || trigger === null) return null;
  const t = trigger as { value?: unknown; dateComponents?: Record<string, unknown> };
  if (typeof t.value === "number" && Number.isFinite(t.value)) return new Date(t.value > 1e11 ? t.value : t.value * 1000);
  if (t.value instanceof Date) return t.value;
  const c = t.dateComponents;
  if (c && typeof c.year === "number" && typeof c.month === "number" && typeof c.day === "number" && typeof c.hour === "number") {
    return new Date(c.year, c.month - 1, c.day, c.hour, typeof c.minute === "number" ? c.minute : 0, typeof c.second === "number" ? c.second : 0);
  }
  return null;
}

// One alarm or reminder the saved journeys call for, with whether it is really set. The list is made from the app's own records (the saved journeys
// and the alarms they plan, `planAlarms`); the one mark on each row says whether iOS holds it, scheduled to ring or show at that time.
export interface CheckRow {
  key: string;
  at: Date; // when it should ring or show
  type: "Alarm" | "Reminder";
  title: string;
  journeyId: string;
  journeyLabel: string;
  set: boolean; // iOS holds it (a real alarm, or the notifications that stand in for it) at about this time
}

export interface CheckList {
  rows: CheckRow[]; // soonest first
  // "ios": real alarms were checked with iOS. "record": this build cannot read real alarms from iOS, so a real alarm counts as set when the app's record
  // says iOS accepted it at the last try.
  alarmsFrom: "ios" | "record";
  unlinked: number; // alarms iOS holds for this app that are not in the list (for a journey that is booked, moved or deleted); Set them again cancels them
}

const SAME_TIME_MS = 90_000; // an alarm iOS holds a minute or two off its planned time is stale (the journey was changed and not set again)

// Checks each planned alarm and reminder against what iOS holds. A reminder is one notification; a wake-up alarm is a real alarm, or, without
// AlarmKit, a run of notifications a minute apart. `alarms` and `reminders` are null when iOS could not be asked; the record of what iOS accepted
// at the last sync stands in then.
export function buildCheckList(input: {
  plans: readonly PlannedAlarm[];
  journeys: readonly { id: string; label: string }[];
  alarms: readonly PhoneAlarm[] | null;
  reminders: readonly PhoneReminder[] | null;
  record: readonly SetAlarm[];
}): CheckList {
  const { plans, journeys, alarms, reminders, record } = input;
  const labels = new Map(journeys.map((j) => [j.id, j.label]));
  const recorded = new Set(record.map((r) => r.id.toLowerCase()));
  const alarmById = new Map((alarms ?? []).map((a) => [a.id.toLowerCase(), a]));
  const pendingById = new Map((reminders ?? []).map((r) => [r.identifier, r]));
  const near = (actual: Date | null, planned: Date) => actual === null || Math.abs(actual.getTime() - planned.getTime()) <= SAME_TIME_MS;

  const notificationHeld = (id: string, planned: Date): boolean =>
    reminders ? near(pendingById.get(id)?.at ?? null, planned) && pendingById.has(id) : recorded.has(id.toLowerCase());

  const plannedUuids = new Set<string>();
  const rows = plans.map((p): CheckRow => {
    let set: boolean;
    if (p.reminder) {
      set = notificationHeld(`${NOTIFICATION_ID_PREFIX}${p.journeyId}-${p.kind}-0`, p.at);
    } else {
      const uuid = alarmUuid(p.journeyId, p.kind).toLowerCase();
      plannedUuids.add(uuid);
      const real = alarms ? alarmById.has(uuid) && near(alarmById.get(uuid)!.at, p.at) : recorded.has(uuid);
      const run = Array.from({ length: ALARM_CHAIN }, (_, i) => `${NOTIFICATION_ID_PREFIX}${p.journeyId}-${p.kind}-${i}`).every((id, i) =>
        notificationHeld(id, addMinutes(p.at, i)),
      );
      set = real || run;
    }
    return { key: `${p.journeyId}|${p.kind}`, at: p.at, type: p.reminder ? "Reminder" : "Alarm", title: p.title, journeyId: p.journeyId, journeyLabel: labels.get(p.journeyId) ?? "", set };
  });

  return {
    rows: rows.sort((a, b) => a.at.getTime() - b.at.getTime()),
    alarmsFrom: alarms ? "ios" : "record",
    unlinked: alarms ? alarms.filter((a) => !plannedUuids.has(a.id.toLowerCase())).length : 0,
  };
}

// The warning for one journey when iOS does not hold something it should: its alarms or its two reminders. Null when everything is set. It is shown
// on the journey in the list and on the journey screen, where saving again sets them.
export function droppedText(list: CheckList, journeyId: string): string | null {
  const missing = list.rows.filter((r) => r.journeyId === journeyId && !r.set);
  const alarms = missing.filter((r) => r.type === "Alarm").length;
  const reminders = missing.length - alarms;
  if (missing.length === 0) return null;
  const parts = [
    alarms > 0 ? `${alarms} ${alarms === 1 ? "alarm" : "alarms"}` : "",
    reminders > 0 ? `${reminders} ${reminders === 1 ? "reminder" : "reminders"}` : "",
  ].filter(Boolean);
  return `${parts.join(" and ")} not set on this iPhone. Open this journey and tap Update to set ${missing.length === 1 ? "it" : "them"} again.`;
}

// The mark for each alarm time ("HH:MM") of one saved journey: true when iOS holds that alarm, false when it does not. A time with no row (one just
// typed and not saved yet, or one that has already passed) has no entry, so it shows no mark.
export function alarmTimeMarks(list: CheckList, journeyId: string): Record<string, boolean> {
  const marks: Record<string, boolean> = {};
  for (const row of list.rows) {
    if (row.journeyId === journeyId && row.type === "Alarm") marks[toHm(row.at)] = row.set;
  }
  return marks;
}
