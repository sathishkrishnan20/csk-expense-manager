import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { formatLongDate, fromISODate, toISODate } from "./format";

// Train booking alarms. Advance booking opens 60 days before the journey date at 8:00 AM, and Tatkal booking opens the day before the
// journey (10:00 AM for AC classes, 11:00 AM for the rest). The owner wants to be awake for either. A journey is saved with its date;
// everything else here is worked out from it. Pure functions, no database and no device calls, so they are tested under Node (the
// scheduling itself is in alarms/).

// Advance booking opens this many days before the journey date, at 8:00 AM (local time).
export const ADVANCE_DAYS = 60;
export const ADVANCE_OPENS_HOUR = 8;

export type TatkalClass = "none" | "ac" | "non_ac";

export const TATKAL_CLASSES: { value: TatkalClass; label: string; hour: number }[] = [
  { value: "none", label: "No Tatkal alarm", hour: 0 },
  { value: "ac", label: "AC classes (opens 10:00 AM)", hour: 10 },
  { value: "non_ac", label: "Sleeper and non-AC (opens 11:00 AM)", hour: 11 },
];

// Minutes before booking opens that the wake-up alarm rings; the owner picks one per journey, for advance booking and for Tatkal.
export const WAKE_LEAD_CHOICES = [15, 30, 45, 60];
export const DEFAULT_WAKE_LEAD = 30;
// The advance booking's second alarm: time to log in.
export const READY_LEAD = 5;
// The evening-before reminder (advance booking only) is a notification at this hour the day before booking opens.
export const EVENING_HOUR = 20;

// When AlarmKit is not available the alarms are notifications, and one notification is easy to sleep through, so each alarm
// is repeated a minute apart. iOS keeps at most 64 pending local notifications, so the nearest ones win (see capNotifications).
export const WAKE_CHAIN = 5;
export const READY_CHAIN = 3;
export const MAX_PENDING_NOTIFICATIONS = 60;

export const MAX_LABEL_LENGTH = 60;

export type AlarmKind = "evening" | "wake" | "ready" | "tatkal";

export interface JourneyFields {
  label: string;
  journeyDate: string; // yyyy-mm-dd
  advance: boolean; // alarms for the advance booking, 60 days before
  tatkal: TatkalClass; // "none", or the class whose Tatkal opening to wake for, the day before the journey
  wakeLeadMinutes: number;
}

export interface JourneyForAlarms extends JourneyFields {
  id: string;
}

export interface PlannedAlarm {
  journeyId: string;
  kind: AlarmKind;
  at: Date;
  title: string;
  body: string;
}

const addMinutes = (date: Date, minutes: number): Date => new Date(date.getTime() + minutes * 60_000);

// The date advance booking opens for a journey on `journeyDate`: 60 days earlier.
export function bookingOpenDate(journeyDate: string): string {
  const journey = fromISODate(journeyDate);
  return toISODate(new Date(journey.getFullYear(), journey.getMonth(), journey.getDate() - ADVANCE_DAYS));
}

// The moment advance booking opens: 8:00 AM on the booking date.
export function bookingOpensAt(journeyDate: string): Date {
  const open = fromISODate(bookingOpenDate(journeyDate));
  return new Date(open.getFullYear(), open.getMonth(), open.getDate(), ADVANCE_OPENS_HOUR, 0, 0, 0);
}

// The date Tatkal booking opens: the day before the journey.
export function tatkalOpenDate(journeyDate: string): string {
  const journey = fromISODate(journeyDate);
  return toISODate(new Date(journey.getFullYear(), journey.getMonth(), journey.getDate() - 1));
}

// The moment Tatkal booking opens for a class (10:00 AM AC, 11:00 AM non-AC). Null when there is no Tatkal alarm.
export function tatkalOpensAt(journeyDate: string, tatkal: TatkalClass): Date | null {
  const hour = TATKAL_CLASSES.find((c) => c.value === tatkal)?.hour;
  if (!hour) return null;
  const open = fromISODate(tatkalOpenDate(journeyDate));
  return new Date(open.getFullYear(), open.getMonth(), open.getDate(), hour, 0, 0, 0);
}

