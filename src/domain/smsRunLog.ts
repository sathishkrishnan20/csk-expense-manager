// The "Recent runs" list in Config > Bank SMS. The Swift side notes every run of the "Add bank SMS" action (app-intents/AddBankSmsRunStore.swift);
// the app notes what it did with each queued message. Putting the two side by side shows where a message stopped: no row means iOS never ran
// the action, a row that is still waiting or has no result means the app did not save it.

export type SmsOutcome = "saved" | "already_had" | "skipped" | "unreadable" | "empty" | "waiting";

export interface SmsRun {
  id: string; // the queue's id for the message
  at: string; // ISO time the action ran
  length: number; // characters in the message (the text itself is not kept)
  empty: boolean;
}

export interface SmsOutcomeRecord {
  outcome: SmsOutcome;
  at: string; // ISO time the app reached it
}

export type SmsRunStatus = SmsOutcome | "queued" | "no_trace";

export interface SmsRunRow extends SmsRun {
  status: SmsRunStatus;
}

export const MAX_OUTCOMES = 50;
export const MAX_RUN_ROWS = 20;

// The native side hands the records over as JSON text. Anything unreadable is dropped rather than shown wrong.
export function parseRunLog(json: string): SmsRun[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const runs: SmsRun[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const v = item as Record<string, unknown>;
    if (typeof v.id !== "string" || typeof v.at !== "number" || !Number.isFinite(v.at)) continue;
    runs.push({
      id: v.id,
      at: new Date(v.at).toISOString(),
      length: typeof v.length === "number" ? v.length : 0,
      empty: v.empty === true,
    });
  }
  return runs;
}

export function parseOutcomes(json: string | null): Record<string, SmsOutcomeRecord> {
  if (!json) return {};
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return {};
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const known: SmsOutcome[] = ["saved", "already_had", "skipped", "unreadable", "empty", "waiting"];
  const out: Record<string, SmsOutcomeRecord> = {};
  for (const [id, value] of Object.entries(raw)) {
    const v = value as Partial<SmsOutcomeRecord> | null;
    if (v && typeof v.at === "string" && known.includes(v.outcome as SmsOutcome)) out[id] = { outcome: v.outcome as SmsOutcome, at: v.at };
  }
  return out;
}

// Keeps the newest `max` results so the stored list stays small.
export function trimOutcomes(outcomes: Record<string, SmsOutcomeRecord>, max = MAX_OUTCOMES): Record<string, SmsOutcomeRecord> {
  const entries = Object.entries(outcomes);
  if (entries.length <= max) return outcomes;
  entries.sort((a, b) => b[1].at.localeCompare(a[1].at));
  return Object.fromEntries(entries.slice(0, max));
}

// Newest first. A run with a result shows it; one with none is either still in the queue (the app has not collected it yet) or in neither
// place, which means it was lost (or ran before this list existed).
export function mergeRunLog(
  runs: SmsRun[],
  outcomes: Record<string, SmsOutcomeRecord>,
  queuedIds: ReadonlySet<string>,
  max = MAX_RUN_ROWS,
): SmsRunRow[] {
  const rows = runs.map<SmsRunRow>((run) => {
    const outcome = outcomes[run.id]?.outcome;
    // A message that is still queued after a failed save is "waiting", and a later save replaces that, so the stored result wins.
    const status: SmsRunStatus = outcome ?? (queuedIds.has(run.id) ? "queued" : run.empty ? "empty" : "no_trace");
    return { ...run, status };
  });
  rows.sort((a, b) => b.at.localeCompare(a.at));
  return rows.slice(0, max);
}

export const describeRunStatus = (status: SmsRunStatus): string => {
  switch (status) {
    case "saved":
      return "Saved as a new payment";
    case "already_had":
      return "Already in the app, not added twice";
    case "skipped":
      return "Skipped: not a UPI payment";
    case "unreadable":
      return "Could not be read (see below)";
    case "empty":
      return "Empty message: set the Shortcut's Message field to Shortcut Input";
    case "waiting":
      return "Could not be saved yet, will be tried again";
    case "queued":
      return "Waiting for the app to collect it (tap Check now)";
    case "no_trace":
      return "Ran, but it is not in the queue and no result was recorded";
  }
};
