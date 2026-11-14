import { MAIN_GROUP_ID } from "../domain/groups";
import { startSuggestions } from "../import/suggestionStore";
import { plainStorage } from "../platform/secureStorage";
import { saveHomeGroupId } from "../settings/homeGroup";
import { getDb, inTransaction } from "./database";

// For development builds only (see ui/DevToolsSection.tsx): empties the transaction data so the app can be tried from a clean
// slate. Every transaction is removed for good (not marked deleted, so the same statement can be imported again) and so is every
// group except Main, which is built in, and every gift and occasion, every asset, all Savings figures (and the purchases waiting for a CAS), and the monthly template with its set-up records. Home goes back to Main. Categories, payment modes, settings and keys stay. Cannot be undone.
export async function clearAllTransactionData(): Promise<{ transactions: number; groups: number; gifts: number; assets: number }> {
  const db = await getDb();
  const result = { transactions: 0, groups: 0, gifts: 0, assets: 0 };
  await inTransaction(db, async (txn) => {
    result.transactions = (await txn.runAsync("DELETE FROM transactions")).changes;
    result.groups = (await txn.runAsync("DELETE FROM expense_groups WHERE id != ?", [MAIN_GROUP_ID])).changes;
    result.gifts = (await txn.runAsync("DELETE FROM gift_list")).changes;
    await txn.runAsync("DELETE FROM gift_occasions");
    result.assets = (await txn.runAsync("DELETE FROM assets")).changes;
    // The For and Item lists and the exchanges with a shop belong to the assets, so they go with them.
    await txn.runAsync("DELETE FROM asset_exchanges");
    await txn.runAsync("DELETE FROM asset_options");
    // Savings (months, PF and NPS accounts, and the units of each fund) come from imported statements, which can be imported again.
    await txn.runAsync("DELETE FROM savings_months");
    await txn.runAsync("DELETE FROM savings_accounts");
    await txn.runAsync("DELETE FROM savings_holdings");
    await txn.runAsync("DELETE FROM savings_purchases");
    // The monthly template (its groups, their entries and which months were set up) is configuration for the groups just removed, so it goes too.
    await txn.runAsync("DELETE FROM month_template_lines");
    await txn.runAsync("DELETE FROM month_template_groups");
    await txn.runAsync("DELETE FROM month_setups");
    await txn.runAsync("UPDATE expense_groups SET parent_id = NULL, pinned = 0, status = 'ACTIVE' WHERE id = ?", [MAIN_GROUP_ID]);
  });
  // Home pointed at a group that is gone, and "Not now" for a month's set-up referred to a template that is gone.
  await saveHomeGroupId(MAIN_GROUP_ID);
  await plainStorage.remove("template_setup_dismissed");
  startSuggestions(); // any waiting AI suggestions pointed at rows that are gone
  return result;
}
