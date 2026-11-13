import type { ExchangeRecord } from "../db/assetExchanges";
import type { AssetRecord } from "../db/assets";
import type { GiftInput, GiftRecord, OccasionSummary } from "../db/gifts";
import type { JourneyInput, JourneyRecord } from "../db/trainJourneys";
import type { TransactionInput } from "../db/transactions";
import type { EntriesResult, EntrySort, ExpenseFilter, ExpenseGroupBy, TotalsResult } from "../domain/chatQuery";
import type { Capability } from "../domain/chatTools";
import type { AssetFields } from "../domain/assets";
import type { GoldHistoryRow } from "../domain/goldHistory";
import type { CachedRates } from "../domain/metalRates";
import type { GroupWithBalance } from "../domain/groups";
import type { SavingsOverview } from "../domain/savings";
import type { CategoryDef } from "../domain/masterData";

// How the tools reach the phone's data. The real one is in data.ts (the database); the tests give the tools a fake, so a capability can be
// checked without a phone. A new feature adds what it needs here.
export interface ChatData {
  expenseTotals(filter: ExpenseFilter, groupBy: ExpenseGroupBy, limit: number): Promise<TotalsResult>;
  expenseEntries(filter: ExpenseFilter, sort: EntrySort, limit: number): Promise<EntriesResult>;
  assets(): Promise<AssetRecord[]>;
  savings(): Promise<SavingsOverview>; // mutual fund, NPS and PF figures from the statements imported on the Savings page
  exchanges(): Promise<ExchangeRecord[]>;
  gifts(): Promise<GiftRecord[]>;
  journeys(): Promise<JourneyRecord[]>;
  groups(): Promise<GroupWithBalance[]>;
  occasions(): Promise<OccasionSummary[]>;
  categories(): Promise<CategoryDef[]>;
  paymentMethods(): Promise<string[]>;
  metalRates(): Promise<CachedRates | null>; // the IBJA gold and silver rates (looked up live or from the page's saved copy), null when there never were any
  nagercoilRates(): Promise<GoldHistoryRow[] | null>; // the Nagercoil 22K/24K history, newest first, null when not available
}

// How a prepared action writes, after the owner taps Save (never from a tool). The real one is in data.ts; the tests give the actions a fake.
export interface ChatWrites {
  addTransaction(input: TransactionInput): Promise<void>;
  addJourney(input: JourneyInput): Promise<string>; // saves the journey, sets its alarms, and says how the alarms went
  addGift(input: GiftInput): Promise<void>;
  addAsset(fields: AssetFields): Promise<void>;
}

// What every tool run knows about the page the question was asked on.
export interface ChatToolContext {
  data: ChatData;
  writes: ChatWrites;
  pageGroupId: string; // the group open on the page: where an added entry goes unless another is named
  scopeLabel: string; // the groups chosen on the page: "Main", "3 groups", "All groups"
  range: { start: string; end: string }; // the period chosen on the page; the expense tools use it when no dates are given
  now: Date;
  groupNames: ReadonlyMap<string, string>;
  spansGroups: boolean; // several groups are covered, so entries say which group they belong to
}

export type ChatCapability = Capability<ChatToolContext>;
