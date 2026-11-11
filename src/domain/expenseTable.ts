import type { GroupTotal } from "../db/transactions";

// The table under the Charts page's bar chart: one row per category, subcategory, payer or payment method (whichever the chart is
// grouped by), with its amount and the share of all the expenses shown that it takes. The rows are the chart's own bars, so the table
// and the chart always agree.
export interface ExpenseTableRow {
  label: string;
  totalPaise: number;
  percent: number; // 0 to 100, of totalPaise below
}

export interface ExpenseTable {
  rows: ExpenseTableRow[];
  totalPaise: number;
}

export function buildExpenseTable(groups: readonly GroupTotal[]): ExpenseTable {
  const totalPaise = groups.reduce((sum, g) => sum + g.totalPaise, 0);
  const rows = groups.map((g) => ({
    label: g.label,
    totalPaise: g.totalPaise,
    percent: totalPaise > 0 ? (g.totalPaise / totalPaise) * 100 : 0,
  }));
  return { rows, totalPaise };
}

// "42.5%", "100%", and "<0.1%" for a share that is more than nothing but would show as 0.0%.
export function formatPercent(percent: number): string {
  if (percent <= 0) return "0%";
  if (percent < 0.05) return "<0.1%";
  const text = (Math.round(percent * 10) / 10).toFixed(1);
  return `${text.endsWith(".0") ? text.slice(0, -2) : text}%`;
}
