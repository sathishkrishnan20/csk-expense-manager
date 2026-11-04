import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";
import { mergeRunLog, parseRunLog, type SmsRun, type SmsRunRow } from "../domain/smsRunLog";
import { loadSmsOutcomes } from "../settings/smsCapture";
import { readPhoneInbox } from "./phoneInbox";

// The run records the "Add bank SMS" action keeps natively (app-intents/AddBankSmsRunStore.swift, read through app-intents/SmsRunLog.swift).
// Only the iPhone app has them: Android will read messages on the phone itself (not built yet) and the browser has no Shortcuts. A build
// from before this list existed has no such module, so it reads as empty.
type SmsRunLogModule = { read(): string };

function readRuns(): SmsRun[] {
  switch (Platform.OS) {
    case "ios": {
      const native = requireOptionalNativeModule<SmsRunLogModule>("SmsRunLog");
      return native ? parseRunLog(native.read()) : [];
    }
    case "android":
    case "web":
    default:
      return [];
  }
}

// Whether this build records runs at all (a newer install than the one that only queued messages).
export const runLogAvailable = (): boolean => Platform.OS === "ios" && requireOptionalNativeModule("SmsRunLog") !== null;

// Newest first: every run of the action, with what became of its message.
export async function loadRunRows(): Promise<SmsRunRow[]> {
  const runs = readRuns();
  if (runs.length === 0) return [];
  const [outcomes, queued] = await Promise.all([loadSmsOutcomes(), readPhoneInbox().catch(() => [])]);
  return mergeRunLog(runs, outcomes, new Set(queued.map((m) => m.id)));
}
