export interface CategoryDef {
  category: string;
  subcategories: string[];
  // Optional note per subcategory on what belongs in it, sent to the AI with the names (see llm/classify.ts).
  descriptions?: Record<string, string>;
}

export const MAX_SUBCATEGORY_DESCRIPTION = 200;

// One line, trimmed, as it is stored and sent to the AI.
export const cleanDescription = (text: string): string => text.replace(/\s+/g, " ").trim();

export interface Classification {
  category: string;
  subcategory: string;
}

// The one category whose subcategories are money-in. Fixed because the Add form,
// the charts and the credit classification all key off it.
export const INCOME_CATEGORY = "Income";

export function isIncomeCategory(name: string): boolean {
  return name === INCOME_CATEGORY;
}

// Used when nothing in the user's categories fits. It lives in the category
// list like any other row but cannot be deleted or renamed.
export const FALLBACK: Classification = { category: "Others", subcategory: "Uncategorised" };

// Not a stored category: the Update form offers it under Others so the owner can hand a row back to the AI
// (after adding categories, say). It is never sent to the AI as a choice and never saved on a row.
export const RECATEGORISE: Classification = { category: FALLBACK.category, subcategory: "Recategorise with AI" };

export function isRecategorise(category: string, subcategory: string): boolean {
  return category === RECATEGORISE.category && subcategory === RECATEGORISE.subcategory;
}

// Used when a credit does not fit any Income subcategory.
export const INCOME_FALLBACK: Classification = { category: INCOME_CATEGORY, subcategory: "Others" };

export function isProtectedSubcategory(category: string, subcategory: string): boolean {
  return category === FALLBACK.category && subcategory === FALLBACK.subcategory;
}

export function isProtectedCategory(category: string): boolean {
  return category === INCOME_CATEGORY || category === FALLBACK.category;
}

// Seeded on first run (a fresh install, or a new device with no categories yet). This is the owner's own
// Config list, spelling kept as-is so existing history lines up. Income : Others is added to it because it is
// the fallback for a credit the AI cannot place. Existing installs keep their categories; edit them in Config.
export const DEFAULT_CATEGORIES: CategoryDef[] = [
  { category: "Income", subcategories: ["Salary", "Personal Savings", "Part-time work", "Annuities", "Account Transfer", "Others"] },
  {
    category: "Entertainment",
    subcategories: [
      "Concert",
      "Party",
      "Sports",
      "Cinema theatre",
      "OTT platforms",
      "Cable TV",
      "Amusement Park",
      "Funtura",
    ],
  },
  {
    category: "Family Support",
    subcategories: [
      "Child Education",
      "Others",
      "Karthika Allowance",
      "Manju College fee",
      "Father allowances",
    ],
  },
  {
    category: "Automobile",
    subcategories: [
      "Fuel",
      "Insurance",
      "Registration",
      "Toll charges",
      "Parking",
      "General Services",
      "Accessories",
    ],
  },
  {
    category: "Food & Groceries",
    subcategories: [
      "Dining out & Food Delivery",
      "Snacks",
      "Fruits",
      "Chaats",
      "Groceries",
      "Vegetables",
      "Meat & Seafoods",
    ],
    descriptions: {
      Chaats: "Dikky poori, Panipoori, bakery items, Gopimanjureean and other roadside foods.",
    },
  },
  {
    category: "Health Care",
    subcategories: [
      "Dental",
      "Eye Care",
      "Health Insurance",
      "Medical / Pharmacy",
      "Prescription",
      "Nutrition",
      "Fertility Care",
    ],
  },
  {
    category: "Home office",
    subcategories: [
      "Computer",
      "Gadgets",
      "Stationary",
      "Office Furniture",
      "Office Supply",
      "Electronics",
      "AI tool subscription",
      "E-learnings",
    ],
  },
  { category: "Households", subcategories: ["Appliance", "Consumables", "Maintenance", "Rent", "Gas Cylinder"] },
  { category: "Insurance", subcategories: ["Car", "Health", "Home", "Life", "Bike", "Term"] },
  { category: "Loans", subcategories: ["Marriage"] },
  { category: "Personal and Family Care", subcategories: ["Clothing", "Donation", "Gift", "Child Care"] },
  { category: "Travel", subcategories: ["Airplane", "Car Rental", "Bus", "Train", "Ship", "Auto", "Bike Taxi"] },
  { category: "Utilities and Bills", subcategories: ["Garbage", "Internet", "Telephone", "Water", "Electricity"] },
  { category: "Credit Card Bills", subcategories: ["ICICI Credit Card", "HDFC Credit Card", "AXIS Credit Card"] },
  { category: "Savings", subcategories: ["Mutual Fund", "Chitfund", "lIC & Post office", "RD & FD", "Gold Savings"] },
  { category: FALLBACK.category, subcategories: [FALLBACK.subcategory] },
];

export const DEFAULT_PAYMENT_METHODS = ["Cash", "UPI", "Credit Card", "Debit Card", "Net banking"];

// "Other"/"Others" subcategories are listed last in dropdowns, as in the web app.
export function isOthersLike(name: string): boolean {
  return /^others?$/i.test(name.trim());
}

export function sortOthersLast(subcategories: string[]): string[] {
  return [...subcategories.filter((s) => !isOthersLike(s)), ...subcategories.filter(isOthersLike)];
}
