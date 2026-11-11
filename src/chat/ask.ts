import { loadCategories } from "../db/config";
import { listGroupsWithBalances } from "../db/groups";
import { getSpendingSummary, listChatEntries } from "../db/transactions";
import { offeredTools, ProtocolError } from "../domain/chatTools";
import { chatPeriodLabel, chatPeriodRange, detailLimit, type ChatEntries, type ChatMessage, type ChatPeriod } from "../domain/expenseChat";
import { scopeLabel, spansSeveralGroups, type GroupScope } from "../domain/groupScope";
import { toISODate } from "../domain/format";
import { askExpenseChat, type ChatReply } from "../llm/chat";
import { runAgent } from "../llm/chatAgent";
import { createLlmCall, providerNeedsKey } from "../llm/providers";
import { loadSettings } from "../settings/settings";
import { CAPABILITIES } from "./capabilities";
import { createChatData } from "./data";
import type { ChatToolContext } from "./types";

// The window an Ollama model is given for a chat, in tokens. Its own default is about 4,000, which a long prompt would overflow.
const OLLAMA_CONTEXT = 16384;

// Answers one question of the Ask AI page. `history` ends with the question. The AI is told which tools it has (every kind of data in the app:
// expenses, assets, gifts, train journeys, groups) and asks for what the question needs; see llm/chatAgent.ts. What it is shown is read again for every question, so a payment added a moment
// ago, or another group or period chosen on the page, is what it sees.
//
// If a model does not keep to the format of the exchange (a small local model, say) the question is asked the earlier way instead: one request
// carrying a summary of the expenses and the newest entries.
export async function askChat(scope: GroupScope, period: ChatPeriod, history: readonly ChatMessage[]): Promise<ChatReply> {
  const { provider, apiKey, model, ollamaUrl } = await loadSettings();
  if (providerNeedsKey(provider) && !apiKey) throw new Error("Add your AI API key in Config before asking.");

  const now = new Date();
  const range = chatPeriodRange(period, now);
  const [categories, groups] = await Promise.all([loadCategories(), listGroupsWithBalances()]);
  const nameOf = new Map(groups.map((g) => [g.id, g.name]));
  const label = scopeLabel(scope, nameOf);
  const call = createLlmCall(provider, apiKey ?? "", { model, baseUrl: ollamaUrl, numCtx: provider === "ollama" ? OLLAMA_CONTEXT : undefined });

  const toolCtx: ChatToolContext = {
    data: createChatData(scope),
    scopeLabel: label,
    range,
    now,
    groupNames: nameOf,
    spansGroups: spansSeveralGroups(scope),
  };
  const context = { scopeLabel: label, periodLabel: chatPeriodLabel(period), start: range.start, end: range.end, today: toISODate(now) };

  try {
    return await runAgent({ call, categories, tools: offeredTools(CAPABILITIES), toolCtx, ctx: context, history });
  } catch (err) {
    if (!(err instanceof ProtocolError)) throw err;
  }

  // The earlier way: the expense summary (and the entries when shared) in one request.
  const [summary, listed] = await Promise.all([
    getSpendingSummary(scope, range),
    listChatEntries(scope, range, detailLimit(provider === "ollama")),
  ]);
  const detail: ChatEntries = {
    total: listed.total,
    entries: listed.entries.map((e, i) => ({ ...e, groupName: toolCtx.spansGroups ? (nameOf.get(listed.groupIds[i]) ?? null) : null })),
  };
  return askExpenseChat(call, categories, summary, context, history, detail);
}
