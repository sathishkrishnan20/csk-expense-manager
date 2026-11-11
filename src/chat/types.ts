import type { ExchangeRecord } from "../db/assetExchanges";
import type { AssetRecord } from "../db/assets";
import type { GiftRecord } from "../db/gifts";
import type { JourneyRecord } from "../db/trainJourneys";
import type { EntriesResult, EntrySort, ExpenseFilter, ExpenseGroupBy, TotalsResult } from "../domain/chatQuery";
import type { Capability } from "../domain/chatTools";
import type { GroupWithBalance } from "../domain/groups";

// How the tools reach the phone's data. The real one is in data.ts (the database); the tests give the tools a fake, so a capability can be
// checked without a phone. A new feature adds what it needs here.
export interface ChatData {
  expenseTotals(filter: ExpenseFilter, groupBy: ExpenseGroupBy, limit: number): Promise<TotalsResult>;
  expenseEntries(filter: ExpenseFilter, sort: EntrySort, limit: number): Promise<EntriesResult>;
  assets(): Promise<AssetRecord[]>;
  exchanges(): Promise<ExchangeRecord[]>;
  gifts(): Promise<GiftRecord[]>;
  journeys(): Promise<JourneyRecord[]>;
  groups(): Promise<GroupWithBalance[]>;
}

// What every tool run knows about the page the question was asked on.
export interface ChatToolContext {
  data: ChatData;
  scopeLabel: string; // the groups chosen on the page: "Main", "3 groups", "All groups"
  range: { start: string; end: string }; // the period chosen on the page; the expense tools use it when no dates are given
  now: Date;
  groupNames: ReadonlyMap<string, string>;
  spansGroups: boolean; // several groups are covered, so entries say which group they belong to
}

export type ChatCapability = Capability<ChatToolContext>;
