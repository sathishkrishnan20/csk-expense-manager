import { MAIN_GROUP_ID } from "../domain/groups";
import { plainStorage } from "../platform/secureStorage";

// Which group the app opens on: the Home, Transactions and Charts tabs show this group, and the + button adds to it. Main is the
// default and is stored as nothing. Not secret, so plain storage.
const KEY = "home_group";

export async function loadHomeGroupId(): Promise<string | null> {
  return (await plainStorage.get(KEY)) || null;
}

export async function saveHomeGroupId(groupId: string): Promise<void> {
  if (groupId === MAIN_GROUP_ID) await plainStorage.remove(KEY);
  else await plainStorage.set(KEY, groupId);
}
