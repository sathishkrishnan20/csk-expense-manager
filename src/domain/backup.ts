// The export/import file: a CSV that opens in Excel, with everything stored on the device.
// The AI API key is deliberately not part of it.
//
// Layout (one header row, then one row per line of data, blocks side by side):
//   [ transactions ... ] 5 empty columns [ Category List | Subcategory List ] 5 empty columns [ Payment Mode List ]
// Columns are found by their header names, so reordering them in Excel does not matter.
// Files from the first version of the app were JSON; those are still read.

import Papa from "papaparse";
import { parseAmountPaise, parseDate } from "./statementParser";
import { PENDING_AI, fallbackFor } from "./taxonomy";

export const BACKUP_FORMAT = "expense-manager-backup";
export const BACKUP_VERSION = 1;

export interface BackupTransaction {
  id: string;
  dedupeKey: string | null;
  source: "import" | "manual";
  status: "ACTIVE" | "DELETED";
  txnDate: string;
  direction: "debit" | "credit";
  amountPaise: number;
  balancePaise: number | null;
  category: string;
  subcategory: string;
  payee: string | null;
  paymentMethod: string | null;
  description: string | null;
  narration: string | null;
  vpa: string | null;
  note: string | null;
  payeeBank: string | null;
  upiRef: string | null;
  classifiedBy: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  categories: { category: string; subcategory: string }[];
  paymentMethods: string[];
  transactions: BackupTransaction[];
}

export class BackupError extends Error {}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const optionalString = (v: unknown): string | null | undefined =>
  v === undefined || v === null ? null : typeof v === "string" ? v : undefined; // undefined = invalid

function readTransaction(raw: unknown): BackupTransaction | null {
  if (!isObject(raw)) return null;
  const t = raw;

  if (!nonEmpty(t.id) || !nonEmpty(t.category) || !nonEmpty(t.subcategory) || !nonEmpty(t.classifiedBy)) return null;
  if (t.source !== "import" && t.source !== "manual") return null;
  if (t.status !== "ACTIVE" && t.status !== "DELETED") return null;
  if (t.direction !== "debit" && t.direction !== "credit") return null;
  if (typeof t.txnDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(t.txnDate)) return null;
  if (typeof t.amountPaise !== "number" || !Number.isSafeInteger(t.amountPaise) || t.amountPaise <= 0) return null;
  if (t.balancePaise != null && (typeof t.balancePaise !== "number" || !Number.isSafeInteger(t.balancePaise))) return null;

  const strings = {
    dedupeKey: optionalString(t.dedupeKey),
    payee: optionalString(t.payee),
    paymentMethod: optionalString(t.paymentMethod),
    description: optionalString(t.description),
    narration: optionalString(t.narration),
    vpa: optionalString(t.vpa),
    note: optionalString(t.note),
    payeeBank: optionalString(t.payeeBank),
    upiRef: optionalString(t.upiRef),
    createdAt: optionalString(t.createdAt),
    updatedAt: optionalString(t.updatedAt),
  };
  if (Object.values(strings).some((v) => v === undefined)) return null;

  return {
    id: t.id,
    source: t.source,
    status: t.status,
    txnDate: t.txnDate,
    direction: t.direction,
    amountPaise: t.amountPaise,
    balancePaise: (t.balancePaise as number | null | undefined) ?? null,
    category: t.category,
    subcategory: t.subcategory,
    classifiedBy: t.classifiedBy,
    ...(strings as Record<keyof typeof strings, string | null>),
  };
}

export interface ParsedBackup {
  backup: Backup;
  skipped: number;
}

// Reads a backup file (CSV, or the JSON of the first version). A wrong file or a newer
// format is an error; individual bad rows are skipped and counted so one damaged line
// does not block a restore.
export function parseBackup(text: string): ParsedBackup {
  const body = text.replace(/^\uFEFF/, "");
  return body.trimStart().startsWith("{") ? parseJsonBackup(body) : parseCsvBackup(body);
}

