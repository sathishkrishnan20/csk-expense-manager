import { MAIN_GROUP_ID } from "../domain/groups";
import { startSuggestions } from "../import/suggestionStore";
import { getDb, inTransaction } from "./database";

// For development builds only (see ui/DevToolsSection.tsx): empties the transaction data so the app can be tried from a clean
// slate. Every transaction is removed for good (not marked deleted, so the same statement can be imported again) and so is every
// group except Main, which is built in, and every gift and occasion, and every asset. Categories, payment modes, settings and keys stay. Cannot be undone.
export async function clearAllTransactionData(): Promise<{ transactions: number; groups: number; gifts: number; assets: number }> {
  const db = await getDb();
  const result = { transactions: 0, groups: 0, gifts: 0, assets: 0 };
  await inTransaction(db, async (txn) => {
    result.transactions = (await txn.runAsync("DELETE FROM transactions")).changes;
    result.groups = (await txn.runAsync("DELETE FROM expense_groups WHERE id != ?", [MAIN_GROUP_ID])).changes;
    result.gifts = (await txn.runAsync("DELETE FROM gift_list")).changes;
    await txn.runAsync("DELETE FROM gift_occasions");
    result.assets = (await txn.runAsync("DELETE FROM assets")).changes;
    await txn.runAsync("UPDATE expense_groups SET parent_id = NULL, pinned = 0, status = 'ACTIVE' WHERE id = ?", [MAIN_GROUP_ID]);
  });
  startSuggestions(); // any waiting AI suggestions pointed at rows that are gone
  return result;
}
