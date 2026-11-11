import type { ChatCapability } from "../types";
import { formatRupees } from "../../domain/format";
import { balanceOf, totalInPaise, totalOutPaise } from "../../domain/groups";

// The groups (Groups page): a trip, a month, a project, with their dates, status and balance. A group's figures include the groups below it.

export const groupsCapability: ChatCapability = {
  id: "groups",
  title: "Groups",
  description: "Your groups (months, trips, projects): their dates, status, income, expenses and balance.",
  tools: [
    {
      name: "groups_list",
      description: "The groups with their dates, whether they are open or closed, the group they sit under, and their income, expenses and balance (including the groups below them). Use it for what groups exist and how each stands. For spending inside a group use expense_totals.",
      args: {
        search: { kind: "string", description: "Only groups whose name contains this text." },
        status: { kind: "string", options: ["ACTIVE", "CLOSED", "all"], description: "ACTIVE (the default), CLOSED or all." },
        limit: { kind: "integer", min: 1, max: 40, description: "How many to return. Default 30." },
      },
      async run(args, ctx) {
        const all = await ctx.data.groups();
        const names = new Map(all.map((g) => [g.id, g.name]));
        const search = ((args.search as string | undefined) ?? "").trim().toLowerCase();
        const status = (args.status as string | undefined) ?? "ACTIVE";
        const found = all.filter((g) => g.status !== "DELETED" && (status === "all" || g.status === status) && (!search || g.name.toLowerCase().includes(search)));
        const limit = (args.limit as number | undefined) ?? 30;
        return {
          matching: found.length,
          showing: Math.min(found.length, limit),
          groups: found.slice(0, limit).map((g) => ({
            name: g.name,
            status: g.status === "CLOSED" ? "closed" : "open",
            under: g.parentId ? names.get(g.parentId) : undefined,
            from: g.startDate ?? undefined,
            to: g.endDate ?? undefined,
            income: formatRupees(totalInPaise(g)),
            expenses: formatRupees(totalOutPaise(g)),
            balance: formatRupees(balanceOf(g)),
          })),
        };
      },
    },
  ],
};
