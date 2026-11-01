import { MAIN_GROUP_ID } from "../domain/groups";
import { loadHomeGroupId } from "../settings/homeGroup";
import { getDb } from "./database";

export interface HomeGroup {
  id: string;
  name: string;
}

// The group the app opens on. Main when none was chosen, or when the chosen group has since been closed or deleted.
export async function resolveHomeGroup(): Promise<HomeGroup> {
  const saved = await loadHomeGroupId();
  const db = await getDb();
  if (saved && saved !== MAIN_GROUP_ID) {
    const row = await db.getFirstAsync<{ id: string; name: string }>(
      "SELECT id, name FROM expense_groups WHERE id = ? AND status = 'ACTIVE'",
      [saved],
    );
    if (row) return row;
  }
  const main = await db.getFirstAsync<{ id: string; name: string }>("SELECT id, name FROM expense_groups WHERE id = ?", [MAIN_GROUP_ID]);
  return main ?? { id: MAIN_GROUP_ID, name: "Main" };
}

export const resolveHomeGroupId = async (): Promise<string> => (await resolveHomeGroup()).id;
