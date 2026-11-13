import type { ChatToolContext } from "../types";
import type { ChatAction } from "../../domain/chatTools";
import { formatLongDate, toISODate } from "../../domain/format";
import { describeGift, normaliseTitle, occasionKey, readGiftAmounts, validateOccasionTitle, type GiftDirection, type GiftType } from "../../domain/gifts";

// "Add a gift" for Ask AI: one gift received or given at an occasion. It is saved only when the owner taps Save on the card.

export const addGiftAction: ChatAction<ChatToolContext> = {
  name: "add_gift",
  description:
    "Adds one gift received or given at an occasion such as a marriage (cash, gold, silver or another thing). Use it when the account holder says someone gave them something, or they gave something to someone, and wants it noted. It is saved only after they tap Save on the card.",
  args: {
    person: { kind: "string", required: true, description: "Who gave it (for a gift received) or who it was given to." },
    occasion: { kind: "string", required: true, description: "The occasion, for example \"Priya's marriage\". An occasion already in their list is used when the name matches." },
    type: { kind: "string", required: true, options: ["cash", "gold", "silver", "other"], description: "What kind of gift." },
    direction: { kind: "string", options: ["received", "given"], description: "received (the default) or given." },
    amount: { kind: "string", description: "Cash: the rupees. Gold or silver: the grams (or the rupees when unit is rupees). Other: its rupee worth, if known." },
    unit: { kind: "string", options: ["grams", "rupees"], description: "For gold and silver only: grams (the default) or rupees." },
    price_per_gram: { kind: "string", description: "For gold or silver in grams: the price per gram that day in rupees, if they know it." },
    note: { kind: "string", description: "For another kind of thing, what it is (required then), for example \"Silver lamp\". Optional otherwise." },
    occasion_date: { kind: "date", description: "The date of the occasion, yyyy-mm-dd, used only when the occasion is new. Default: today." },
  },
  async prepare(args, ctx) {
    const name = String(args.person ?? "").trim();
    if (name === "") return { ok: false, problem: "the person is missing. Ask who it was from or for." };
    const title = normaliseTitle(String(args.occasion ?? ""));
    const titleProblem = validateOccasionTitle(title);
    if (titleProblem) return { ok: false, problem: titleProblem };

    const type = args.type as GiftType;
    const direction = ((args.direction as string | undefined) ?? "received") as GiftDirection;
    const note = typeof args.note === "string" && args.note.trim() !== "" ? args.note.trim() : null;
    if (type === "other" && !note) return { ok: false, problem: "for another kind of gift the note says what it is. Ask what the gift is." };

    const amounts = readGiftAmounts(type, args.unit === "rupees" ? "INR" : "g", String(args.amount ?? ""), String(args.price_per_gram ?? ""));
    if (!amounts.ok) return { ok: false, problem: `${amounts.error}. Ask for it.` };

    const existing = (await ctx.data.occasions()).find((o) => occasionKey(o.title) === occasionKey(title));
    const occasionDate = existing?.date ?? (args.occasion_date as string | undefined) ?? toISODate(ctx.now);
    const input = { name, direction, type, value: amounts.value, unit: amounts.unit, ratePaise: amounts.ratePaise, note, occasionId: existing?.id ?? null, occasionTitle: title, occasionDate, changeOccasionDate: false };
    const gift = describeGift({ type, value: amounts.value, unit: amounts.unit, note });

    return {
      ok: true,
      prepared: {
        title: direction === "given" ? "Add a gift you gave" : "Add a gift you received",
        lines: [
          { label: direction === "given" ? "Given to" : "From", value: name },
          { label: "Gift", value: gift },
          { label: "Occasion", value: existing ? `${existing.title} (in your list)` : `${title} (new, ${formatLongDate(occasionDate)})` },
          ...(note && type !== "other" ? [{ label: "Note", value: note }] : []),
        ],
        async save() {
          await ctx.writes.addGift(input);
          return `Added ${gift} ${direction === "given" ? "to" : "from"} ${name} under ${title}.`;
        },
      },
    };
  },
};
