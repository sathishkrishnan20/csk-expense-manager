import type { ChatCapability, ChatToolContext } from "../types";
import {
  ASSET_SHOWS,
  describeQuantity,
  filterAssets,
  formatQuantity,
  isGivenInExchange,
  isPledged,
  typeLabel,
  type AssetShow,
  type AssetType,
  type AssetUnit,
} from "../../domain/assets";
import { describePiece, exchangeWeights } from "../../domain/assetExchanges";
import type { ArgSpecs, ToolArgs } from "../../domain/chatTools";
import { formatRupees } from "../../domain/format";
import { formatGrams } from "../../domain/gifts";
import type { AssetRecord } from "../../db/assets";

// Gold, land, mutual funds and the rest of what the owner holds (Assets page), and the exchanges of old gold for new with a shop. Each piece
// is named by For (whom it is for) and Item (what it is). Information only: none of it touches a balance.

const SHOW = ASSET_SHOWS.map((s) => s.value);
const TYPES: readonly AssetType[] = ["gold", "land", "mutual_fund", "other"];

const FILTER_ARGS: ArgSpecs = {
  type: { kind: "string", options: TYPES, description: "Only this kind of asset." },
  for: { kind: "string", description: "Only pieces for this person or group, named as in the For list (for example a child's or the wife's name)." },
  item: { kind: "string", description: "Only this item, named as in the Item list (ring, earring, bangle, chain...)." },
  show: {
    kind: "string",
    options: SHOW,
    description: "holding (the default: what is owned now), pledged (gold given as security for a loan), sold, exchanged (given to a shop in an exchange), or all.",
  },
  search: { kind: "string", description: "Words to look for in For, Item, description, lender or note." },
};

function found(args: ToolArgs, all: AssetRecord[]): AssetRecord[] {
  return filterAssets(all, {
    type: (args.type as AssetType | undefined) ?? null,
    show: (args.show as AssetShow | undefined) ?? "holding",
    search: (args.search as string | undefined) ?? "",
    forName: (args.for as string | undefined) ?? null,
    item: (args.item as string | undefined) ?? null,
  });
}

// Exact totals of some pieces, by kind: how many, the quantity (grams at each purity for gold), what was paid, and what is pledged.
function totalsOf(pieces: AssetRecord[]) {
  const kinds = TYPES.filter((t) => pieces.some((a) => a.type === t));
  return kinds.map((t) => {
    const of = pieces.filter((a) => a.type === t);
    const quantity = new Map<AssetUnit, number>();
    const goldByPurity = new Map<number, number>();
    for (const a of of) {
      if (a.quantity === null || a.unit === null) continue;
      quantity.set(a.unit, (quantity.get(a.unit) ?? 0) + a.quantity);
      if (t === "gold" && a.unit === "g" && a.purityK) goldByPurity.set(a.purityK, (goldByPurity.get(a.purityK) ?? 0) + a.quantity);
    }
    const paid = of.reduce((n, a) => n + (a.investedPaise ?? 0), 0);
    const pledged = of.filter(isPledged);
    return {
      kind: typeLabel(t),
      items: of.length,
      quantity: [...quantity].map(([unit, q]) => formatQuantity(q, unit)),
      goldByPurity: t === "gold" ? Object.fromEntries([...goldByPurity].sort((a, b) => b[0] - a[0]).map(([k, q]) => [`${k}K`, formatQuantity(q, "g")])) : undefined,
      totalPaid: paid > 0 ? formatRupees(paid) : undefined,
      pledgedItems: pledged.length > 0 ? pledged.length : undefined,
      // only when a loan amount was entered: a total of nothing is not a loan of zero
      loanTotal: pledged.some((a) => a.loanPaise) ? formatRupees(pledged.reduce((n, a) => n + (a.loanPaise ?? 0), 0)) : undefined,
    };
  });
}

const statusOf = (a: AssetRecord): string => (isGivenInExchange(a) ? "given to a shop in an exchange" : a.status === "SOLD" ? "sold" : "holding");

