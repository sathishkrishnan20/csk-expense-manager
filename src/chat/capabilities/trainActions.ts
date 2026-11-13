import type { ChatToolContext } from "../types";
import type { ChatAction } from "../../domain/chatTools";
import { formatLongDate, toISODate } from "../../domain/format";
import {
  BOOKINGS,
  DEFAULT_BOOKING,
  bookingInfo,
  describeSchedule,
  formatHm,
  isValidHm,
  journeyStatus,
  normalizeTimes,
  validateLabel,
  validateTimes,
  type Booking,
} from "../../domain/trainAlarms";

// "Add a train journey" for Ask AI: the journey is saved, and its booking alarms are set, only when the owner taps Save on the card.
const BOOKING_NAMES = BOOKINGS.map((b) => b.value);

export const addJourneyAction: ChatAction<ChatToolContext> = {
  name: "add_train_journey",
  description:
    "Adds a planned train journey, and sets the alarms that wake the account holder when booking opens. Use it when they say they will travel by train on a date and want to be woken to book. Needs where they are going and the journey date. It is saved only after they tap Save on the card.",
  args: {
    label: { kind: "string", required: true, description: "Where the journey is, for example \"Chennai to Madurai\"." },
    date: { kind: "date", required: true, description: "The journey date, yyyy-mm-dd." },
    booking: { kind: "string", options: BOOKING_NAMES, description: "advance (the default: booking opens 60 days before, 8:00 AM), tatkal_ac, or tatkal_non_ac (booking opens the day before)." },
    alarm_times: { kind: "string_list", description: "Alarm times on the booking day as 24-hour HH:MM, for example [\"07:45\",\"08:00\"]. Default: the usual times for that kind of booking." },
    note: { kind: "string", description: "A note such as the train or class. Optional." },
  },
  async prepare(args, ctx) {
    const label = String(args.label ?? "").trim();
    const labelProblem = validateLabel(label);
    if (labelProblem) return { ok: false, problem: labelProblem };

    const booking = ((args.booking as string | undefined) ?? DEFAULT_BOOKING) as Booking;
    const journeyDate = String(args.date);
    const wanted = (args.alarm_times as string[] | undefined) ?? bookingInfo(booking).defaultTimes;
    if (!wanted.every(isValidHm)) return { ok: false, problem: `alarm_times must be 24-hour HH:MM, for example 07:45; got ${wanted.join(", ")}.` };
    const alarmTimes = normalizeTimes(wanted);
    const timesProblem = validateTimes(alarmTimes);
    if (timesProblem) return { ok: false, problem: timesProblem };

    const note = typeof args.note === "string" && args.note.trim() !== "" ? args.note.trim() : null;
    const fields = { label, journeyDate, booking, alarmTimes, booked: false, pnr: null };
    if (journeyStatus(fields, ctx.now).phase === "past") return { ok: false, problem: `${journeyDate} is already over. Ask for the journey date.` };
    if (journeyDate < toISODate(ctx.now)) return { ok: false, problem: `${journeyDate} is in the past.` };

    const schedule = describeSchedule(fields, ctx.now);
    return {
      ok: true,
      prepared: {
        title: "Add a train journey",
        lines: [
          { label: "Journey", value: label },
          { label: "Date", value: formatLongDate(journeyDate) },
          { label: "Booking", value: bookingInfo(booking).label },
          { label: "Alarms", value: alarmTimes.map(formatHm).join(", ") },
          { label: "Booking opens", value: schedule.opens.replace(/^Your booking opens on /, "").replace(/\.$/, "") },
          ...(note ? [{ label: "Note", value: note }] : []),
        ],
        async save() {
          const alarms = await ctx.writes.addJourney({ ...fields, note });
          return `Added the journey ${label} on ${formatLongDate(journeyDate)}. ${alarms}`;
        },
      },
    };
  },
};
