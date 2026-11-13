import type { ChatCapability, ChatToolContext } from "../types";
import type { EntrySort, ExpenseFilter, ExpenseGroupBy, ExpenseType } from "../../domain/chatQuery";
import type { ArgSpecs, ToolArgs } from "../../domain/chatTools";
import { formatRupees } from "../../domain/format";
import { addTransactionAction } from "./expenseActions";

// Money spent and received, from the entries of the groups chosen on the page (Home, Transactions and Charts use the same entries).

const FILTER_ARGS: ArgSpecs = {
  from: { kind: "date", description: "First day to include. Default: the first day of the period chosen on the page." },
  to: { kind: "date", description: "Last day to include. Default: the last day of the period chosen on the page." },
  category: { kind: "string", description: "Only this category, named exactly as in the category list." },
  subcategory: { kind: "string", description: "Only this subcategory, named exactly as in the category list." },
  payee: { kind: "string", description: "Only entries whose payee name contains this text." },
  textContains: {
    kind: "string_list",
    description: "Only entries that have any of these words in the description, the UPI note or the payee. Give spelling variants and local names together, for example [\"paal\", \"milk\"].",
  },
};

const GROUP_BY = ["none", "category", "subcategory", "month", "payee", "payment_method", "description"] as const;

function filterOf(args: ToolArgs, ctx: ChatToolContext, type: ExpenseType): ExpenseFilter {
  const from = (args.from as string | undefined) ?? ctx.range.start;
  const to = (args.to as string | undefined) ?? ctx.range.end;
  if (from > to) throw new Error(`"from" (${from}) is after "to" (${to}).`);
  return {
    type,
    from,
    to,
    category: args.category as string | undefined,
    subcategory: args.subcategory as string | undefined,
    payee: args.payee as string | undefined,
    textContains: args.textContains as string[] | undefined,
  };
}

// The filter as the AI is told it was applied, so it can say what it looked at.
function applied(f: ExpenseFilter): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (f.category) out.category = f.category;
  if (f.subcategory) out.subcategory = f.subcategory;
  if (f.payee) out.payeeContains = f.payee;
  if (f.textContains?.length) out.textContainsAny = f.textContains;
  return out;
}

const oneLine = (text: string | null): string | undefined => {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  return t === "" ? undefined : t.length > 100 ? `${t.slice(0, 100)}…` : t;
};

export const expensesCapability: ChatCapability = {
  id: "expenses",
  title: "Expenses",
  description: "Money spent and received: totals, breakdowns and single payments, by date, category, payee and the words you wrote.",
  actions: [addTransactionAction],
  tools: [
    {
      name: "expense_totals",
      description:
        "Exact total and number of entries of money spent (or received) for a period, optionally filtered and broken down (by category, subcategory, month, payee, payment method, or what was written for the entry). Use this for any question about how much, how many, which is the most, or a comparison between months. Never add up many entries yourself; ask for the total.",
      args: {
        type: { kind: "string", options: ["spent", "received"], description: "spent (the default) or received." },
        ...FILTER_ARGS,
        groupBy: { kind: "string", options: GROUP_BY, description: "Break the total down by this. Default: none, one total." },
        limit: { kind: "integer", min: 1, max: 40, description: "How many rows of the breakdown to return, largest first. Default 20." },
      },
      async run(args, ctx) {
        const filter = filterOf(args, ctx, (args.type as ExpenseType | undefined) ?? "spent");
        const groupBy = (args.groupBy as ExpenseGroupBy | undefined) ?? "none";
        const r = await ctx.data.expenseTotals(filter, groupBy, (args.limit as number | undefined) ?? 20);
        return {
          groups: ctx.scopeLabel,
          period: `${filter.from} to ${filter.to}`,
          type: filter.type,
          ...applied(filter),
          total: formatRupees(r.totalPaise),
          entries: r.count,
          ...(groupBy === "none"
            ? {}
            : {
                groupedBy: groupBy,
                rows: r.rows.map((row) => ({ label: row.label, total: formatRupees(row.totalPaise), entries: row.count })),
                moreRowsNotShown: r.moreRows,
              }),
        };
      },
    },
    {
      name: "expense_entries",
      description:
        "The single payments (date, amount, category, payee, payment method, what the account holder wrote) that match the filters, newest or largest first, up to 50. Use it to find a particular payment, to see what was bought, or to look at the entries behind a total. It says how many entries match in all.",
      args: {
        type: { kind: "string", options: ["spent", "received", "both"], description: "spent (the default), received or both." },
        ...FILTER_ARGS,
        sort: { kind: "string", options: ["newest", "largest"], description: "newest (the default) or largest." },
        limit: { kind: "integer", min: 1, max: 50, description: "How many entries to return. Default 20." },
      },
      async run(args, ctx) {
        const filter = filterOf(args, ctx, (args.type as ExpenseType | undefined) ?? "spent");
        const r = await ctx.data.expenseEntries(filter, (args.sort as EntrySort | undefined) ?? "newest", (args.limit as number | undefined) ?? 20);
        return {
          groups: ctx.scopeLabel,
          period: `${filter.from} to ${filter.to}`,
          ...applied(filter),
          matchingEntries: r.matching,
          showing: r.entries.length,
          entries: r.entries.map((e) => {
            const description = oneLine(e.description);
            const note = oneLine(e.note);
            return {
              date: e.date,
              type: e.direction === "debit" ? "spent" : "received",
              amount: formatRupees(e.amountPaise),
              category: `${e.category} : ${e.subcategory}`,
              payee: oneLine(e.payee),
              via: oneLine(e.paymentMethod),
              description,
              note: note && note.toLowerCase() !== description?.toLowerCase() ? note : undefined,
              group: ctx.spansGroups ? ctx.groupNames.get(e.groupId) : undefined,
            };
          }),
        };
      },
    },
  ],
};
