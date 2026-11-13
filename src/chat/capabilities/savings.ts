import type { ChatCapability } from "../types";
import { formatRupees } from "../../domain/format";
import { KIND_LABELS, formatNav, formatUnits, holdingInvested, holdingUnits, holdingValue, monthLines, monthLabel, monthTotalPaise, summarise, type SavingsKind } from "../../domain/savings";

// What the owner has put into mutual funds, NPS and PF, and what the holdings are worth (Savings page), read from the statements imported there. Information
// only: none of it touches a balance. Nothing is added by chat (the figures come from statements). Only the last four characters of a PRAN or a PF member ID
// are given, never the whole number.

const money = (paise: number | null): string | undefined => (paise === null ? undefined : formatRupees(paise));
const last4 = (id: string): string => `…${id.slice(-4)}`;
const KINDS = ["mutual_funds", "nps", "pf"] as const;
const KIND_OF: Record<(typeof KINDS)[number], SavingsKind> = { mutual_funds: "mf", nps: "nps", pf: "pf" };

export const savingsCapability: ChatCapability = {
  id: "savings",
  title: "Savings",
  description: "What you have put into mutual funds, NPS and PF (each month), and what those holdings are worth, from the statements you imported.",
  tools: [
    {
      name: "savings_summary",
      description:
        "What the savings are worth now, and how much went in: the total across mutual funds, NPS and PF; for mutual funds the value, the amount invested and each fund's units and NAV; for NPS the value, what was contributed and the statement's return figure; for each PF account the employee, employer and pension balances. Each part says which statement it is from and, for funds and NPS, which NAV day the value uses. Use it for 'how much do I have in...' and 'what is my total'. A PF figure marked estimated is the usual monthly amount added until the passbook shows the real one; PF interest is only what the passbook shows. Never add the figures yourself: use the totals given.",
      args: {},
      async run(_args, ctx) {
        const overview = await ctx.data.savings();
        const s = summarise(overview);
        if (!s.mf && !s.nps && s.pf.length === 0) return { imported: false, note: "No savings statements have been imported yet (Savings page > Import statement)." };
        return {
          total_value: formatRupees(s.totalValuePaise),
          mutual_funds: s.mf
            ? {
                value: formatRupees(s.mf.valuePaise),
                invested: money(s.mf.investedPaise),
                gain: s.mf.investedPaise !== null ? formatRupees(s.mf.valuePaise - s.mf.investedPaise) : undefined,
                statement_date: s.mf.asOf ?? undefined,
                nav_date: s.mf.navDate ?? undefined,
                value_uses_todays_nav: s.mf.live,
                funds: overview.holdings
                  .filter((h) => h.kind === "mf")
                  .map((h) => {
                    const v = holdingValue(h);
                    return { name: h.name, units: formatUnits(holdingUnits(h)), nav: formatNav(v.navE4), value: formatRupees(v.valuePaise), invested: money(holdingInvested(h)) };
                  }),
              }
            : "not imported",
          nps: s.nps
            ? {
                value: formatRupees(s.nps.valuePaise),
                contributed_in_total: money(s.nps.contributedPaise),
                statement_return_percent: s.nps.xirr ?? undefined,
                statement_date: s.nps.asOf ?? undefined,
                nav_date: s.nps.navDate ?? undefined,
                value_uses_todays_nav: s.nps.live,
              }
            : "not imported",
          pf:
            s.pf.length > 0
              ? s.pf.map((p) => ({
                  account: last4(p.account.account),
                  status: p.account.status === "ACTIVE" ? "active" : "closed",
                  employee_balance: money(p.account.ownPaise),
                  employer_balance: money(p.account.employerPaise),
                  pension_balance: money(p.account.pensionPaise),
                  balance_employee_plus_employer: formatRupees(p.balancePaise),
                  passbook_date: p.account.asOf ?? undefined,
                  estimated_since_passbook: p.estimatedPaise > 0 ? formatRupees(p.estimatedPaise) : undefined,
                  adds_monthly_estimate: p.account.autoAdd,
                }))
              : "not imported",
        };
      },
    },
    {
      name: "savings_months",
      description:
        "How much was put into savings each month, by kind: mutual funds (the money that went into your funds that month), NPS and PF (employee plus employer plus pension, for the month the contribution is for), with the total, and which PF months are estimates. Also the totals over the months asked for, by kind. Use it for 'how much did I put in last month', 'how much into NPS this year', 'what do I save each month'. A month with a dash or missing has no figure yet (its statement was not imported). Never add the months yourself: use the totals given.",
      args: {
        from: { kind: "date", description: "Only months from the one this date falls in." },
        to: { kind: "date", description: "Only months up to the one this date falls in." },
        kind: { kind: "string", options: KINDS, description: "Only this kind: mutual_funds, nps or pf. Default: all three." },
        limit: { kind: "integer", min: 1, max: 36, description: "How many months to list, newest first. Default 12." },
      },
      async run(args, ctx) {
        const from = (args.from as string | undefined)?.slice(0, 7);
        const to = (args.to as string | undefined)?.slice(0, 7);
        const kind = args.kind ? KIND_OF[args.kind as (typeof KINDS)[number]] : null;
        const rows = (await ctx.data.savings()).months.filter((r) => (!from || r.month >= from) && (!to || r.month <= to) && (!kind || r.kind === kind));
        if (rows.length === 0) return { months: 0, note: "No monthly figures match. Import the statements on the Savings page to fill them in." };
        const lines = monthLines(rows);
        const limit = (args.limit as number | undefined) ?? 12;
        const sum = (k: SavingsKind) => rows.filter((r) => r.kind === k).reduce((n, r) => n + monthTotalPaise(r), 0);
        const per = (paise: number): string | undefined => (paise === 0 ? undefined : formatRupees(paise));
        return {
          months_with_figures: lines.length,
          showing: Math.min(lines.length, limit),
          totals_for_these_months: { [KIND_LABELS.mf]: per(sum("mf")), [KIND_LABELS.nps]: per(sum("nps")), [KIND_LABELS.pf]: per(sum("pf")), all: formatRupees(rows.reduce((n, r) => n + monthTotalPaise(r), 0)) },
          months: lines.slice(0, limit).map((l) => ({
            month: monthLabel(l.month),
            mutual_funds: per(l.mfPaise),
            nps: per(l.npsPaise),
            pf: per(l.pfPaise),
            pf_includes_estimate: l.pfEstimated || undefined,
            total: formatRupees(l.totalPaise),
          })),
        };
      },
    },
  ],
};
