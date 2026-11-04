import { parseOutcomes, trimOutcomes, type SmsOutcome, type SmsOutcomeRecord } from "../domain/smsRunLog";
import { plainStorage } from "../platform/secureStorage";

// Which group the entries go to and how the last check went. Nothing here is secret: the bank messages themselves wait in the app's own
// queue (import/phoneInbox.ts) and never leave the phone.
const GROUP_KEY = "sms_group";
const LAST_KEY = "sms_last";
const OUTCOMES_KEY = "sms_outcomes";

// The group bank SMS entries go to; null when none was chosen (they go to Main).
export const loadSmsGroupId = (): Promise<string | null> => plainStorage.get(GROUP_KEY);

export async function saveSmsGroupId(groupId: string | null): Promise<void> {
  if (groupId) await plainStorage.set(GROUP_KEY, groupId);
  else await plainStorage.remove(GROUP_KEY);
}

export interface SmsLast {
  at: string; // ISO time of the last check
  added: number;
  error: string | null;
}

export async function loadSmsLast(): Promise<SmsLast | null> {
  const raw = await plainStorage.get(LAST_KEY);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<SmsLast>;
    return typeof v.at === "string" && typeof v.added === "number" ? { at: v.at, added: v.added, error: typeof v.error === "string" ? v.error : null } : null;
  } catch {
    return null;
  }
}

export const saveSmsLast = (last: SmsLast): Promise<void> => plainStorage.set(LAST_KEY, JSON.stringify(last));

// What the app did with each queued message, by the queue's id (no message text), for the "Recent runs" list in Config > Bank SMS.
export const loadSmsOutcomes = async (): Promise<Record<string, SmsOutcomeRecord>> => parseOutcomes(await plainStorage.get(OUTCOMES_KEY));

export async function recordSmsOutcomes(add: Record<string, SmsOutcome>): Promise<void> {
  const ids = Object.keys(add);
  if (ids.length === 0) return;
  const at = new Date().toISOString();
  const all = await loadSmsOutcomes();
  for (const id of ids) all[id] = { outcome: add[id], at };
  await plainStorage.set(OUTCOMES_KEY, JSON.stringify(trimOutcomes(all)));
}
