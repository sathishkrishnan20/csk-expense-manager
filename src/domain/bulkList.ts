// "Add a list": many hand entries from rows pasted out of Excel, or from a CSV or Excel file. Only a payee and an
// amount are needed per row; a date, category, subcategory and description are optional (so are a type and a payment
// method, which are not in the template).
//
// The default header row is Payee, Amount, Date, Category, Subcategory, Description (BULK_HEADER): the two required
// columns first, so a row with only a payee and an amount is complete as it stands. With a header row of their own the
// columns are found by name, in any order. Without one the columns follow the default order. A row that is just
// "payee amount" with spaces is read too.

import Papa from "papaparse";
import { INCOME_CATEGORY, type CategoryDef } from "./masterData";
import { parseAmountPaise, parseDate } from "./statementParser";
import type { Direction } from "./taxonomy";

export interface BulkRow {
  line: number; // 1-based position among the data rows
  name: string;
  amountPaise: number; // 0 when missing or invalid
  date: string | null; // null: the screen's default date
  direction: Direction | null; // null: the screen's default type
  category: string; // "" with subcategory "": left for the AI to categorise
  subcategory: string;
  description: string | null;
  paymentMethod: string | null;
  issue: string | null; // why this row cannot be created; null when it is fine
}

type Field = "name" | "amount" | "date" | "type" | "category" | "subcategory" | "description" | "paymentMethod";

const HEADER_NAMES: Record<string, Field> = {
  payee: "name",
  name: "name",
  "paid to": "name",
  payer: "name",
  item: "name",
  particulars: "name",
  title: "name",
  amount: "amount",
  amt: "amount",
  value: "amount",
  price: "amount",
  cost: "amount",
  date: "date",
  type: "type",
  category: "category",
  subcategory: "subcategory",
  "sub category": "subcategory",
  "sub-category": "subcategory",
  description: "description",
  note: "description",
  notes: "description",
  remarks: "description",
  "payment method": "paymentMethod",
  payment: "paymentMethod",
  mode: "paymentMethod",
  method: "paymentMethod",
};

const DEBIT = /^(debit|expense|dr|d|out)$/i;
const CREDIT = /^(credit|income|cr|c|in)$/i;

// The default header row, shown above the paste box and used for the template.
export const BULK_HEADER = ["Payee", "Amount", "Date", "Category", "Subcategory", "Description"] as const;

const DEFAULT_ORDER: Field[] = ["name", "amount", "date", "category", "subcategory", "description"];

// "Room Rent 24000" in a single cell.
const NAME_THEN_AMOUNT = /^(.*\S)\s+(?:₹|rs\.?\s*)?(\d[\d,]*(?:\.\d+)?)$/i;

function splitRows(text: string): string[][] {
  const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ""), {
    skipEmptyLines: "greedy",
    delimitersToGuess: ["\t", ",", ";"],
  });
  return parsed.data.map((row) => {
    if (row.length === 1) {
      const m = NAME_THEN_AMOUNT.exec(row[0].trim());
      if (m) return [m[1], m[2]];
    }
    return row;
  });
}

function columnsFromHeader(row: string[]): Map<Field, number> | null {
  const map = new Map<Field, number>();
  row.forEach((cell, i) => {
    const field = HEADER_NAMES[cell.trim().toLowerCase()];
    if (field && !map.has(field)) map.set(field, i);
  });
  // A header row names the amount or at least two columns; otherwise the first row is data.
  return map.has("amount") || map.size >= 2 ? map : null;
}

export function parseBulkList(text: string, categories: readonly CategoryDef[]): BulkRow[] {
  const raw = splitRows(text);
  if (raw.length === 0) return [];

  let columns = columnsFromHeader(raw[0]);
  const dataRows = columns ? raw.slice(1) : raw;
  columns ??= new Map(DEFAULT_ORDER.map((f, i) => [f, i] as const));

  // A header row must name the payee and the amount; if it does not, say so on every row.
  const headerIssue = !columns.has("name")
    ? "The header row has no Payee column"
    : !columns.has("amount")
      ? "The header row has no Amount column"
      : null;

  return dataRows.map((cells, index) => {
    const get = (f: Field) => {
      const i = columns!.get(f);
      return i === undefined ? "" : (cells[i] ?? "").trim();
    };

    const name = get("name");
    const amountText = get("amount");
    const amount = parseAmountPaise(amountText);

    let issue: string | null = headerIssue; // a header without a Payee or Amount column spoils every row
    if (!issue) {
      if (!name) issue = "No payee";
      else if (amountText === "" || amount === null) issue = "Amount is missing or not a number";
      else if (amount < 0) issue = "Amount is negative";
      else if (amount === 0) issue = "Amount is 0";
    }

    const dateText = get("date");
    const date = dateText ? parseDate(dateText) : null;
    if (!issue && dateText && !date) issue = `Date "${dateText}" is not recognised`;

    const typeText = get("type");
    let direction: Direction | null = null;
    if (typeText) {
      direction = DEBIT.test(typeText) ? "debit" : CREDIT.test(typeText) ? "credit" : null;
      if (!issue && !direction) issue = `Type "${typeText}" should be Debit or Credit`;
    }

    // Category: both or neither; it must be one of the owner's categories (matched ignoring case).
    let category = "";
    let subcategory = "";
    const categoryText = get("category");
    const subcategoryText = get("subcategory");
    if (categoryText || subcategoryText) {
      const cat = categories.find((c) => c.category.toLowerCase() === categoryText.toLowerCase());
      const sub = cat?.subcategories.find((s) => s.toLowerCase() === subcategoryText.toLowerCase());
      if (!issue) {
        if (!categoryText || !subcategoryText) issue = "Give both a category and a subcategory, or neither";
        else if (!cat || !sub) issue = `"${categoryText} : ${subcategoryText}" is not one of your categories`;
      }
      if (cat && sub) {
        category = cat.category;
        subcategory = sub;
        const income = category === INCOME_CATEGORY;
        if (!direction && income) direction = "credit";
        if (!issue && direction === "credit" && !income) issue = "A credit uses an Income category";
        if (!issue && direction === "debit" && income) issue = "An expense cannot use an Income category";
      }
    }

    return {
      line: index + 1,
      name,
      amountPaise: amount !== null && amount > 0 ? amount : 0,
      date,
      direction,
      category,
      subcategory,
      description: get("description") || null,
      paymentMethod: get("paymentMethod") || null,
      issue,
    };
  });
}

export const BULK_TEMPLATE_FILE_NAME = "csk-manager-list-template.csv";

// Only Payee and Amount are needed; the rest can stay empty (the default date is chosen on the screen, and an empty
// category is left for the AI).
export function bulkTemplateCsv(): string {
  const rows = [
    [...BULK_HEADER],
    ["Room Rent", "24000", "", "", "", ""],
    ["Internet Bill", "1030", "", "", "", ""],
    ["Karthika Pocket Money", "3300", "", "", "", ""],
  ];
  return "﻿" + Papa.unparse(rows, { newline: "\r\n" });
}
