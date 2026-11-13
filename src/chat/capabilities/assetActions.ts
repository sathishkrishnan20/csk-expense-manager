import type { ChatToolContext } from "../types";
import type { ChatAction } from "../../domain/chatTools";
import { formatLongDate, formatRupees } from "../../domain/format";
import { ASSET_UNITS, GOLD_PURITIES, assetName, defaultUnit, describeQuantity, readAssetForm, typeLabel, unitsFor, type AssetType, type AssetUnit } from "../../domain/assets";

// "Add an asset" for Ask AI: gold, land, a mutual fund or another thing the family owns. It is saved only when the owner taps Save on the card.
// A pledge is not taken here (it has several details), so gold that is pledged is added on the Assets page.

export const addAssetAction: ChatAction<ChatToolContext> = {
  name: "add_asset",
  description:
    "Adds one asset the account holder owns: a piece of gold, land, a mutual fund or another thing. Use it when they say they have bought, received or own something of that kind and want it noted. Needs what it is. It is saved only after they tap Save on the card. It does not record a pledge or a sale.",
  args: {
    type: { kind: "string", required: true, options: ["gold", "land", "mutual_fund", "other"], description: "The kind of asset." },
    item: { kind: "string", required: true, description: "What it is, for example \"Ring\", \"Chain\", \"Plot at Madurai\"." },
    for: { kind: "string", description: "Whom it is for, for example a child's name. Optional." },
    quantity: { kind: "string", description: "Gold: the weight in grams. Land: the size. Fund: the units. Optional." },
    unit: { kind: "string", options: ASSET_UNITS.map((u) => u.value), description: "Land only: cent, acre, sqft or ground. Gold is always in grams (g) and a fund in units." },
    purity: { kind: "integer", min: 18, max: 24, description: "Gold only: the carat, 24, 22 or 18." },
    amount_paid: { kind: "string", description: "What it cost, in rupees. Optional." },
    acquired_date: { kind: "date", description: "When it was bought or received, yyyy-mm-dd. Optional." },
    description: { kind: "string", description: "Any other detail. Optional." },
  },
  async prepare(args, ctx) {
    const type = args.type as AssetType;
    const units = unitsFor(type);
    const unit = ((args.unit as AssetUnit | undefined) ?? defaultUnit(type)) as AssetUnit | null;
    if (unit !== null && !units.includes(unit)) return { ok: false, problem: `a ${typeLabel(type).toLowerCase()} is counted in ${units.join(", ") || "no unit"}, not ${unit}.` };
    const purity = args.purity as number | undefined;
    if (purity !== undefined && (type !== "gold" || !(GOLD_PURITIES as readonly number[]).includes(purity))) {
      return { ok: false, problem: type === "gold" ? `the purity must be one of ${GOLD_PURITIES.join(", ")}.` : "purity is only for gold. Leave it out." };
    }

    const read = readAssetForm({
      type,
      forName: String(args.for ?? ""),
      item: String(args.item ?? ""),
      exchangeId: null,
      status: "ACTIVE",
      quantityText: String(args.quantity ?? ""),
      unit,
      purityK: purity ?? null,
      investedText: String(args.amount_paid ?? ""),
      acquiredDate: (args.acquired_date as string | undefined) ?? null,
      description: String(args.description ?? ""),
      pledged: false,
      lender: "",
      ticketNo: "",
      pledgedDate: null,
      dueDate: null,
      loanText: "",
      pledgeNote: "",
    });
    if (!read.ok) return { ok: false, problem: `${read.error}.` };
    const a = read.fields;

    return {
      ok: true,
      prepared: {
        title: "Add an asset",
        lines: [
          { label: "Type", value: typeLabel(a.type) },
          { label: "Item", value: a.item ?? "" },
          ...(a.forName ? [{ label: "For", value: a.forName }] : []),
          ...(a.quantity !== null ? [{ label: "Quantity", value: describeQuantity(a) }] : []),
          ...(a.investedPaise !== null ? [{ label: "Paid", value: formatRupees(a.investedPaise) }] : []),
          ...(a.acquiredDate ? [{ label: "Acquired", value: formatLongDate(a.acquiredDate) }] : []),
          ...(a.description ? [{ label: "Note", value: a.description }] : []),
        ],
        async save() {
          await ctx.writes.addAsset(a);
          return `Added ${assetName(a.forName, a.item)} to your assets.`;
        },
      },
    };
  },
};
