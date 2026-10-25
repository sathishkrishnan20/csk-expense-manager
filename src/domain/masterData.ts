export interface CategoryDef {
  category: string;
  subcategories: string[];
}

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

// Used when a credit does not fit any Income subcategory.
export const INCOME_FALLBACK: Classification = { category: INCOME_CATEGORY, subcategory: "Others" };

export function isProtectedSubcategory(category: string, subcategory: string): boolean {
  return category === FALLBACK.category && subcategory === FALLBACK.subcategory;
}

export function isProtectedCategory(category: string): boolean {
  return category === INCOME_CATEGORY || category === FALLBACK.category;
}

// Seeded on first run. Copied from the web Expense Manager's live Config
// (spelling kept as-is so existing history lines up). Edit them in the app's Config.
export const DEFAULT_CATEGORIES: CategoryDef[] = [
  {
    category: "Income",
    subcategories: [
      "Salary",
      "Equities",
      "Personal Savings",
      "Rents and Royalties",
      "Home Equity",
      "Part-time work",
      "Pensions",
      "Annuities",
      "Social Securities",
      "Account Transfer",
      "Others",
    ],
  },
  { category: "Entertainment", subcategories: ["Concert", "Party", "Sports", "Others"] },
  { category: "Family", subcategories: ["Child Care", "Child Education", "Toy", "Others", "Dinesh"] },
  { category: "Automobile", subcategories: ["Fuel", "Insurance", "Registration", "Road Tax", "Others"] },
  { category: "Food", subcategories: ["Restaurant", "Groceries", "Snacks", "Others", "Fruits"] },
  {
    category: "Health Care",
    subcategories: [
      "Dental",
      "Eye Care",
      "Health Insurance",
      "Medical",
      "Prescription",
      "Nutrition",
      "Fertility Care",
      "Other",
    ],
  },
  {
    category: "Home Office",
    subcategories: ["Computer", "Electronics", "Stationary", "Office Furniture", "Office Supply", "Other"],
  },
  {
    category: "Household",
    subcategories: [
      "Appliance",
      "Consumables",
      "HomeMaintenance",
      "Homeowner Fees",
      "Homeshold Tools",
      "Miscellaneous Household Items",
      "Postager",
      "Rent",
      "Other",
      "Home loan repayment",
    ],
  },
  { category: "Insurance", subcategories: ["Auto", "Health", "Home", "Life", "Other"] },
  { category: "Loans", subcategories: ["Auto", "Home Equity", "Mortgage", "Student", "Other", "Marriage"] },
  { category: "Personal", subcategories: ["Clothing", "Donation", "Gift", "Personal Care", "Other"] },
  { category: "Tax", subcategories: ["Propery Tax", "Other"] },
  { category: "Travel", subcategories: ["Airplane", "Car Rental", "Taxi", "Bus", "Train", "Ship", "Other"] },
  {
    category: "Utilities",
    subcategories: ["Cable TV", "Garbage", "Electric", "Gas", "Internet", "Telephone", "Water", "Other"],
  },
  {
    category: "Payment",
    subcategories: ["ICICI Credit Card", "HDFC Credit Card", "AXIS Credit Card", "Iphone Mobile EMI"],
  },
  { category: "Savings", subcategories: ["Mutual Fund", "Insurance", "Chitfund", "lIC & Post office"] },
  { category: "Car", subcategories: ["Fuel", "General Service", "Accessories", "Car Damage Repair"] },
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
