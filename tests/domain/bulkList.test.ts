import { test } from "node:test";
import assert from "node:assert/strict";
import { bulkTemplateCsv, parseBulkList } from "../../src/domain/bulkList";
import type { CategoryDef } from "../../src/domain/masterData";

const CATS: CategoryDef[] = [
  { category: "Home", subcategories: ["Rent", "Others"] },
  { category: "Income", subcategories: ["Salary", "Others"] },
];

test("rows pasted from Excel (tab separated, no header): name and amount", () => {
  const rows = parseBulkList("Room Rent\t24000\nRoom Expenses EB + Water + Maintanance fee + Gas\t3000\nMarriage loan only\t21,641", CATS);
  assert.deepEqual(rows.map((r) => [r.name, r.amountPaise, r.issue]), [
    ["Room Rent", 2400000, null],
    ["Room Expenses EB + Water + Maintanance fee + Gas", 300000, null],
    ["Marriage loan only", 2164100, null],
  ]);
  assert.deepEqual(rows.map((r) => r.line), [1, 2, 3]);
});

test("comma separated, with rupee signs, decimals and a trailing space in the name", () => {
  const rows = parseBulkList("Internet Bill,₹1030.50\nTerm Insurance ,1755", CATS);
  assert.deepEqual(rows.map((r) => [r.name, r.amountPaise]), [["Internet Bill", 103050], ["Term Insurance", 175500]]);
});

test("a quoted amount with a thousands comma is one amount", () => {
  const rows = parseBulkList('Internet Bill,"1,030.50"\nTerm Insurance ,1755', CATS);
  assert.deepEqual(rows.map((r) => [r.name, r.amountPaise]), [["Internet Bill", 103050], ["Term Insurance", 175500]]);
});

test("a line that is just 'name amount' with spaces is split at the amount", () => {
  const rows = parseBulkList("Room Rent 24000\nTravel Tickets Train and Car Fuel and Toll 8000", CATS);
  assert.deepEqual(rows.map((r) => [r.name, r.amountPaise]), [["Room Rent", 2400000], ["Travel Tickets Train and Car Fuel and Toll", 800000]]);
});

test("zero, missing and non-numeric amounts are flagged and give no amount", () => {
  const rows = parseBulkList("Credit Card Axis\t0\nNPS\t\nGold\tabc\nOk\t5", CATS);
  assert.match(rows[0].issue ?? "", /0/);
  assert.match(rows[1].issue ?? "", /missing/);
  assert.match(rows[2].issue ?? "", /not a number/);
  assert.equal(rows[3].issue, null);
  assert.equal(rows[0].amountPaise, 0);
});

test("a header row names the columns, in any order", () => {
  const text = "Amount,Name,Date,Type,Category,Subcategory,Description,Payment Method\n12000,Landlord,05-Nov-2026,Debit,home,rent,Room rent,UPI";
  const [r] = parseBulkList(text, CATS);
  assert.deepEqual(r, {
    line: 1,
    name: "Landlord",
    amountPaise: 1200000,
    date: "2026-11-05",
    direction: "debit",
    category: "Home",
    subcategory: "Rent",
    description: "Room rent",
    paymentMethod: "UPI",
    issue: null,
  });
});

test("empty optional cells mean: default date and type, and left for the AI", () => {
  const [r] = parseBulkList("Name,Amount,Date,Type,Category,Subcategory\nRoom Rent,24000,,,,", CATS);
  assert.deepEqual([r.date, r.direction, r.category, r.subcategory, r.issue], [null, null, "", "", null]);
});

test("bad date, bad type, unknown or half-given category are flagged", () => {
  const rows = parseBulkList(
    [
      "Name,Amount,Date,Type,Category,Subcategory",
      "A,1,31-Foo-2026,,,",
      "B,1,,Sideways,,",
      "C,1,,,Pets,Vet",
      "D,1,,,Home,",
      "E,1,,Credit,Home,Rent",
      "F,1,,Debit,Income,Salary",
    ].join("\n"),
    CATS,
  );
  assert.match(rows[0].issue ?? "", /Date/);
  assert.match(rows[1].issue ?? "", /Debit or Credit/);
  assert.match(rows[2].issue ?? "", /not one of your categories/);
  assert.match(rows[3].issue ?? "", /both a category and a subcategory/);
  assert.match(rows[4].issue ?? "", /Income category/);
  assert.match(rows[5].issue ?? "", /cannot use an Income/);
});

