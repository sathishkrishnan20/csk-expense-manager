import type { ChatCapability } from "../types";
import type { ArgSpecs } from "../../domain/chatTools";
import { describeGift, filterGifts, giftTotals, rupeesText, totalsLines, type GiftDirection, type GiftType } from "../../domain/gifts";
import type { GiftRecord } from "../../db/gifts";
import { addGiftAction } from "./giftActions";

// Gifts received and given at occasions (Gifts page). Information only: none of it touches a balance.

const FILTER_ARGS: ArgSpecs = {
  direction: { kind: "string", options: ["received", "given", "all"], description: "received, given, or all (the default)." },
  type: { kind: "string", options: ["cash", "gold", "silver", "other"], description: "Only this kind of gift." },
  occasion: { kind: "string", description: "Only occasions whose title contains this text, such as \"marriage\"." },
  search: { kind: "string", description: "Words to look for in the person's name, the occasion, the note or what the gift is." },
};

async function matching(args: Record<string, unknown>, all: GiftRecord[]): Promise<GiftRecord[]> {
  const occasion = ((args.occasion as string | undefined) ?? "").trim().toLowerCase();
  const type = args.type as GiftType | undefined;
  return filterGifts(all, { occasionId: null, direction: (args.direction as GiftDirection | "all" | undefined) ?? "all", search: (args.search as string | undefined) ?? "" }).filter(
    (g) => (!type || g.type === type) && (!occasion || g.occasionTitle.toLowerCase().includes(occasion)),
  );
}

const GROUP_BY = ["none", "occasion", "type", "person"] as const;

export const giftsCapability: ChatCapability = {
  id: "gifts",
  title: "Gifts",
  description: "Gifts received and given at occasions such as marriages: who gave what (cash, gold, silver, other), with totals.",
  actions: [addGiftAction],
  tools: [
    {
      name: "gifts_list",
      description: "The gifts themselves: occasion and its date, the person, received or given, and what it is (such as \"3 g gold\" or \"₹1,000\"). Use it to see who gave what, or everything from one person or occasion.",
      args: { ...FILTER_ARGS, limit: { kind: "integer", min: 1, max: 50, description: "How many to return. Default 30." } },
      async run(args, ctx) {
        const found = await matching(args, await ctx.data.gifts());
        const limit = (args.limit as number | undefined) ?? 30;
        return {
          matching: found.length,
          showing: Math.min(found.length, limit),
          gifts: found.slice(0, limit).map((g) => ({
            occasion: g.occasionTitle,
            date: g.occasionDate,
            person: g.name,
            direction: g.direction,
            what: describeGift(g),
            note: g.type !== "other" ? (g.note ?? undefined) : undefined,
          })),
        };
      },
    },
    {
      name: "gifts_totals",
      description: "Exact totals of the gifts (cash, gold and silver kept apart, never added together), for all of them or broken down by occasion, kind or person. Use it for how much was received or given, never adding the gifts yourself.",
      args: {
        ...FILTER_ARGS,
        groupBy: { kind: "string", options: GROUP_BY, description: "Break the totals down by occasion, type or person. Default: none." },
      },
      async run(args, ctx) {
        const found = await matching(args, await ctx.data.gifts());
        const describe = (gifts: GiftRecord[]) => {
          const t = giftTotals(gifts);
          return { gifts: t.count, totals: totalsLines(t), estimatedWorthOfWeighedGoldAndSilver: t.estimatedPaise > 0 ? rupeesText(t.estimatedPaise) : undefined };
        };
        const groupBy = (args.groupBy as (typeof GROUP_BY)[number] | undefined) ?? "none";
        if (groupBy === "none") return describe(found);
        const key = (g: GiftRecord) => (groupBy === "occasion" ? g.occasionTitle : groupBy === "type" ? g.type : g.name);
        const groups = new Map<string, GiftRecord[]>();
        for (const g of found) groups.set(key(g), [...(groups.get(key(g)) ?? []), g]);
        return { groupedBy: groupBy, overall: describe(found), groups: [...groups].slice(0, 30).map(([label, gifts]) => ({ label, ...describe(gifts) })), moreGroupsNotShown: groups.size > 30 };
      },
    },
  ],
};