// "8:00 AM"
export function formatClock(date: Date): string {
  const h = date.getHours();
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? "AM" : "PM"}`;
}

export function validateLabel(label: string): string | null {
  const trimmed = label.trim();
  if (trimmed === "") return "Enter where the journey is, for example Chennai to Madurai.";
  if (trimmed.length > MAX_LABEL_LENGTH) return `Keep it to ${MAX_LABEL_LENGTH} characters or fewer.`;
  return null;
}

// A journey needs at least one kind of alarm, or saving it would do nothing.
export function validateAlarms(j: Pick<JourneyFields, "advance" | "tatkal">): string | null {
  return j.advance || j.tatkal !== "none" ? null : "Choose advance booking, Tatkal, or both.";
}

export type JourneyPhase = "waiting" | "open" | "past";
export type BookingKind = "advance" | "tatkal";

export interface JourneyStatus {
  phase: JourneyPhase;
  // Which opening this status is about: the next one still to come, or the last one when all have opened.
  kind: BookingKind;
  opensAt: Date;
  // Whole days from today to that opening's date; 0 on the day, negative once it has passed.
  daysToOpen: number;
}

const dayNumber = (iso: string): number => {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
};

// The openings a journey wants alarms for, soonest first.
function openings(j: Pick<JourneyFields, "journeyDate" | "advance" | "tatkal">): { kind: BookingKind; opensAt: Date; date: string }[] {
  const list: { kind: BookingKind; opensAt: Date; date: string }[] = [];
  if (j.advance) list.push({ kind: "advance", opensAt: bookingOpensAt(j.journeyDate), date: bookingOpenDate(j.journeyDate) });
  const tatkal = tatkalOpensAt(j.journeyDate, j.tatkal);
  if (tatkal) list.push({ kind: "tatkal", opensAt: tatkal, date: tatkalOpenDate(j.journeyDate) });
  return list;
}

// waiting: an opening is still to come (the soonest is described). open: all have opened and the journey is still ahead (the last is
// described). past: the journey date is gone.
export function journeyStatus(j: Pick<JourneyFields, "journeyDate" | "advance" | "tatkal">, now: Date): JourneyStatus {
  const list = openings(j);
  const today = toISODate(now);
  const next = list.find((o) => o.opensAt.getTime() > now.getTime());
  const shown = next ?? list[list.length - 1] ?? { kind: "advance" as const, opensAt: bookingOpensAt(j.journeyDate), date: bookingOpenDate(j.journeyDate) };
  const daysToOpen = dayNumber(shown.date) - dayNumber(today);
  const phase: JourneyPhase = j.journeyDate < today ? "past" : next ? "waiting" : "open";
  return { phase, kind: shown.kind, opensAt: shown.opensAt, daysToOpen };
}

// "Opens in 12 days", "Tatkal opens tomorrow at 10:00 AM", "Booking is open", "Journey over".
export function describeStatus(s: JourneyStatus): string {
  if (s.phase === "past") return "Journey over";
  if (s.phase === "open") return s.kind === "tatkal" ? "Tatkal is open" : "Booking is open";
  const opens = s.kind === "tatkal" ? "Tatkal opens" : "Opens";
  if (s.daysToOpen === 0) return `${opens} today at ${formatClock(s.opensAt)}`;
  if (s.daysToOpen === 1) return `${opens} tomorrow at ${formatClock(s.opensAt)}`;
  return `${opens} in ${s.daysToOpen} days`;
}

// The alarms one journey wants, in time order, leaving out any that are already in the past.
export function planJourneyAlarms(j: JourneyForAlarms, now: Date): PlannedAlarm[] {
  const journey = formatLongDate(j.journeyDate);
  const all: PlannedAlarm[] = [];

  if (j.advance) {
    const opensAt = bookingOpensAt(j.journeyDate);
    const opens = formatClock(opensAt);
    const evening = new Date(opensAt.getFullYear(), opensAt.getMonth(), opensAt.getDate() - 1, EVENING_HOUR, 0, 0, 0);
    all.push(
      {
        journeyId: j.id,
        kind: "evening",
        at: evening,
        title: "Train booking opens tomorrow",
        body: `${j.label} on ${journey}: booking opens at ${opens}. Keep your IRCTC login and passenger list ready.`,
      },
      {
        journeyId: j.id,
        kind: "wake",
        at: addMinutes(opensAt, -j.wakeLeadMinutes),
        title: `Wake up: booking opens at ${opens}`,
        body: `${j.label} on ${journey}. Get ready to book.`,
      },
      {
        journeyId: j.id,
        kind: "ready",
        at: addMinutes(opensAt, -READY_LEAD),
        title: `Booking opens in ${READY_LEAD} minutes`,
        body: `${j.label} on ${journey}. Log in to IRCTC now.`,
      },
    );
  }

  const tatkal = tatkalOpensAt(j.journeyDate, j.tatkal);
  if (tatkal) {
    all.push({
      journeyId: j.id,
      kind: "tatkal",
      at: addMinutes(tatkal, -j.wakeLeadMinutes),
      title: `Wake up: Tatkal opens at ${formatClock(tatkal)}`,
      body: `${j.label}, journey ${journey}. Tatkal booking opens today.`,
    });
  }
  return all.filter((a) => a.at.getTime() > now.getTime()).sort((a, b) => a.at.getTime() - b.at.getTime());
}

export function planAlarms(journeys: readonly JourneyForAlarms[], now: Date): PlannedAlarm[] {
  return journeys
    .filter((j) => j.journeyDate >= toISODate(now))
    .flatMap((j) => planJourneyAlarms(j, now))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

// A UUID-shaped id that is always the same for a journey and kind. AlarmKit needs a UUID for every alarm, and this lets the app
// cancel or replace an alarm later without keeping a list of what it scheduled.
export function alarmUuid(journeyId: string, kind: AlarmKind): string {
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

// What to schedule as notifications. With AlarmKit the wake-up, 5-minute and Tatkal alarms are real alarms, so only the evening
// reminder is a notification; without it, those are repeated a minute apart so they are hard to sleep through.
export function planNotifications(plans: readonly PlannedAlarm[], alarmKit: boolean): PlannedNotification[] {
  const out: PlannedNotification[] = [];
  for (const p of plans) {
    const base = `${NOTIFICATION_ID_PREFIX}${p.journeyId}-${p.kind}`;
    const copies = p.kind === "evening" ? 1 : alarmKit ? 0 : p.kind === "ready" ? READY_CHAIN : WAKE_CHAIN;
    for (let i = 0; i < copies; i++) {
      out.push({ identifier: `${base}-${i}`, at: addMinutes(p.at, i), title: p.title, body: p.body });
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

// iOS keeps only the soonest 64 pending notifications and drops the rest, so keep the nearest ones. The next sync (every launch and
// every save) schedules the later ones once earlier ones have fired.
export function capNotifications(list: readonly PlannedNotification[], max = MAX_PENDING_NOTIFICATIONS): PlannedNotification[] {
  return list.slice(0, max);
}
