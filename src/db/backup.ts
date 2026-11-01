import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  type Backup,
  type BackupAsset,
  type BackupCategory,
  type BackupGift,
  type BackupGiftOccasion,
  type BackupGroup,
  type BackupTransaction,
} from "../domain/backup";
import type { AssetStatus, AssetType, AssetUnit } from "../domain/assets";
import type { GiftDirection, GiftType, GiftUnit } from "../domain/gifts";
import { MAIN_GROUP_ID } from "../domain/groups";
import { cleanDescription } from "../domain/masterData";
import { getDb, inTransaction } from "./database";

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
  group_id: string;
  created_group_id: string | null;
  created_at: string;
  updated_at: string;
}

interface GroupRow {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  status: "ACTIVE" | "CLOSED" | "DELETED";
  parent_id: string | null;
  pinned: number;
  held_paise: number;
}

interface GiftOccasionRow {
  id: string;
  title: string;
  occasion_date: string;
  status: "ACTIVE" | "DELETED";
  created_at: string;
  updated_at: string;
}

interface GiftBackupRow {
  id: string;
  occasion_id: string;
  name: string;
  direction: GiftDirection;
  type: GiftType;
  value: number | null;
  unit: GiftUnit;
  rate_paise: number | null;
  note: string | null;
  status: "ACTIVE" | "DELETED";
  created_at: string;
  updated_at: string;
}

interface AssetBackupRow {
  id: string;
  type: AssetType;
  name: string;
  quantity: number | null;
  unit: AssetUnit | null;
  purity_k: number | null;
  invested_paise: number | null;
  acquired_date: string | null;
  description: string | null;
  gift_id: string | null;
  lender: string | null;
  ticket_no: string | null;
  pledged_date: string | null;
  due_date: string | null;
  loan_paise: number | null;
  pledge_note: string | null;
  status: AssetStatus;
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
    groupId: r.group_id,
    createdGroupId: r.created_group_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// Everything, including soft-deleted rows, so a restore keeps deleted bank rows
// from coming back on the next statement import.
export async function exportBackup(): Promise<Backup> {
  const db = await getDb();
  const [categories, methods, transactions, groups, giftOccasions, gifts, assets] = await Promise.all([
    db.getAllAsync<{ category: string; subcategory: string; description: string | null }>(
      "SELECT category, subcategory, description FROM categories ORDER BY sort, id",
    ),
    db.getAllAsync<{ name: string }>("SELECT name FROM payment_methods ORDER BY sort"),
    db.getAllAsync<TransactionRow>("SELECT * FROM transactions ORDER BY txn_date, created_at, rowid"),
    db.getAllAsync<GroupRow>("SELECT id, name, start_date, end_date, status, parent_id, pinned, held_paise FROM expense_groups ORDER BY created_at, rowid"),
    db.getAllAsync<GiftOccasionRow>("SELECT id, title, occasion_date, status, created_at, updated_at FROM gift_occasions ORDER BY created_at, rowid"),
    db.getAllAsync<GiftBackupRow>(
      "SELECT id, occasion_id, name, direction, type, value, unit, rate_paise, note, status, created_at, updated_at FROM gift_list ORDER BY created_at, rowid",
    ),
    db.getAllAsync<AssetBackupRow>(
      `SELECT id, type, name, quantity, unit, purity_k, invested_paise, acquired_date, description, gift_id, lender, ticket_no,
              pledged_date, due_date, loan_paise, pledge_note, status, created_at, updated_at
       FROM assets ORDER BY created_at, rowid`,
    ),
  ]);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    categories: categories.map(
      (c): BackupCategory => ({
        category: c.category,
        subcategory: c.subcategory,
        ...(cleanDescription(c.description ?? "") ? { description: cleanDescription(c.description ?? "") } : {}),
      }),
    ),
    paymentMethods: methods.map((m) => m.name),
    groups: groups.map(
      (g): BackupGroup => ({
        id: g.id,
        name: g.name,
        startDate: g.start_date,
        endDate: g.end_date,
        status: g.status,
        parentId: g.parent_id,
        pinned: g.pinned === 1,
        heldPaise: g.held_paise,
      }),
    ),
    giftOccasions: giftOccasions.map(
      (o): BackupGiftOccasion => ({
        id: o.id,
        title: o.title,
        occasionDate: o.occasion_date,
        status: o.status,
        createdAt: o.created_at,
        updatedAt: o.updated_at,
      }),
    ),
    gifts: gifts.map(
      (g): BackupGift => ({
        id: g.id,
        occasionId: g.occasion_id,
        name: g.name,
        direction: g.direction,
        type: g.type,
        value: g.value,
        unit: g.unit,
        ratePaise: g.rate_paise,
        note: g.note,
        status: g.status,
        createdAt: g.created_at,
        updatedAt: g.updated_at,
      }),
    ),
    assets: assets.map(
      (a): BackupAsset => ({
        id: a.id,
        type: a.type,
        name: a.name,
        status: a.status,
        quantity: a.quantity,
        unit: a.unit,
        purityK: a.purity_k,
        investedPaise: a.invested_paise,
        acquiredDate: a.acquired_date,
        description: a.description,
        giftId: a.gift_id,
        lender: a.lender,
        ticketNo: a.ticket_no,
        pledgedDate: a.pledged_date,
        dueDate: a.due_date,
        loanPaise: a.loan_paise,
        pledgeNote: a.pledge_note,
        createdAt: a.created_at,
        updatedAt: a.updated_at,
      }),
    ),
    transactions: transactions.map(toBackupTransaction),
  };
}