test("an Income category without a type makes the row a credit", () => {
  const [r] = parseBulkList("Name,Amount,Category,Subcategory\nSalary,95000,Income,Salary", CATS);
  assert.equal(r.direction, "credit");
  assert.equal(r.issue, null);
});

test("blank lines and a BOM are ignored; empty text gives no rows", () => {
  assert.deepEqual(parseBulkList("", CATS), []);
  assert.deepEqual(parseBulkList("\n  \n", CATS), []);
  assert.equal(parseBulkList("﻿Room Rent\t24000\n\nInternet\t1030\n", CATS).length, 2);
});

test("the downloadable template reads back as its three example rows", () => {
  const rows = parseBulkList(bulkTemplateCsv(), CATS);
  assert.deepEqual(rows.map((r) => [r.name, r.amountPaise, r.issue]), [
    ["Room Rent", 2400000, null],
    ["Internet Bill", 103000, null],
    ["Karthika Pocket Money", 330000, null],
  ]);
});

test("an explicit header row, written in any order, is read", () => {
  const text = [
    "Date,Payee,Amount,Category,Subcategory,Description",
    "05-Nov-2026,Landlord,24000,Home,Rent,Room rent",
    ",Internet Bill,1030,,,",
  ].join("\n");
  const [a, b] = parseBulkList(text, CATS);
  assert.deepEqual([a.name, a.amountPaise, a.date, a.category, a.subcategory, a.description, a.issue], ["Landlord", 2400000, "2026-11-05", "Home", "Rent", "Room rent", null]);
  assert.deepEqual([b.name, b.amountPaise, b.date, b.category, b.issue], ["Internet Bill", 103000, null, "", null]);
});

test("only Payee and Amount are required, whatever the order or the other columns", () => {
  const rows = parseBulkList("Amount\tPayee\n24000\tRoom Rent\n1030\tInternet Bill", CATS);
  assert.deepEqual(rows.map((r) => [r.name, r.amountPaise, r.issue]), [["Room Rent", 2400000, null], ["Internet Bill", 103000, null]]);

  const withDescriptionFirst = parseBulkList("Description,Amount,Payee\nnov,5000,Maid", CATS);
  assert.deepEqual([withDescriptionFirst[0].name, withDescriptionFirst[0].amountPaise, withDescriptionFirst[0].description], ["Maid", 500000, "nov"]);
});

test("a header with no Payee or no Amount column marks every row instead of guessing", () => {
  const noPayee = parseBulkList("Date,Amount\n05-Nov-2026,100", CATS);
  assert.match(noPayee[0].issue ?? "", /no Payee column/);
  const noAmount = parseBulkList("Payee,Date\nRent,05-Nov-2026", CATS);
  assert.match(noAmount[0].issue ?? "", /no Amount column/);
});

test("the header row of the template is exactly the default one", () => {
  const first = bulkTemplateCsv().replace(/^\uFEFF/, "").split("\r\n")[0];
  assert.equal(first, "Payee,Amount,Date,Category,Subcategory,Description");
});

test("without a header of their own the columns follow the default order: Payee, Amount, Date, Category, Subcategory, Description", () => {
  const two = parseBulkList("Room Rent\t24000", CATS)[0];
  assert.deepEqual([two.name, two.amountPaise, two.date, two.issue], ["Room Rent", 2400000, null, null]);

  const wide = parseBulkList("Landlord\t24000\t05-Nov-2026\tHome\tRent\tRoom rent", CATS)[0];
  assert.deepEqual(
    [wide.name, wide.amountPaise, wide.date, wide.category, wide.subcategory, wide.description, wide.issue],
    ["Landlord", 2400000, "2026-11-05", "Home", "Rent", "Room rent", null],
  );

  // the date is the third column and may be left empty on some rows
  const three = parseBulkList("Internet Bill\t1030\t\nMaid\t3000\t05-Nov-2026", CATS);
  assert.deepEqual(three.map((r) => [r.name, r.amountPaise, r.date]), [["Internet Bill", 103000, null], ["Maid", 300000, "2026-11-05"]]);
});
