import { listExchanges } from "../db/assetExchanges";
import { loadCategories, loadPaymentMethods } from "../db/config";
import { listAssets } from "../db/assets";
import { loadMonthTemplate } from "../db/monthTemplate";
import { loadSavings } from "../db/savings";
import { queryExpenseEntries, queryExpenseTotals } from "../db/chatQueries";
import { listGifts } from "../db/gifts";
import { listGroupsWithBalances } from "../db/groups";
import { listJourneys } from "../db/trainJourneys";
import { addTransaction } from "../db/transactions";
import { saveGift, listOccasions } from "../db/gifts";
import { saveAsset } from "../db/assets";
import { saveJourney } from "../db/trainJourneys";
import { describeSync, syncTrainAlarms } from "../alarms/sync";
import { fetchGoldHistory } from "../rates/goldHistoryApi";
import { loadMetalRates } from "../rates/ratesLoad";
import type { GroupScope } from "../domain/groupScope";
import { bumpDataVersion } from "../import/dataVersion";
import type { ChatData, ChatWrites } from "./types";

// The phone's own database, as the tools see it. Expense queries are limited to the groups chosen on the page; assets, gifts, train journeys
// and the list of groups belong to no group.
export function createChatData(scope: GroupScope): ChatData {
  return {
    expenseTotals: (filter, groupBy, limit) => queryExpenseTotals(scope, filter, groupBy, limit),
    expenseEntries: (filter, sort, limit) => queryExpenseEntries(scope, filter, sort, limit),
    assets: listAssets,
    savings: loadSavings,
    monthTemplate: loadMonthTemplate,
    exchanges: listExchanges,
    gifts: listGifts,
    journeys: listJourneys,
    groups: listGroupsWithBalances,
    occasions: listOccasions,
    categories: loadCategories,
    paymentMethods: loadPaymentMethods,
    metalRates: () => loadMetalRates(),
    nagercoilRates: () => fetchGoldHistory(),
  };
}

// What a prepared action writes when the owner taps Save. These are the same save functions the forms use, so every rule a form keeps is kept here
// too. Pages that are already open are told to reload.
export function createChatWrites(): ChatWrites {
  return {
    addTransaction: async (input) => {
      await addTransaction(input);
      bumpDataVersion();
    },
    // Saving a journey and setting its alarms are two steps, as on the journey form: if the alarms fail the journey is still saved, and the
    // alarms are tried again each time the app opens.
    addJourney: async (input) => {
      await saveJourney(input);
      try {
        return describeSync(await syncTrainAlarms({ ask: true }));
      } catch (err) {
        return `The alarms could not be set: ${err instanceof Error ? err.message : String(err)}. They are tried again each time the app opens.`;
      }
    },
    addGift: async (input) => {
      await saveGift(input);
    },
    addAsset: async (fields) => {
      await saveAsset(fields);
    },
  };
}
