import type { SQLiteDatabase } from "expo-sqlite";
import { canonicalOption, fromSqlite, type AssetOptionKind } from "./assetSql";
import { getDb } from "./database";

// The owner's own lists behind the For and Item dropdowns of an asset (see domain/assets.ts). A name is added the first time it is used on a
// piece, so "+ Add new" in the dropdown needs nothing more than saving the piece.
export type { AssetOptionKind };

export async function listAssetOptions(kind: AssetOptionKind): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ name: string }>("SELECT name FROM asset_options WHERE kind = ? ORDER BY sort, name", [kind]);
  return rows.map((r) => r.name);
}

// The spelling the list already has for this name, or the name added as typed. Runs inside the caller's transaction.
export const canonicalAssetOption = (db: SQLiteDatabase, kind: AssetOptionKind, name: string | null): Promise<string | null> => canonicalOption(fromSqlite(db), kind, name);