export const assetsCapability: ChatCapability = {
  id: "assets",
  title: "Assets",
  description: "What you own: gold (by person and item, with weight and purity, what is pledged, and what was exchanged with a shop), land, mutual funds and other assets.",
  tools: [
    {
      name: "assets_list",
      description:
        "The assets themselves: who each is for, what it is (ring, earring...), quantity (such as grams and purity), what was paid, when it was acquired, its status, and the pledge (lender, loan, due date) if any. Use it to see particular pieces, everything for one person, or what is pledged where.",
      args: { ...FILTER_ARGS, limit: { kind: "integer", min: 1, max: 50, description: "How many to return. Default 30." } },
      async run(args, ctx) {
        const pieces = found(args, await ctx.data.assets());
        const limit = (args.limit as number | undefined) ?? 30;
        return {
          matching: pieces.length,
          showing: Math.min(pieces.length, limit),
          assets: pieces.slice(0, limit).map((a) => ({
            for: a.forName ?? undefined,
            item: a.item ?? a.name,
            kind: typeLabel(a.type),
            quantity: describeQuantity(a) || undefined,
            paid: a.investedPaise ? formatRupees(a.investedPaise) : undefined,
            acquired: a.acquiredDate ?? undefined,
            status: statusOf(a),
            description: a.description ?? undefined,
            pledge: isPledged(a)
              ? { lender: a.lender, loan: a.loanPaise ? formatRupees(a.loanPaise) : undefined, pledgedOn: a.pledgedDate ?? undefined, due: a.dueDate ?? undefined, ticket: a.ticketNo ?? undefined }
              : undefined,
          })),
        };
      },
    },
    {
      name: "assets_totals",
      description:
        "Exact totals of the assets by kind: how many, the total quantity (for gold the grams, and the grams at each purity), the total paid, and how many are pledged with the loan total. Can be broken down by person (For) or by item. Use it for how much gold, land or invested, or how much gold is for someone, never adding the items yourself.",
      args: { ...FILTER_ARGS, groupBy: { kind: "string", options: ["none", "for", "item"], description: "Break the totals down by person (for) or by item. Default: none." } },
      async run(args, ctx: ChatToolContext) {
        const pieces = found(args, await ctx.data.assets());
        const counting = (args.show as string | undefined) ?? "holding";
        const groupBy = (args.groupBy as "none" | "for" | "item" | undefined) ?? "none";
        if (groupBy === "none") return { counting, kinds: totalsOf(pieces) };
        const key = (a: AssetRecord) => (groupBy === "for" ? a.forName : (a.item ?? a.name)) ?? "Not set";
        const groups = new Map<string, AssetRecord[]>();
        for (const a of pieces) groups.set(key(a), [...(groups.get(key(a)) ?? []), a]);
        return {
          counting,
          groupedBy: groupBy,
          overall: totalsOf(pieces),
          groups: [...groups].slice(0, 30).map(([label, list]) => ({ label, kinds: totalsOf(list) })),
          moreGroupsNotShown: groups.size > 30,
        };
      },
    },
    {
      name: "asset_exchanges",
      description:
        "The exchanges of old gold for new gold with a shop: for each, the date, the shop, the pieces given (with their weights), the pieces bought in their place, the totals in grams, whether you got more or less gold than you gave, and any extra paid in cash. Use it for what was given to a shop and what was bought instead.",
      args: {
        shop: { kind: "string", description: "Only exchanges at a shop whose name contains this text." },
        from: { kind: "date", description: "Only exchanges on or after this date." },
        to: { kind: "date", description: "Only exchanges on or before this date." },
        limit: { kind: "integer", min: 1, max: 30, description: "How many to return, newest first. Default 15." },
      },
      async run(args, ctx) {
        const shop = ((args.shop as string | undefined) ?? "").trim().toLowerCase();
        const from = args.from as string | undefined;
        const to = args.to as string | undefined;
        const list = (await ctx.data.exchanges()).filter(
          (x) => (!shop || (x.shop ?? "").toLowerCase().includes(shop)) && (!from || x.exchangeDate >= from) && (!to || x.exchangeDate <= to),
        );
        const limit = (args.limit as number | undefined) ?? 15;
        return {
          matching: list.length,
          showing: Math.min(list.length, limit),
          exchanges: list.slice(0, limit).map((x) => {
            const w = exchangeWeights(x.given, x.bought);
            return {
              date: x.exchangeDate,
              shop: x.shop ?? undefined,
              gave: x.given.map(describePiece),
              totalGave: formatGrams(w.gaveMg),
              bought: x.bought.length > 0 ? x.bought.map(describePiece) : "nothing added yet",
              totalBought: x.bought.length > 0 ? formatGrams(w.gotMg) : undefined,
              difference: x.bought.length > 0 && w.moreMg !== 0 ? `${formatGrams(Math.abs(w.moreMg))} ${w.moreMg > 0 ? "more" : "less"} than given` : undefined,
              extraPaid: x.extraPaise !== null ? formatRupees(x.extraPaise) : undefined,
              note: x.note ?? undefined,
            };
          }),
        };
      },
    },
  ],
};
