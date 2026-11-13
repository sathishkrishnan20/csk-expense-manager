import type { ChatCapability } from "../types";
import { bookingInfo, describeBooked, describeStatus, journeyStatus, listClock } from "../../domain/trainAlarms";
import { toISODate } from "../../domain/format";
import { addJourneyAction } from "./trainActions";

// Train journeys and their booking alarms (Train alarms page).

export const trainsCapability: ChatCapability = {
  id: "trains",
  title: "Train journeys",
  description: "Train journeys you planned: the date, the kind of booking, when booking opens, whether the ticket is booked (with its PNR), and the alarm times.",
  actions: [addJourneyAction],
  tools: [
    {
      name: "train_journeys",
      description: "The planned train journeys with their date, booking type (advance or tatkal), whether the ticket is booked (and its PNR), whether booking is open, and the alarm times. Use it for upcoming or past journeys, which ones are booked or still to book, a PNR, and when booking opens.",
      args: {
        when: { kind: "string", options: ["upcoming", "past", "all"], description: "upcoming (the default: today or later), past, or all." },
        from: { kind: "date", description: "Only journeys on or after this date." },
        to: { kind: "date", description: "Only journeys on or before this date." },
        booked: { kind: "string", options: ["yes", "no"], description: "yes: only journeys whose ticket is booked; no: only those still to book. Default: both." },
        limit: { kind: "integer", min: 1, max: 50, description: "How many to return. Default 20." },
      },
      async run(args, ctx) {
        const today = toISODate(ctx.now);
        const when = (args.when as string | undefined) ?? "upcoming";
        const from = args.from as string | undefined;
        const to = args.to as string | undefined;
        const found = (await ctx.data.journeys()).filter(
          (j) => (when === "all" || (when === "upcoming" ? j.journeyDate >= today : j.journeyDate < today)) && (!from || j.journeyDate >= from) && (!to || j.journeyDate <= to) && (!args.booked || j.booked === (args.booked === "yes")),
        );
        const limit = (args.limit as number | undefined) ?? 20;
        return {
          today,
          matching: found.length,
          showing: Math.min(found.length, limit),
          journeys: found.slice(0, limit).map((j) => ({
            label: j.label,
            date: j.journeyDate,
            booking: bookingInfo(j.booking).label,
            status: j.booked ? describeBooked(j) : describeStatus(journeyStatus(j, ctx.now)),
            booked: j.booked,
            pnr: j.pnr ?? undefined,
            alarms: !j.booked && j.alarmTimes.length > 0 ? listClock(j.alarmTimes) : undefined,
            note: j.note ?? undefined,
          })),
        };
      },
    },
  ],
};
