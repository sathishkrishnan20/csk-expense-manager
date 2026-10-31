import { test } from "node:test";
import assert from "node:assert/strict";
import {
  copyGroupName,
  endOfMonth,
  incomeClassFor,
  openingIncomeFor,
  suggestGroup,
  validateNewGroups,
} from "../../src/domain/entryGroup";

test("end of month handles short months and leap years", () => {
  assert.equal(endOfMonth("2026-10-05"), "2026-10-31");
  assert.equal(endOfMonth("2026-02-10"), "2026-02-28");
  assert.equal(endOfMonth("2028-02-10"), "2028-02-29");
  assert.equal(endOfMonth("2026-12-31"), "2026-12-31");
});

test("suggested group: Category - Subcategory, else description, else payee; starts on the entry date, ends with its month", () => {
  const base = { category: "Food", subcategory: "Groceries", description: "Weekly", payee: "Shop", txnDate: "2026-10-05" };
  assert.deepEqual(suggestGroup(base), { name: "Food - Groceries", startDate: "2026-10-05", endDate: "2026-10-31" });
  assert.equal(suggestGroup({ ...base, category: "", subcategory: "" }).name, "Weekly");
  assert.equal(suggestGroup({ ...base, category: "", subcategory: "", description: null }).name, "Shop");
  assert.equal(suggestGroup({ ...base, category: "", subcategory: "", description: " ", payee: null }).name, "");
  // a category without a subcategory is not enough
  assert.equal(suggestGroup({ ...base, subcategory: "" }).name, "Weekly");
});

test("a copy's group name gets the copy's month, replacing an earlier month label", () => {
  assert.equal(copyGroupName("Bengaluru", "2026-12-05"), "Bengaluru Dec 2026");
  assert.equal(copyGroupName("Bengaluru Dec 2026", "2027-01-05"), "Bengaluru Jan 2027");
  assert.equal(copyGroupName("Food - Groceries", "2026-11-30"), "Food - Groceries Nov 2026");
});

test("new groups: name needed, unique among existing and among each other, dates in order", () => {
  const errors = validateNewGroups(
    [
      { name: "Bengaluru Dec 2026", startDate: "2026-12-01", endDate: "2026-12-31" },
      { name: "bengaluru dec 2026", startDate: null, endDate: null },
      { name: "Main", startDate: null, endDate: null },
      { name: " ", startDate: null, endDate: null },
      { name: "Trip", startDate: "2026-12-05", endDate: "2026-12-01" },
      { name: "Fine", startDate: "2026-12-01", endDate: "2026-12-01" },
    ],
    ["Main", "Other"],
  );
  assert.equal(errors[0], null);
  assert.match(errors[1] ?? "", /Another new group/);
  assert.match(errors[2] ?? "", /already exists/);
  assert.match(errors[3] ?? "", /Enter a name/);
  assert.match(errors[4] ?? "", /end date/);
  assert.equal(errors[5], null);
});

test("the opening income uses Account Transfer when it exists, otherwise Income : Others", () => {
  assert.deepEqual(incomeClassFor([{ category: "Income", subcategories: ["Salary", "Account Transfer"] }]), {
    category: "Income",
    subcategory: "Account Transfer",
  });
  assert.deepEqual(incomeClassFor([{ category: "Income", subcategories: ["Salary"] }]), { category: "Income", subcategory: "Others" });
  assert.deepEqual(incomeClassFor([]), { category: "Income", subcategory: "Others" });
});

test("the opening income mirrors the entry as a credit", () => {
  const income = openingIncomeFor(
    { txnDate: "2026-10-05", amountPaise: 2000000, paymentMethod: "UPI", payee: "Bengaluru", description: null },
    { category: "Income", subcategory: "Account Transfer" },
  );
  assert.deepEqual(income, {
    txnDate: "2026-10-05",
    direction: "credit",
    amountPaise: 2000000,
    category: "Income",
    subcategory: "Account Transfer",
    payee: "Main",
    paymentMethod: "UPI",
    description: "Bengaluru",
  });
});
