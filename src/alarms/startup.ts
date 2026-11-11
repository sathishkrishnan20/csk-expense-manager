import { syncTrainAlarms } from "./sync";

// The alarms are put right once each time the app starts (called from the root layout). Pages that check the alarms wait for it, so they do not
// warn about something the start-up is just about to set. A wait never lasts more than ten seconds, in case iOS is slow to answer.
let finished: () => void = () => {};
const done = new Promise<void>((resolve) => {
  finished = resolve;
});

export function runStartupSync(): void {
  syncTrainAlarms()
    .catch(() => undefined)
    .finally(() => finished());
}

export function whenStartupSyncDone(): Promise<void> {
  return Promise.race([done, new Promise<void>((resolve) => setTimeout(resolve, 10_000))]);
}
