import type { ChatCapability } from "../types";
import { formatClockTime, formatLongDate, formatRupeeAmount, toISODate } from "../../domain/format";
import { goldHistoryRows } from "../../domain/goldHistory";
import { currentRate, formatChange, goldPer8g, goldPerGram, isToday, rateChange, silverPerGram, type Change, type HistoryDay, type SessionRates } from "../../domain/metalRates";

// Today's gold and silver rates (Gold & Silver Rates page): the IBJA benchmark and the Nagercoil price. Rates are looked up live (or from the copy
// the page saved in the last hour), never stored in the database, and there is nothing to add by chat.

const money = (v: number | null, max = 0) => (v === null ? "not available" : formatRupeeAmount(v, { max }));
const change = (c: Change | null, max: number) => (c ? formatChange(c, max) : undefined);

// A gold rate as the owner reads it: per gram, per 8 grams and per 10 grams (the way IBJA quotes it). PM is the current rate once it is out.
function goldRate(rate: SessionRates) {
  const now = currentRate(rate);
  return now ? { session: now.session, per_gram: money(goldPerGram(now.value), 1), per_8_grams: money(goldPer8g(now.value), 1), per_10_grams: money(now.value) } : "not available";
}

function silverRate(rate: SessionRates) {
  const now = currentRate(rate);
  return now ? { session: now.session, per_gram: money(silverPerGram(now.value), 2), per_kg: money(now.value) } : "not available";
}

// One earlier day: the rate per gram and how it moved from the day before it.
function earlierDay(days: HistoryDay[], i: number) {
  const day = days[i];
  const older = days[i + 1];
  const per = (read: (d: HistoryDay) => number | null, max: number) => {
    const value = read(day);
    return value === null ? "not available" : { per_gram: money(value, max), change_from_day_before: change(older ? rateChange(read(older), value) : null, max) };
  };
  const gold = (p: "999" | "916") => (d: HistoryDay) => {
    const now = currentRate(d.gold[p]);
    return now ? goldPerGram(now.value) : null;
  };
  const silver = (d: HistoryDay) => {
    const now = currentRate(d.silver);
    return now ? silverPerGram(now.value) : null;
  };
  return { date: day.date, gold_24k_999: per(gold("999"), 1), gold_22k_916: per(gold("916"), 1), silver: per(silver, 2) };
}

export const ratesCapability: ChatCapability = {
  id: "rates",
  title: "Gold and silver rates",
  description: "Today's gold and silver rates: the IBJA benchmark (24K, 22K, silver) and the Nagercoil 22K/24K price, with the last few days.",
  tools: [
    {
      name: "ibja_rates",
      description:
        "Today's IBJA (India Bullion and Jewellers Association) benchmark rates: gold 24K (999), 995 and 22K (916), and silver, per gram (and gold per 8 and 10 grams, silver per kg), AM or PM session, with the date. Optionally the last few days with how each moved. Use it for the national gold or silver rate, and for how the price has moved. It is a benchmark, not a jeweller's price: for the local price use nagercoil_gold_rates.",
      args: {
        days: { kind: "integer", min: 1, max: 5, description: "How many days to show, newest first, with the change from the day before. Default 1 (just the latest rate)." },
      },
      async run(args, ctx) {
        const days = (args.days as number | undefined) ?? 1;
        const cached = await ctx.data.metalRates();
        if (!cached) return { available: false, note: "The IBJA rates could not be loaded (no internet, or they are not published yet)." };
        const { snapshot, fetchedAt } = cached;
        const fetched = new Date(fetchedAt);
        return {
          source: "IBJA benchmark, not a jeweller's price",
          checked: toISODate(fetched) === toISODate(ctx.now) ? `today at ${formatClockTime(fetched)}` : `${formatLongDate(toISODate(fetched))} at ${formatClockTime(fetched)}`,
          gold: snapshot.gold
            ? {
                date: snapshot.gold.date,
                is_today: isToday(snapshot.gold.date, ctx.now),
                gold_24k_999: goldRate(snapshot.gold.rates["999"]),
                gold_995: goldRate(snapshot.gold.rates["995"]),
                gold_22k_916: goldRate(snapshot.gold.rates["916"]),
              }
            : "not available",
          silver: snapshot.silver ? { date: snapshot.silver.date, is_today: isToday(snapshot.silver.date, ctx.now), ...(silverRate(snapshot.silver.rate) as object) } : "not available",
          earlier_days: days > 1 ? snapshot.history.slice(0, days).map((_, i) => earlierDay(snapshot.history, i)) : undefined,
        };
      },
    },
    {
      name: "nagercoil_gold_rates",
      description:
        "The Nagercoil gold price per gram, 22K and 24K, as listed on Groww, with the last few days and how each moved from the day before. This is the local price the owner usually means by 'today's gold rate'; a jeweller's own price may differ. Use it for today's local gold rate and its recent movement.",
      args: {
        days: { kind: "integer", min: 1, max: 10, description: "How many days to show, newest first. Default 1 (just the latest)." },
      },
      async run(args, ctx) {
        const days = (args.days as number | undefined) ?? 1;
        const history = await ctx.data.nagercoilRates();
        if (!history || history.length === 0) return { available: false, note: "The Nagercoil rates are not available right now (not set up on this phone, or no internet)." };
        const rows = goldHistoryRows(history);
        return {
          source: "Nagercoil rates as listed on Groww; a jeweller's own price may differ",
          latest_date: rows[0].date,
          is_today: isToday(rows[0].date, ctx.now),
          days: rows.slice(0, days).map((r) => ({
            date: r.date,
            gold_22k_per_gram: money(r.price22k.value),
            gold_24k_per_gram: money(r.price24k.value),
            change_22k_from_day_before: change(r.price22k.change, 0),
            change_24k_from_day_before: change(r.price24k.change, 0),
          })),
        };
      },
    },
  ],
};
