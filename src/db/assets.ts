import { normaliseAsset, type AssetFields, type AssetType, type AssetUnit } from "../domain/assets";
import { canonicalAssetOption } from "./assetOptions";
import { getDb, inTransaction } from "./database";

// Assets are information only: nothing here reads or writes transactions, groups or balances (see domain/assets.ts).

export interface AssetRecord extends AssetFields {
  id: string;
  giftId: string | null; // the gift it was added from, if any
  createdAt: string;
}

interface AssetRow {
  id: string;
  type: AssetType;
  name: string;
  for_name: string | null;
  item: string | null;
  exchange_id: string | null;
  status: "ACTIVE" | "SOLD";
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
  created_at: string;
}

const toRecord = (r: AssetRow): AssetRecord => ({
  id: r.id,
  type: r.type,
  name: r.name,
  forName: r.for_name,
  item: r.item,
  exchangeId: r.exchange_id,
  status: r.status,
  quantity: r.quantity,
  unit: r.unit,
  purityK: r.purity_k,
  investedPaise: r.invested_paise,
  acquiredDate: r.acquired_date,
  description: r.description,
  giftId: r.gift_id,
  lender: r.lender,
  ticketNo: r.ticket_no,
  pledgedDate: r.pledged_date,
  dueDate: r.due_date,
  loanPaise: r.loan_paise,
  pledgeNote: r.pledge_note,
  createdAt: r.created_at,
});

const SELECT_ASSETS = `
  SELECT id, type, name, for_name, item, exchange_id, status, quantity, unit, purity_k, invested_paise, acquired_date, description, gift_id,
         lender, ticket_no, pledged_date, due_date, loan_paise, pledge_note, created_at
  FROM assets WHERE status != 'DELETED'`;

const newId = (): string => `as-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// Gold first, then land, funds and the rest; the newest first inside each kind.
export async function listAssets(): Promise<AssetRecord[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<AssetRow>(
    `${SELECT_ASSETS} ORDER BY CASE type WHEN 'gold' THEN 0 WHEN 'land' THEN 1 WHEN 'mutual_fund' THEN 2 ELSE 3 END, created_at DESC, rowid DESC`,
  );
  return rows.map(toRecord);
}

export async function getAsset(id: string): Promise<AssetRecord | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<AssetRow>(`${SELECT_ASSETS} AND id = ?`, [id]);
  return row ? toRecord(row) : null;
}

// The asset already made from this gift, if there is one.
export async function getAssetByGift(giftId: string): Promise<AssetRecord | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<AssetRow>(`${SELECT_ASSETS} AND gift_id = ? ORDER BY created_at, rowid LIMIT 1`, [giftId]);
  return row ? toRecord(row) : null;
}

// Adds an asset, or updates one when `id` is given. Returns its id. Adding with a `giftId` that already has an asset returns that
// asset and adds nothing, so a double tap or a second try cannot make a duplicate.
export async function saveAsset(input: AssetFields, id?: string, giftId?: string): Promise<string> {
  const db = await getDb();
  let savedId = id ?? "";
  await inTransaction(db, async (txn) => {
    // A For or Item that is not in the dropdown yet is added to it, in the list's own spelling when it is only a different capitalisation.
    const forName = await canonicalAssetOption(txn, "for", input.forName);
    const item = await canonicalAssetOption(txn, "item", input.item);
    const a = normaliseAsset({ ...input, forName, item });
    const values = [
    a.type,
    a.name,
    a.forName,
    a.item,
    a.exchangeId,
    a.status,
    a.quantity,
    a.unit,
    a.purityK,
    a.investedPaise,
    a.acquiredDate,
    a.description,
    a.lender,
    a.ticketNo,
    a.pledgedDate,
    a.dueDate,
    a.loanPaise,
    a.pledgeNote,
    ];
    if (id) {
      await txn.runAsync(
        `UPDATE assets SET type = ?, name = ?, for_name = ?, item = ?, exchange_id = ?, status = ?, quantity = ?, unit = ?, purity_k = ?, invested_paise = ?, acquired_date = ?,
                description = ?, lender = ?, ticket_no = ?, pledged_date = ?, due_date = ?, loan_paise = ?, pledge_note = ?,
                updated_at = datetime('now') WHERE id = ?`,
        [...values, id],
      );
      return;
    }
    if (giftId) {
      const existing = await txn.getFirstAsync<{ id: string }>("SELECT id FROM assets WHERE gift_id = ? AND status != 'DELETED' LIMIT 1", [giftId]);
      if (existing) {
        savedId = existing.id;
        return;
      }
    }
    savedId = newId();
    await txn.runAsync(
      `INSERT INTO assets (id, gift_id, type, name, for_name, item, exchange_id, status, quantity, unit, purity_k, invested_paise, acquired_date,
                           description, lender, ticket_no, pledged_date, due_date, loan_paise, pledge_note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [savedId, giftId ?? null, ...values],
    );
  });
  return savedId;
}

// Soft delete, like transactions and gifts.
export async function deleteAsset(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE assets SET status = 'DELETED', updated_at = datetime('now') WHERE id = ?", [id]);
}
