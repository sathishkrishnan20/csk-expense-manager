import type { ChatMessage, ChatProposal, PastCard } from "./expenseChat";

// The history of Ask AI chats: what is kept, for how long, and how a chat becomes rows and comes back from them. No database in here, so it is tested
// in Node. The chats stay on this phone: they are not part of the backup file and are never sent anywhere.

export const CHAT_HISTORY_DAYS = 30; // a chat is removed this many days after its last message

// The moment before which a chat counts as old, written the way SQLite writes datetime('now') (UTC, "yyyy-mm-dd hh:mm:ss"), so the two compare as text.
export function historyCutoff(now: Date, days: number = CHAT_HISTORY_DAYS): string {
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return cutoff.toISOString().slice(0, 19).replace("T", " ");
}

// A SQLite UTC time as a moment, for "3 days ago".
export const sqliteUtcToMs = (text: string): number => Date.parse(`${text.replace(" ", "T")}Z`);

const MAX_TITLE_CHARS = 60;

// The first thing the owner said, on one line and cut to a length.
export function threadTitle(messages: readonly ChatMessage[]): string {
  const first = messages.find((m) => m.role === "user")?.text ?? "";
  const line = first.replace(/\s+/g, " ").trim();
  if (line === "") return "Chat";
  return line.length > MAX_TITLE_CHARS ? `${line.slice(0, MAX_TITLE_CHARS).trimEnd()}…` : line;
}

export const newThreadId = (): string => `ct-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export type ProposalState = "added" | "dismissed";

export interface MessageRow {
  seq: number;
  role: "user" | "assistant";
  text: string;
  toolsUsed: string | null;
  proposal: string | null;
  proposalState: ProposalState | null;
  card: string | null;
}

// The chat as rows. `outcome` says how the card of message i ended (a card still waiting counts as not saved), `proposalState` how its proposal did.
export function toRows(
  messages: readonly ChatMessage[],
  outcome: (index: number) => PastCard["outcome"],
  proposalState: (index: number) => ProposalState | undefined,
): MessageRow[] {
  return messages.map((m, i) => {
    const card = m.action ? { title: m.action.title, lines: m.action.lines, outcome: outcome(i) } : m.pastCard ?? null;
    return {
      seq: i,
      role: m.role,
      text: m.text,
      toolsUsed: m.toolsUsed?.length ? m.toolsUsed.join("\n") : null,
      proposal: m.proposal ? JSON.stringify(m.proposal) : null,
      proposalState: m.proposal ? (proposalState(i) ?? null) : null,
      card: card ? JSON.stringify(card) : null,
    };
  });
}

function parse<T>(text: string | null, valid: (v: unknown) => v is T): T | undefined {
  if (!text) return undefined;
  try {
    const value: unknown = JSON.parse(text);
    return valid(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isCard = (v: unknown): v is PastCard =>
  isObject(v) &&
  typeof v.title === "string" &&
  (v.outcome === "saved" || v.outcome === "cancelled" || v.outcome === "not_saved") &&
  Array.isArray(v.lines) &&
  v.lines.every((l) => isObject(l) && typeof l.label === "string" && typeof l.value === "string");
const isProposal = (v: unknown): v is ChatProposal =>
  isObject(v) && typeof v.category === "string" && typeof v.subcategory === "string" && typeof v.description === "string" && (v.status === "new-category" || v.status === "new-subcategory");

// The chat as it was left. A card that was waiting to be saved comes back as "not saved": nothing in it can be saved from here.
export function fromRows(rows: readonly MessageRow[]): { messages: ChatMessage[]; proposals: Record<number, ProposalState> } {
  const messages: ChatMessage[] = [];
  const proposals: Record<number, ProposalState> = {};
  [...rows]
    .sort((a, b) => a.seq - b.seq)
    .forEach((r, i) => {
      const proposal = parse(r.proposal, isProposal);
      const card = parse(r.card, isCard);
      messages.push({
        role: r.role,
        text: r.text,
        ...(r.toolsUsed ? { toolsUsed: r.toolsUsed.split("\n") } : {}),
        ...(proposal ? { proposal } : {}),
        ...(card ? { pastCard: card } : {}),
      });
      if (proposal && r.proposalState) proposals[i] = r.proposalState;
    });
  return { messages, proposals };
}
