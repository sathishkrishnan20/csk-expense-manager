import type { ChatToolContext } from "../types";
import type { ChatAction } from "../../domain/chatTools";
import { formatLongDate, formatRupees, parseAmountInput, toISODate } from "../../domain/format";
import type { GroupWithBalance } from "../../domain/groups";
import { MAIN_GROUP_ID } from "../../domain/groups";
import { allowedCategories } from "../../domain/taxonomy";
import type { Direction } from "../../domain/taxonomy";

// "Add an expense or income" for Ask AI. The AI proposes it with the details it has; this checks them against the owner's own lists and works out
// exactly what would be saved. Nothing is written here: the entry is saved only when the owner taps Save on the card.

const SAME_AS_PAGE = new Set(["home", "home group", "this", "this group", "here", "current", "current group"]);

// The group an entry goes into: the one named, or the one open on the page. Only open groups take entries.
export function resolveGroup(wanted: string | undefined, groups: readonly GroupWithBalance[], pageGroupId: string): { id: string; name: string } | { problem: string } {
  const open = groups.filter((g) => g.status === "ACTIVE");
  // The page's group when it is open; otherwise Main, which always is.
  const pageGroup = open.find((g) => g.id === pageGroupId);
  const page = pageGroup ? { id: pageGroup.id, name: pageGroup.name } : { id: MAIN_GROUP_ID, name: "Main" };
  const text = wanted?.trim().toLowerCase() ?? "";
  if (text === "") return page;

  const exact = open.find((g) => g.name.toLowerCase() === text);
  if (exact) return { id: exact.id, name: exact.name };
  if (SAME_AS_PAGE.has(text)) return page;
  const partial = open.filter((g) => g.name.toLowerCase().includes(text));
  if (partial.length === 1) return { id: partial[0].id, name: partial[0].name };
  return { problem: `there is no open group called "${wanted}". The groups are: ${open.map((g) => g.name).join(", ") || "Main"}.` };
}

const caseless = (list: readonly string[], text: unknown): string | undefined => {
  const wanted = typeof text === "string" ? text.trim().toLowerCase() : "";
  return wanted === "" ? undefined : list.find((x) => x.toLowerCase() === wanted);
};

export const addTransactionAction: ChatAction<ChatToolContext> = {
  name: "add_transaction",
  description:
    "Adds one expense or one income entry to a group. Use it when the account holder says they spent, paid, bought, received or earned something and wants it recorded. Needs the amount and who was paid (or who paid them); everything else has a default. The entry is saved only after the account holder taps Save on the card.",
  args: {
    type: { kind: "string", options: ["expense", "income"], description: "expense (the default) or income." },
    amount: { kind: "string", required: true, description: "The amount in rupees as a plain number, for example \"250\" or \"1250.50\"." },
    payee: { kind: "string", required: true, description: "Who was paid (a shop or a person), or for income who paid it. Ask for it when they have not said." },
    description: { kind: "string", description: "What it was for, in their words, for example \"tea and snacks\". Optional." },
    date: { kind: "date", description: "The day it happened, yyyy-mm-dd. Default: today." },
    category: { kind: "string", description: "For an expense: one category from their list, exactly as written. Leave out when none clearly fits." },
    subcategory: { kind: "string", description: "The subcategory of that category, exactly as written (for income, one of the income subcategories)." },
    payment_method: { kind: "string", description: "How it was paid, exactly as in their list of payment methods, for example UPI or Cash. Optional." },
    group: { kind: "string", description: "The group to add it to, by name. Default: the group open on the page." },
  },
  async prepare(args, ctx) {
    const amountPaise = parseAmountInput(String(args.amount ?? ""));
    if (amountPaise === null) return { ok: false, problem: `the amount "${String(args.amount ?? "")}" is not a positive number of rupees. Ask for it, for example 250 or 1250.50.` };
    const payee = String(args.payee ?? "").trim();
    if (payee === "") return { ok: false, problem: "the payee is missing. Ask who was paid." };

    const direction: Direction = args.type === "income" ? "credit" : "debit";
    const date = (args.date as string | undefined) ?? toISODate(ctx.now);

    const [groups, categories, methods] = await Promise.all([ctx.data.groups(), ctx.data.categories(), ctx.data.paymentMethods()]);
    const group = resolveGroup(args.group as string | undefined, groups, ctx.pageGroupId);
    if ("problem" in group) return { ok: false, problem: group.problem };

    let paymentMethod: string | null = null;
    if (args.payment_method !== undefined) {
      const found = caseless(methods, args.payment_method);
      if (!found) return { ok: false, problem: `"${String(args.payment_method)}" is not one of the payment methods: ${methods.join(", ") || "none set up"}. Use one of them, or leave it out.` };
      paymentMethod = found;
    }

    // The category must be in the owner's list. When it is not given, or not in the list, the entry is saved for the AI to file later (the same as
    // "Categorise later" on the add form); the card says so.
    const cat = allowedCategories(categories, direction).find((c) => direction === "credit" || c.category.toLowerCase() === String(args.category ?? "").trim().toLowerCase());
    const sub = cat ? caseless(cat.subcategories, args.subcategory) : undefined;
    const filed = cat && sub ? { category: cat.category, subcategory: sub } : null;

    const description = typeof args.description === "string" && args.description.trim() !== "" ? args.description.trim() : null;
    const input = {
      groupId: group.id,
      txnDate: date,
      direction,
      amountPaise,
      category: filed?.category ?? "",
      subcategory: filed?.subcategory ?? "",
      categoriseLater: filed === null,
      payee,
      paymentMethod,
      description,
    };
    const what = direction === "credit" ? "income" : "expense";
    return {
      ok: true,
      prepared: {
        title: direction === "credit" ? "Add income" : "Add an expense",
        lines: [
          { label: "Amount", value: formatRupees(amountPaise) },
          { label: direction === "credit" ? "Received from" : "Paid to", value: payee },
          { label: "Category", value: filed ? `${filed.category} : ${filed.subcategory}` : "Not chosen yet. The AI files it later (Re-classify)." },
          { label: "Group", value: group.name },
          { label: "Date", value: formatLongDate(date) },
          { label: "Paid by", value: paymentMethod ?? "Not set" },
          ...(description ? [{ label: "For", value: description }] : []),
        ],
        async save() {
          await ctx.writes.addTransaction(input);
          return `Added ${formatRupees(amountPaise)} ${what} (${payee}) to ${group.name}.`;
        },
      },
    };
  },
};
