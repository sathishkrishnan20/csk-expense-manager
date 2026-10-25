// The export/import file: one JSON document with everything stored on the phone.
// The AI API key is deliberately not part of it.

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

// Reads a backup file. A wrong file or a newer format is an error; individual bad
// rows are skipped and counted so one damaged line does not block a restore.
export function parseBackup(text: string): { backup: Backup; skipped: number } {
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
  return `expense-manager-backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
}