function parseJsonBackup(text: string): ParsedBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError("This is not a valid backup file (it is not JSON).");
  }
  if (!isObject(raw) || raw.format !== BACKUP_FORMAT) {
    throw new BackupError("This is not an Expense Manager backup file.");
  }
  if (typeof raw.version !== "number" || raw.version > BACKUP_VERSION) {
    throw new BackupError("This backup was made by a newer version of the app. Update the app and try again.");
  }
  if (!Array.isArray(raw.transactions) || !Array.isArray(raw.categories) || !Array.isArray(raw.paymentMethods)) {
    throw new BackupError("The backup file is incomplete.");
  }

  let skipped = 0;
  const transactions: BackupTransaction[] = [];
  for (const item of raw.transactions) {
    const t = readTransaction(item);
    if (t) transactions.push(t);
    else skipped++;
  }

  const categories: Backup["categories"] = [];
  for (const item of raw.categories) {
    if (isObject(item) && nonEmpty(item.category) && nonEmpty(item.subcategory)) {
      categories.push({ category: item.category, subcategory: item.subcategory });
    } else skipped++;
  }

  const paymentMethods: string[] = [];
  for (const item of raw.paymentMethods) {
    if (nonEmpty(item)) paymentMethods.push(item);
    else skipped++;
  }

  return {
    backup: {
      format: BACKUP_FORMAT,
      version: raw.version,
      exportedAt: typeof raw.exportedAt === "string" ? raw.exportedAt : "",
      categories,
      paymentMethods,
      transactions,
    },
    skipped,
  };
}

export function backupFileName(now: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `expense-manager-backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.csv`;
}

// ---------------------------------------------------------------------------------------------
// CSV

const GAP_COLUMNS = 5;
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-10-23" -> "23-Oct-2026". The month name keeps the date unambiguous (day first or
// month first) whichever way Excel or the reader's regional settings show it.
function csvDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}-${MONTH_NAMES[Number(m) - 1] ?? m}-${y}`;
}

const rupees = (paise: number): string => (paise / 100).toFixed(2);

// Excel runs a cell that starts with = + - @ as a formula, and bank text is arbitrary, so
// text cells that start that way get a leading ' (removed again on import).
const FORMULA_START = /^[=+\-@\t\r]/;
const guard = (v: string | null): string => (v === null ? "" : FORMULA_START.test(v) ? `'${v}` : v);
const unguard = (v: string): string => (/^'[=+\-@\t\r]/.test(v) ? v.slice(1) : v);

const cap = (v: string): string => v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();

interface Column {
  header: string;
  write: (t: BackupTransaction) => string;
}

// Readable columns first, bank details and technical ones (needed to restore exactly) last.
const COLUMNS: Column[] = [
  { header: "Date", write: (t) => csvDate(t.txnDate) },
  { header: "Type", write: (t) => cap(t.direction) },
  { header: "Amount", write: (t) => rupees(t.amountPaise) },
  { header: "Category", write: (t) => guard(t.category) },
  { header: "Subcategory", write: (t) => guard(t.subcategory) },
  { header: "Payee", write: (t) => guard(t.payee) },
  { header: "Payment Method", write: (t) => guard(t.paymentMethod) },
  { header: "Description", write: (t) => guard(t.description) },
  { header: "Balance", write: (t) => (t.balancePaise === null ? "" : rupees(t.balancePaise)) },
  { header: "Status", write: (t) => cap(t.status) },
  { header: "Classified By", write: (t) => guard(t.classifiedBy) },
  { header: "Source", write: (t) => cap(t.source) },
  { header: "UPI Id", write: (t) => guard(t.vpa) },
  { header: "Note", write: (t) => guard(t.note) },
  { header: "Payee Bank", write: (t) => guard(t.payeeBank) },
  { header: "Bank Narration", write: (t) => guard(t.narration) },
  { header: "Id", write: (t) => guard(t.id) },
  { header: "Bank Key", write: (t) => guard(t.dedupeKey) },
  { header: "Created", write: (t) => t.createdAt ?? "" },
  { header: "Updated", write: (t) => t.updatedAt ?? "" },
];

const CATEGORY_LIST = "Category List";
const SUBCATEGORY_LIST = "Subcategory List";
const PAYMENT_LIST = "Payment Mode List";

export function serializeBackup(backup: Backup): string {
  const blanks = (n: number) => Array<string>(n).fill("");
  const header = [
    ...COLUMNS.map((c) => c.header),
    ...blanks(GAP_COLUMNS),
    CATEGORY_LIST,
    SUBCATEGORY_LIST,
    ...blanks(GAP_COLUMNS),
    PAYMENT_LIST,
  ];

  const count = Math.max(backup.transactions.length, backup.categories.length, backup.paymentMethods.length);
  const rows: string[][] = [header];
  for (let i = 0; i < count; i++) {
    const t = backup.transactions[i];
    const c = backup.categories[i];
    rows.push([
      ...(t ? COLUMNS.map((col) => col.write(t)) : blanks(COLUMNS.length)),
      ...blanks(GAP_COLUMNS),
      c ? guard(c.category) : "",
      c ? guard(c.subcategory) : "",
      ...blanks(GAP_COLUMNS),
      guard(backup.paymentMethods[i] ?? null),
    ]);
  }
  // The BOM makes Excel read the file as UTF-8 (names and notes in other scripts).
  return "\uFEFF" + Papa.unparse(rows, { newline: "\r\n" });
}

// Rows typed into Excel have no Id, so one is made from the row's content. The same row in the
// same file always gets the same Id, which keeps importing the file twice harmless.
function contentId(parts: (string | number)[], seen: Map<string, number>): string {
  const text = parts.join("|");
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const base = h.toString(16).padStart(8, "0");
  const n = seen.get(base) ?? 0;
  seen.set(base, n + 1);
  return `x-${base}-${n}`;
}

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?/;

function parseCsvBackup(text: string): ParsedBackup {
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: "greedy", delimitersToGuess: [",", ";", "\t"] });
  const rows = parsed.data;
  if (rows.length === 0) throw new BackupError("The file is empty.");

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const at = (name: string) => header.indexOf(name.toLowerCase());
  const required = ["Date", "Type", "Amount", "Category", "Subcategory"];
  if (required.some((name) => at(name) < 0)) {
    throw new BackupError("This is not an Expense Manager backup file (its Date, Type, Amount, Category and Subcategory columns were not found).");
  }

  const idx = Object.fromEntries(COLUMNS.map((c) => [c.header, at(c.header)])) as Record<string, number>;
  const categoryList = at(CATEGORY_LIST);
  const subcategoryList = at(SUBCATEGORY_LIST);
  const paymentList = at(PAYMENT_LIST);
  const cell = (row: string[], i: number) => (i < 0 ? "" : unguard((row[i] ?? "").trim()));

  let skipped = 0;
  const transactions: BackupTransaction[] = [];
  const categories: Backup["categories"] = [];
  const paymentMethods: string[] = [];
  const seen = new Map<string, number>();

  for (const row of rows.slice(1)) {
    const values = COLUMNS.map((c) => cell(row, idx[c.header]));
    if (values.some((v) => v !== "")) {
      const t = readCsvTransaction((name) => cell(row, idx[name]), seen);
      if (t) transactions.push(t);
      else skipped++;
    }

    const cat = cell(row, categoryList);
    const sub = cell(row, subcategoryList);
    if (cat && sub) categories.push({ category: cat, subcategory: sub });
    else if (cat || sub) skipped++;

    const method = cell(row, paymentList);
    if (method) paymentMethods.push(method);
  }

  return {
    backup: { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: "", categories, paymentMethods, transactions },
    skipped,
  };
}

