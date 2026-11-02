import { MAIN_GROUP_ID } from "../domain/groups";
import { loadSmsGroupId } from "../settings/smsCapture";
import { getDb } from "./database";

// The group bank SMS entries go into: the one chosen in Config > Bank SMS, while it is still open, otherwise Main.
export async function resolveSmsGroupId(): Promise<string> {
  const saved = await loadSmsGroupId();
  if (!saved || saved === MAIN_GROUP_ID) return MAIN_GROUP_ID;
  const db = await getDb();
  const row = await db.getFirstAsync<{ id: string }>("SELECT id FROM expense_groups WHERE id = ? AND status = 'ACTIVE'", [saved]);
  return row ? row.id : MAIN_GROUP_ID;
}
