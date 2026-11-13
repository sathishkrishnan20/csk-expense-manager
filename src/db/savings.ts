import type { SipPurchase } from "../domain/fundMail";
import type { MfCas } from "../domain/mfCas";
import type { NavUpdate } from "../domain/navFiles";
import type { NpsStatement } from "../domain/npsStatement";
import type { PfPassbook } from "../domain/pfPassbook";
import type { SavingsOverview } from "../domain/savings";
import { fromSqlite } from "./assetSql";
import { getDb, inTransaction } from "./database";
import {
  applyLiveNavs,
  applyMfCas,
  applyNpsStatement,
  applyPfPassbook,
  applySipPurchases,
  fillEstimates,
  loadOverview,
  setPfAutoAdd,
  type ImportReport,
} from "./savingsSql";

// Savings on the phone: the functions in savingsSql.ts run on the app's database, each write in one transaction (all or nothing). Information only:
// nothing here reads or writes transactions, groups or balances (see domain/savings.ts).
export type { ImportReport };

export async function loadSavings(): Promise<SavingsOverview> {
  return loadOverview(fromSqlite(await getDb()));
}

async function write<T>(work: (db: ReturnType<typeof fromSqlite>) => Promise<T>): Promise<T> {
  const db = await getDb();
  let result!: T;
  await inTransaction(db, async (txn) => {
    result = await work(fromSqlite(txn));
  });
  return result;
}

export const importPfPassbook = (passbook: PfPassbook): Promise<ImportReport> => write((db) => applyPfPassbook(db, passbook));
export const importNpsStatement = (statement: NpsStatement): Promise<ImportReport> => write((db) => applyNpsStatement(db, statement));
export const importSipPurchases = (purchases: readonly SipPurchase[], what: string): Promise<ImportReport> => write((db) => applySipPurchases(db, purchases, what));
export const importMfCas = (cas: MfCas): Promise<ImportReport> => write((db) => applyMfCas(db, cas));

// Adds the PF estimates that are due. Run when the Savings page opens, so each month's estimate appears the first time the app is used that month.
export const addDueEstimates = (now: Date = new Date()): Promise<number> => write((db) => fillEstimates(db, now));

export const updatePfAutoAdd = (account: string, on: boolean, now: Date = new Date()): Promise<void> => write((db) => setPfAutoAdd(db, account, on, now));
export const saveLiveNavs = (updates: readonly NavUpdate[]): Promise<void> => write((db) => applyLiveNavs(db, updates));
