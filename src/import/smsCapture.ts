import { createSqliteStore } from "../db/transactions";
import { PENDING_AI } from "../domain/taxonomy";
import { resolveSmsGroupId } from "../db/smsGroup";
import { withBackoff } from "../domain/backoff";
import { describeSmsProblem } from "../domain/smsProblem";
import { mentionsUpi, parseBankSms, smsToParsed } from "../domain/smsParser";
import type { ParsedTransaction } from "../domain/statementParser";
import { saveSmsLast } from "../settings/smsCapture";
import { bumpDataVersion } from "./dataVersion";
import { importParsed } from "./importStatement";
import { readPhoneInbox, removePhoneMessage, type QueuedSms } from "./phoneInbox";
import { classifyOrFallback } from "./safeClassify";
import { createClassifier } from "./services";
import { reportSmsProblem } from "./smsProblemStore";

// Collects the bank messages the "Add bank SMS" Shortcuts action has queued on the phone (import/phoneInbox.ts) and saves each as a
// transaction, in the group chosen in Config > Bank SMS (otherwise Main). It is the pipeline of a statement import: the UPI reference
// makes the key, so a message that was already saved, or a payment already in a statement, is not added twice (which also makes a
// repeated delivery harmless), and the AI categorises the new ones. A payment is always saved, whether or not the AI can be reached: if
// it cannot (no key, no internet, a quota) the entry goes into Others : Uncategorised and a later Re-classify categorises it, so the owner
// is never asked to enter it again. A message leaves the queue only once its entry is in the app, so a failure to save leaves it for the
// next check. A message that is not a UPI payment at all (a card or ATM message, an OTP) is skipped and removed without an entry.
//
// Nothing is shown while it works. A failed save is retried with a growing pause (1, 2 seconds) before it counts as a problem, and only
// then does the Home screen show a one-line bar (see domain/smsProblem.ts). The AI being unavailable is not a problem: the entry is
// saved and waits for Re-classify.

export interface SmsPullResult {
  fetched: number; // messages found waiting in the queue
  added: number; // new transactions saved
  alreadyHad: number; // messages whose payment was already saved (by an earlier message or a statement)
  ignored: number; // messages that are not UPI payments, skipped
  waiting: number; // readable messages that could not be saved, even after retrying
  uncategorised: number; // new entries saved without a category because the AI was not available (Re-classify will categorise them)
  unread: QueuedSms[]; // UPI messages this app does not know how to read
  error: string | null;
}

const SAVE_ATTEMPTS = 3;
const SAVE_BASE_DELAY_MS = 1_000;

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

async function collect(): Promise<SmsPullResult> {
  const result: SmsPullResult = { fetched: 0, added: 0, alreadyHad: 0, ignored: 0, waiting: 0, uncategorised: 0, unread: [], error: null };

  let queued: QueuedSms[] = [];
  try {
    queued = await readPhoneInbox();
  } catch (err) {
    result.error = message(err); // the queue could not be read; it stays where it is for the next check
  }
  queued.sort((a, b) => a.at.localeCompare(b.at));
  result.fetched = queued.length;

  const readable: { message: QueuedSms; row: ParsedTransaction }[] = [];
  for (const m of queued) {
    const sms = parseBankSms(m.text, new Date(m.at));
    if (sms) readable.push({ message: m, row: smsToParsed(sms) });
    else if (mentionsUpi(m.text)) result.unread.push(m);
    else {
      result.ignored++;
      await removePhoneMessage(m.id).catch(() => {}); // still there next time if this fails, and skipped again
    }
  }

  if (readable.length > 0) {
    const unique = new Map(readable.map(({ row }) => [row.dedupeKey, row]));
    const store = createSqliteStore(await resolveSmsGroupId());
    let problem: string | null = null;
    let classifier: Awaited<ReturnType<typeof createClassifier>> | null = null;
    try {
      classifier = await createClassifier();
    } catch (err) {
      problem = message(err); // for example no AI key yet
    }

    // `pending` holds the payments not yet in the app. Each try saves what is left and then asks the database what is there (a deleted
    // payment counts: the owner removed it on purpose), so a try that fails half way is not repeated for what it already saved.
    const pending = new Map(unique);
    const saved = new Set<string>();
    try {
      await withBackoff(
        async () => {
          let failure: unknown = null;
          try {
            const summary = await importParsed(
              { rows: [...pending.values()], skippedLines: 0 },
              {
                store,
                classify: classifyOrFallback(classifier?.classify ?? null, (reason) => (problem ??= reason)),
                // Without an AI the entries wait for Re-classify, which looks for this label.
                classifierLabel: classifier?.label ?? PENDING_AI,
              },
            );
            result.added += summary.imported;
            result.alreadyHad += summary.alreadyStored + summary.deletedEarlier.length;
          } catch (err) {
            failure = err;
          }
          for (const key of await store.existingKeys([...pending.keys()])) {
            saved.add(key);
            pending.delete(key);
          }
          if (pending.size > 0) throw failure ?? new Error("Some payments could not be saved.");
        },
        { attempts: SAVE_ATTEMPTS, baseDelayMs: SAVE_BASE_DELAY_MS },
      );
    } catch (err) {
      result.error = message(err);
    }
    if (problem) {
      result.uncategorised = result.added;
      result.error ??= `The AI could not categorise them (${problem}). They are saved in Others : Uncategorised; Config > Re-classify will categorise them.`;
    }

    // Only a message whose payment is now in the app leaves the queue.
    for (const { message: m, row } of readable) {
      if (!saved.has(row.dedupeKey)) {
        result.waiting++;
        continue;
      }
      try {
        await removePhoneMessage(m.id);
      } catch {
        // It is saved, so the next check finds the entry already there and removes the message then.
      }
    }
  }

  if (result.added > 0) bumpDataVersion();
  await saveSmsLast({ at: new Date().toISOString(), added: result.added, error: result.error }).catch(() => {});
  reportSmsProblem(describeSmsProblem({ waiting: result.waiting, unreadCount: result.unread.length }));
  return result;
}

let running: Promise<SmsPullResult> | null = null;
let again = false;

// One check at a time: opening the app and coming back to it can both ask, and two would save the same payment twice. A request that
// comes while one is running (the Shortcut ran just then) is not lost: another check follows, since the running one may already have
// read the queue.
export function pullSms(): Promise<SmsPullResult> {
  if (running) {
    again = true;
    return running;
  }
  running = collect().finally(() => {
    running = null;
    if (again) {
      again = false;
      pullSms().catch(() => {});
    }
  });
  return running;
}

// Throws away a message the app cannot read (the owner has seen it).
export const dismissUnreadSms = (id: string): Promise<void> => removePhoneMessage(id);