export interface RestoreSummary {
  transactionsAdded: number;
  transactionsAlreadyPresent: number;
  categoriesAdded: number;
  paymentMethodsAdded: number;
  groupsAdded: number;
  giftsAdded: number;
  assetsAdded: number;
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
    groupsAdded: 0,
    giftsAdded: 0,
    assetsAdded: 0,
    skipped,
  };

  await inTransaction(db, async (txn) => {
    for (const c of backup.categories) {
      const r = await txn.runAsync(
        `INSERT OR IGNORE INTO categories (category, subcategory, sort, description)
         VALUES (?, ?, (SELECT COALESCE(MAX(sort), 0) + 1 FROM categories), ?)`,
        [c.category, c.subcategory, c.description ?? null],
      );
      summary.categoriesAdded += r.changes;
      // A subcategory that is already here keeps its own description; only an empty one is filled in.
      if (r.changes === 0 && c.description) {
        await txn.runAsync(
          "UPDATE categories SET description = ? WHERE category = ? AND subcategory = ? AND (description IS NULL OR description = '')",
          [c.description, c.category, c.subcategory],
        );
      }
    }

    for (const name of backup.paymentMethods) {
      const r = await txn.runAsync(
        "INSERT OR IGNORE INTO payment_methods (name, sort) VALUES (?, (SELECT COALESCE(MAX(sort), 0) + 1 FROM payment_methods))",
        [name],
      );
      summary.paymentMethodsAdded += r.changes;
    }

    // Groups first, so the transactions that belong to them have somewhere to go. Existing groups are left as they are.
    for (const g of backup.groups) {
      const r = await txn.runAsync(
        "INSERT OR IGNORE INTO expense_groups (id, name, start_date, end_date, status, parent_id, pinned, held_paise) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [g.id, g.name, g.startDate, g.endDate, g.status, g.id === MAIN_GROUP_ID ? null : g.parentId, g.pinned ? 1 : 0, g.heldPaise],
      );
      summary.groupsAdded += r.changes;
    }
    // A group whose parent is in neither the file nor this phone is kept separate, so nothing hangs under a group that is not there.
    await txn.runAsync("UPDATE expense_groups SET parent_id = NULL WHERE parent_id IS NOT NULL AND parent_id NOT IN (SELECT id FROM expense_groups)");
    const known = new Set((await txn.getAllAsync<{ id: string }>("SELECT id FROM expense_groups")).map((g) => g.id));

    // Gifts: occasions first, then the gifts in them. A gift whose occasion is in neither the file nor this phone is skipped.
    for (const o of backup.giftOccasions) {
      await txn.runAsync(
        `INSERT OR IGNORE INTO gift_occasions (id, title, occasion_date, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')))`,
        [o.id, o.title, o.occasionDate, o.status, o.createdAt, o.updatedAt],
      );
    }
    const occasionIds = new Set((await txn.getAllAsync<{ id: string }>("SELECT id FROM gift_occasions")).map((o) => o.id));
    for (const g of backup.gifts) {
      if (!occasionIds.has(g.occasionId)) {
        summary.skipped++;
        continue;
      }
      const r = await txn.runAsync(
        `INSERT OR IGNORE INTO gift_list
           (id, occasion_id, name, direction, type, value, unit, rate_paise, note, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')))`,
        [g.id, g.occasionId, g.name, g.direction, g.type, g.value, g.unit, g.ratePaise, g.note, g.status, g.createdAt, g.updatedAt],
      );
      summary.giftsAdded += r.changes;
    }

    // Assets stand alone (gift_id is only a note of where one came from), so each is added unless its id is already here.
    for (const a of backup.assets) {
      const r = await txn.runAsync(
        `INSERT OR IGNORE INTO assets
           (id, type, name, status, quantity, unit, purity_k, invested_paise, acquired_date, description, gift_id, lender,
            ticket_no, pledged_date, due_date, loan_paise, pledge_note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')))`,
        [
          a.id,
          a.type,
          a.name,
          a.status,
          a.quantity,
          a.unit,
          a.purityK,
          a.investedPaise,
          a.acquiredDate,
          a.description,
          a.giftId,
          a.lender,
          a.ticketNo,
          a.pledgedDate,
          a.dueDate,
          a.loanPaise,
          a.pledgeNote,
          a.createdAt,
          a.updatedAt,
        ],
      );
      summary.assetsAdded += r.changes;
    }

    for (const t of backup.transactions) {
      const r = await txn.runAsync(
        `INSERT OR IGNORE INTO transactions
           (id, dedupe_key, source, status, txn_date, direction, amount_paise, balance_paise, category, subcategory,
            payee, payment_method, description, narration, vpa, note, payee_bank, upi_ref, classified_by, group_id,
            created_group_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
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
          known.has(t.groupId) ? t.groupId : MAIN_GROUP_ID, // a group missing from the file falls back to Main
          t.createdGroupId && known.has(t.createdGroupId) ? t.createdGroupId : null,
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
