import { BACKUP_FORMAT, BACKUP_VERSION, type Backup, type BackupTransaction } from "../domain/backup";
import { getDb } from "./database";

interface TransactionRow {
  id: string;
  dedupe_key: string | null;
  source: "import" | "manual";
  status: "ACTIVE" | "DELETED";
  txn_date: string;
  direction: "debit" | "credit";
  amount_paise: number;
  balance_paise: number | null;
  category: string;
  subcategory: string;
  payee: string | null;
  payment_method: string | null;
  description: string | null;
  narration: string | null;
  vpa: string | null;
  note: string | null;
  payee_bank: string | null;
  upi_ref: string | null;
  classified_by: string;
  created_at: string;
  updated_at: string;
}

function toBackupTransaction(r: TransactionRow): BackupTransaction {
  return {
    id: r.id,
    dedupeKey: r.dedupe_key,
    source: r.source,
    status: r.status,
    txnDate: r.txn_date,
    direction: r.direction,
    amountPaise: r.amount_paise,
    balancePaise: r.balance_paise,
    category: r.category,
    subcategory: r.subcategory,
    payee: r.payee,
    paymentMethod: r.payment_method,
    description: r.description,
    narration: r.narration,
    vpa: r.vpa,
    note: r.note,
    payeeBank: r.payee_bank,
    upiRef: r.upi_ref,
    classifiedBy: r.classified_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// Everything, including soft-deleted rows, so a restore keeps deleted bank rows
// from coming back on the next statement import.
export async function exportBackup(): Promise<Backup> {
  const db = await getDb();
  const [categories, methods, transactions] = await Promise.all([
    db.getAllAsync<{ category: string; subcategory: string }>("SELECT category, subcategory FROM categories ORDER BY sort, id"),
    db.getAllAsync<{ name: string }>("SELECT name FROM payment_methods ORDER BY sort"),
    db.getAllAsync<TransactionRow>("SELECT * FROM transactions ORDER BY txn_date, created_at, rowid"),
  ]);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    categories,
    paymentMethods: methods.map((m) => m.name),
    transactions: transactions.map(toBackupTransaction),
  };
}

export interface RestoreSummary {
  transactionsAdded: number;
  transactionsAlreadyPresent: number;
  categoriesAdded: number;
  paymentMethodsAdded: number;
  skipped: number;
}

// A merge, never an overwrite: anything already on this phone (same id or same bank key)
// is left exactly as it is, and only what is missing is added.
export async function restoreBackup(backup: Backup, skipped: number): Promise<RestoreSummary> {
  const db = await getDb();
  const summary: RestoreSummary = {
    transactionsAdded: 0,
    transactionsAlreadyPresent: 0,
    categoriesAdded: 0,
    paymentMethodsAdded: 0,
    skipped,
  };

  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const c of backup.categories) {
      const r = await txn.runAsync(
        `INSERT OR IGNORE INTO categories (category, subcategory, sort)
         VALUES (?, ?, (SELECT COALESCE(MAX(sort), 0) + 1 FROM categories))`,
        [c.category, c.subcategory],
      );
      summary.categoriesAdded += r.changes;
    }

    for (const name of backup.paymentMethods) {
      const r = await txn.runAsync(
        "INSERT OR IGNORE INTO payment_methods (name, sort) VALUES (?, (SELECT COALESCE(MAX(sort), 0) + 1 FROM payment_methods))",
        [name],
      );
      summary.paymentMethodsAdded += r.changes;
    }

    for (const t of backup.transactions) {
      const r = await txn.runAsync(
        `INSERT OR IGNORE INTO transactions
           (id, dedupe_key, source, status, txn_date, direction, amount_paise, balance_paise, category, subcategory,
            payee, payment_method, description, narration, vpa, note, payee_bank, upi_ref, classified_by,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                 COALESCE(?, datetime('now')), COALESCE(?, datetime('now')))`,
        [
          t.id,
          t.dedupeKey,
          t.source,
          t.status,
          t.txnDate,
          t.direction,
          t.amountPaise,
          t.balancePaise,
          t.category,
          t.subcategory,
          t.payee,
          t.paymentMethod,
          t.description,
          t.narration,
          t.vpa,
          t.note,
          t.payeeBank,
          t.upiRef,
          t.classifiedBy,
          t.createdAt,
          t.updatedAt,
        ],
      );
      if (r.changes > 0) summary.transactionsAdded++;
      else summary.transactionsAlreadyPresent++;
    }
  });

  return summary;
}
