import type { SipPurchase } from "../domain/fundMail";
import type { MfCas } from "../domain/mfCas";
import type { NavUpdate } from "../domain/navFiles";
import type { NpsStatement } from "../domain/npsStatement";
import type { PfPassbook } from "../domain/pfPassbook";
import type { SavingsOverview } from "../domain/savings";
import { bumpDataVersion } from "../import/dataVersion";
import { monthOf, placeNotes, type PlaceResult } from "../domain/savingsEntries";
import { fromSqlite } from "./assetSql";
import { getDb, inTransaction } from "./database";
import { casBuys, placeFundEntries, waitingBuys } from "./savingsEntriesSql";
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

// What a purchase's debit entry did is said with the import ("Added 2 mutual fund entries to your month group."), and a page already open reloads its list.
const withEntries = (report: ImportReport, placed: PlaceResult): ImportReport => ({ ...report, notes: [...report.notes, ...placeNotes(placed)] });
const changedTransactions = (placed: PlaceResult): boolean => placed.added + placed.updated > 0;

export const importPfPassbook = (passbook: PfPassbook): Promise<ImportReport> => write((db) => applyPfPassbook(db, passbook));
export const importNpsStatement = (statement: NpsStatement): Promise<ImportReport> => write((db) => applyNpsStatement(db, statement));

export async function importSipPurchases(purchases: readonly SipPurchase[], what: string): Promise<ImportReport> {
  let placed!: PlaceResult;
  const report = await write(async (db) => {
    const done = await applySipPurchases(db, purchases, what);
    placed = await placeFundEntries(db, await waitingBuys(db), { month: monthOf(new Date()), add: true });
    return done;
  });
  if (changedTransactions(placed)) bumpDataVersion();
  return withEntries(report, placed);
}

export async function importMfCas(cas: MfCas): Promise<ImportReport> {
  let placed!: PlaceResult;
  const report = await write(async (db) => {
    const done = await applyMfCas(db, cas);
    placed = await placeFundEntries(db, casBuys(cas), { month: monthOf(new Date()), add: false });
    return done;
  });
  if (changedTransactions(placed)) bumpDataVersion();
  return withEntries(report, placed);
}

// Adds the PF estimates that are due. Run when the Savings page opens, so each month's estimate appears the first time the app is used that month. It also puts any
// purchase from a confirmation email that has no entry yet into its month group (a group made after the email came gets its entries now). Returns the estimates added.
export async function addDueEstimates(now: Date = new Date()): Promise<number> {
  let placed!: PlaceResult;
  const added = await write(async (db) => {
    const n = await fillEstimates(db, now);
    placed = await placeFundEntries(db, await waitingBuys(db), { month: monthOf(now), add: true });
    return n;
  });
  if (changedTransactions(placed)) bumpDataVersion();
  return added;
}

export const updatePfAutoAdd = (account: string, on: boolean, now: Date = new Date()): Promise<void> => write((db) => setPfAutoAdd(db, account, on, now));
export const saveLiveNavs = (updates: readonly NavUpdate[]): Promise<void> => write((db) => applyLiveNavs(db, updates));
