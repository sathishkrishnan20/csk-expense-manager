import type { ChatCapability } from "../types";
import { formatRupees } from "../../domain/format";
import { containersOf } from "../../domain/monthTemplate";

// The monthly template (Config > Monthly template): the groups and entries the owner has described for every month, with the day each entry falls on and the two switches. It is
// the plan, not what happened: what a month actually holds is in the expense tools. Nothing is added by chat.
export const monthTemplateCapability: ChatCapability = {
  id: "month_template",
  title: "Monthly template",
  description: "The groups and entries you set up to be created at the start of every month, and the day of the month each falls on.",
  tools: [
    {
      name: "month_template",
      description:
        "The owner's monthly template: Main and each group (a group is made by an entry, which names it), whether mutual fund purchases go into it or Home opens on it, and the entries made in each every month, with category, payee, amount (or 'asked each month') and day of the month. Use it for 'what do I pay every month', 'what is in my template' or 'when does rent go out'. It is the plan only, not what was actually spent. Never add the amounts yourself.",
      args: {},
      async run(_args, ctx) {
        const t = await ctx.data.monthTemplate();
        if (t.lines.length === 0) return { set_up: false, note: "No monthly template has been made yet (Config > Monthly template)." };
        const entryOf = (l: (typeof t.lines)[number]) => ({
          payee: l.payee,
          kind: l.direction === "credit" ? "income" : "expense",
          category: `${l.category} / ${l.subcategory}`,
          amount: l.amountPaise === null ? "asked each month" : formatRupees(l.amountPaise),
          day_of_month: l.day,
          creates_group: l.createsGroupId ? t.groups.find((g) => g.id === l.createsGroupId)?.name : undefined,
        });
        return {
          containers: containersOf(t).map(({ group, lines }) => ({
            name: group ? group.name : "Main",
            mutual_fund_purchases_go_here: group ? group.fundsHere : undefined,
            home_opens_on_it: group ? group.home : undefined,
            entries: lines.map(entryOf),
          })),
        };
      },
    },
  ],
};
