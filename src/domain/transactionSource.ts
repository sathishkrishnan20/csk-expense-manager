// How a transaction first came into the app. It is written once, when the row is first inserted, and never changed afterwards: not by an
// edit, not when a statement later completes an SMS entry, and not when a backup is restored over a row that already exists (a restore
// only adds rows that are missing, so only a new row takes the Source of the file).
//
//   manual  - the owner added it by hand
//   import  - a bank statement import (PDF, Excel or CSV)
//   sms     - the automatic bank SMS route (import/smsCapture.ts)
export type TransactionSource = "manual" | "import" | "sms";

export const TRANSACTION_SOURCES: TransactionSource[] = ["manual", "import", "sms"];

export const isTransactionSource = (value: unknown): value is TransactionSource => TRANSACTION_SOURCES.includes(value as TransactionSource);

// The words shown on a row, in the entry and in the filter.
export const SOURCE_LABEL: Record<TransactionSource, string> = {
  manual: "Manual",
  import: "Statement",
  sms: "Bank SMS",
};

// The Source column of a backup file: "Import", "Manual" or "Sms" (the stored value, capitalised). Anything else, or a file from before
// the column had this value, is read as manual.
export function parseSourceText(text: string): TransactionSource {
  const t = text.trim().toLowerCase();
  return t === "import" || t === "sms" ? t : "manual";
}

// The sentence in an entry: how it came in.
export const ADDED_PHRASE: Record<TransactionSource, string> = {
  manual: "Added by hand",
  import: "Imported from a bank statement",
  sms: "Added automatically from a bank SMS",
};

// created_at is SQLite's "yyyy-mm-dd hh:mm:ss" in UTC (a restored file may carry an ISO time). Null when it is not a time.
export function parseCreatedAt(text: string | null | undefined): Date | null {
  if (!text) return null;
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text) ? `${text.replace(" ", "T")}Z` : text;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}
