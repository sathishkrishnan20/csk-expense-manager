import { monthOf } from "../domain/savingsEntries";
import { offerSetup, planSetup, type GroupFields, type MonthTemplate, type SetupChanges } from "../domain/monthTemplate";
import { bumpDataVersion } from "../import/dataVersion";
import { plainStorage } from "../platform/secureStorage";
import { saveHomeGroupId } from "../settings/homeGroup";
import { fromSqlite } from "./assetSql";
import { loadCategories } from "./config";
import { getDb, inTransaction } from "./database";
import {
  applySetup,
  deleteTemplateEntry as sqlDeleteEntry,
  loadGroupNames,
  loadSetUpMonths,
  loadTemplate,
  monthGroupExists,
  saveTemplateEntry as sqlSaveEntry,
  type EntryInput,
  type SetupResult,
} from "./monthTemplateSql";

// The monthly template on the phone: the functions in monthTemplateSql.ts run on the app's database, each write in one transaction (all or nothing).
// Setting a month up also points the app at the group with the Home switch, and tells open pages to reload.

async function write<T>(work: (db: ReturnType<typeof fromSqlite>) => Promise<T>): Promise<T> {
  const db = await getDb();
  let result!: T;
  await inTransaction(db, async (txn) => {
    result = await work(fromSqlite(txn));
  });
  return result;
}

export async function loadMonthTemplate(): Promise<MonthTemplate> {
  return loadTemplate(fromSqlite(await getDb()));
}

// Saves an entry of the template and, when it creates one, its group (see saveTemplateEntry in monthTemplateSql.ts).
export const saveTemplateEntry = (entry: EntryInput, group: GroupFields | null): Promise<string> => write((db) => sqlSaveEntry(db, entry, group));
export const deleteTemplateEntry = (id: string): Promise<void> => write((db) => sqlDeleteEntry(db, id));

// What the set-up preview needs: the template and the names of the groups that already exist (a name that is taken stops the set-up).
export async function loadSetupInputs(): Promise<{ template: MonthTemplate; existingNames: string[] }> {
  const db = fromSqlite(await getDb());
  return { template: await loadTemplate(db), existingNames: await loadGroupNames(db) };
}

export async function setUpMonth(month: string, changes: SetupChanges): Promise<SetupResult> {
  const categories = await loadCategories();
  const result = await write(async (db) => {
    const plan = planSetup(await loadTemplate(db), month, changes, await loadGroupNames(db));
    return applySetup(db, plan, categories);
  });
  if (result.homeGroupId) await saveHomeGroupId(result.homeGroupId);
  await plainStorage.remove(DISMISSED_KEY);
  bumpDataVersion();
  return result;
}

const DISMISSED_KEY = "template_setup_dismissed";

// The month to offer "Set up <month>?" for (the current month), or null.
export async function monthToOffer(now: Date = new Date()): Promise<string | null> {
  const month = monthOf(now);
  const db = fromSqlite(await getDb());
  const template = await loadTemplate(db);
  const offer = offerSetup({
    month,
    hasTemplate: template.groups.length > 0,
    setUpMonths: await loadSetUpMonths(db),
    monthGroupExists: await monthGroupExists(db, month),
    dismissedMonth: (await plainStorage.get(DISMISSED_KEY)) || null,
  });
  return offer ? month : null;
}

export const dismissSetup = (month: string): Promise<void> => plainStorage.set(DISMISSED_KEY, month);
