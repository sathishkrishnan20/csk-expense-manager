import { listExchanges } from "../db/assetExchanges";
import { listAssets } from "../db/assets";
import { queryExpenseEntries, queryExpenseTotals } from "../db/chatQueries";
import { listGifts } from "../db/gifts";
import { listGroupsWithBalances } from "../db/groups";
import { listJourneys } from "../db/trainJourneys";
import type { GroupScope } from "../domain/groupScope";
import type { ChatData } from "./types";

// The phone's own database, as the tools see it. Expense queries are limited to the groups chosen on the page; assets, gifts, train journeys
// and the list of groups belong to no group.
export function createChatData(scope: GroupScope): ChatData {
  return {
    expenseTotals: (filter, groupBy, limit) => queryExpenseTotals(scope, filter, groupBy, limit),
    expenseEntries: (filter, sort, limit) => queryExpenseEntries(scope, filter, sort, limit),
    assets: listAssets,
    exchanges: listExchanges,
    gifts: listGifts,
    journeys: listJourneys,
    groups: listGroupsWithBalances,
  };
}