function readCsvTransaction(get: (column: string) => string, seen: Map<string, number>): BackupTransaction | null {
  const txnDate = parseDate(get("Date"));
  if (!txnDate) return null;

  const type = get("Type").toLowerCase();
  const direction = /^(debit|expense|dr|d)$/.test(type) ? "debit" : /^(credit|income|cr|c)$/.test(type) ? "credit" : null;
  if (!direction) return null;

  const amountPaise = parseAmountPaise(get("Amount"));
  if (amountPaise === null || amountPaise <= 0) return null;

  const balanceText = get("Balance");
  const balancePaise = balanceText === "" ? null : parseAmountPaise(balanceText);
  if (balanceText !== "" && balancePaise === null) return null;

  // Both blank means "categorise later": the AI fills it in on the next Re-classify.
  let category = get("Category");
  let subcategory = get("Subcategory");
  if (!category !== !subcategory) return null;
  const pending = !category;
  if (pending) ({ category, subcategory } = fallbackFor(direction));

  const orNull = (v: string) => (v === "" ? null : v);
  const payee = orNull(get("Payee"));
  const paymentMethod = orNull(get("Payment Method"));
  const description = orNull(get("Description"));
  const dedupeKey = orNull(get("Bank Key"));
  const created = get("Created");
  const updated = get("Updated");

  const id =
    get("Id") ||
    contentId([txnDate, direction, amountPaise, payee ?? "", paymentMethod ?? "", description ?? "", category, subcategory], seen);

  return {
    id,
    dedupeKey,
    source: /^import$/i.test(get("Source")) ? "import" : "manual",
    status: /^deleted$/i.test(get("Status")) ? "DELETED" : "ACTIVE",
    txnDate,
    direction,
    amountPaise,
    balancePaise,
    category,
    subcategory,
    payee,
    paymentMethod,
    description,
    narration: orNull(get("Bank Narration")),
    vpa: orNull(get("UPI Id")),
    note: orNull(get("Note")),
    payeeBank: orNull(get("Payee Bank")),
    upiRef: dedupeKey?.match(/^upi:(\d{12}):/)?.[1] ?? null,
    classifiedBy: pending ? PENDING_AI : get("Classified By") || "manual",
    createdAt: TIMESTAMP.test(created) ? created : null,
    updatedAt: TIMESTAMP.test(updated) ? updated : null,
  };
}
