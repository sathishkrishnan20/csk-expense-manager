import assert from "node:assert/strict";
import test from "node:test";
import { buildExpenseTable, formatPercent } from "../../src/domain/expenseTable";

test("each row's share is of the total of the rows, in the order the chart has them", () => {
  const table = buildExpenseTable([
    { label: "Food & Groceries", totalPaise: 75_000 },
    { label: "Travel", totalPaise: 25_000 },
  ]);
  assert.equal(table.totalPaise, 100_000);
  assert.deepEqual(
    table.rows.map((r) => [r.label, r.totalPaise, r.percent]),
    [
      ["Food & Groceries", 75_000, 75],
      ["Travel", 25_000, 25],
    ],
  );
});

test("the shares add up to 100", () => {
  const table = buildExpenseTable([
    { label: "A", totalPaise: 1 },
    { label: "B", totalPaise: 1 },
    { label: "C", totalPaise: 1 },
  ]);
  assert.ok(Math.abs(table.rows.reduce((n, r) => n + r.percent, 0) - 100) < 1e-9);
});

test("no expenses gives no rows, and a zero total never divides", () => {
  assert.deepEqual(buildExpenseTable([]), { rows: [], totalPaise: 0 });
  assert.equal(buildExpenseTable([{ label: "A", totalPaise: 0 }]).rows[0].percent, 0);
});

test("percentages show one decimal at most, and a tiny share is not shown as 0", () => {
  assert.equal(formatPercent(100), "100%");
  assert.equal(formatPercent(50), "50%");
  assert.equal(formatPercent(42.54), "42.5%");
  assert.equal(formatPercent(33.333), "33.3%");
  assert.equal(formatPercent(0.04), "<0.1%");
  assert.equal(formatPercent(0.06), "0.1%");
  assert.equal(formatPercent(0), "0%");
});
