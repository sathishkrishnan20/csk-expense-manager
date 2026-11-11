import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";

// AlarmKit (iOS 26): a real system alarm that rings on the lock screen, through the silent switch and Focus, even when the app is
// closed. It comes from the `expo-alarm-kit` native module, which Expo Go does not contain. The module is looked up at run time
// (not imported), so in Expo Go, on the web and in any build without it `alarmKitInstalled` is false and the app falls back to
// notifications instead of failing at start-up.
//
// The module's own `configure(appGroup)` is deliberately never called: it only stores a list of alarm ids in an App Group, which a
// free Apple account cannot sign, and this app keeps its own ids (domain/trainAlarms.ts `alarmUuid`).

type Authorization = "authorized" | "denied" | "notDetermined";

interface ScheduleOptions {
  id: string; // a UUID
  epochSeconds: number;
  title: string;
  stopButtonLabel?: string;
  snoozeButtonLabel?: string;
  snoozeDuration?: number; // seconds
  tintColor?: string; // hex
}

interface AlarmKitNative {
  requestAuthorization(): Promise<Authorization>;
  scheduleAlarm(options: ScheduleOptions): Promise<boolean>;
  cancelAlarm(id: string): Promise<boolean>;
}

const native: AlarmKitNative | null = Platform.OS === "ios" ? requireOptionalNativeModule<AlarmKitNative>("ExpoAlarmKit") : null;

export const alarmKitInstalled = native !== null;

// The alarms this app has scheduled, as iOS itself reports them (AlarmKit's own list, which only ever holds this app's alarms). It comes from
// a small module of our own (app-intents/TrainAlarmReader.swift), because `expo-alarm-kit` does not expose it. A build made before that module
// was added does not have it: `alarmReaderInstalled` is then false and `readScheduledAlarms` returns null.
interface ReaderNative {
  getScheduledAlarms(): Promise<{ id: string; state: string; epochSeconds?: number }[]>;
}

const reader: ReaderNative | null = Platform.OS === "ios" ? requireOptionalNativeModule<ReaderNative>("TrainAlarmReader") : null;

export const alarmReaderInstalled = reader !== null;

export interface ScheduledAlarm {
  id: string; // the UUID the alarm was scheduled under
  state: string; // "scheduled", "countdown", "paused", "alerting" or "unknown"
  at: Date | null; // when it rings, for an alarm set for a fixed moment
}

// Null when this build cannot read them, or iOS refused (for example alarms were never allowed); otherwise every alarm iOS holds for this app.
export async function readScheduledAlarms(): Promise<ScheduledAlarm[] | null> {
  if (!reader) return null;
  try {
    return (await reader.getScheduledAlarms()).map((a) => ({
      id: a.id.toLowerCase(),
      state: a.state,
      at: typeof a.epochSeconds === "number" ? new Date(a.epochSeconds * 1000) : null,
    }));
  } catch {
    return null;
  }
}

// Asks iOS for permission to set alarms (a prompt the first time only). False when AlarmKit is not in this build.
export async function requestAlarmKit(): Promise<boolean> {
  if (!native) return false;
  try {
    return (await native.requestAuthorization()) === "authorized";
  } catch {
    return false;
  }
}

// Schedules a one-time alarm at an exact moment. Null when it was set; otherwise why it was not, in words for the owner.
export async function scheduleAlarmKit(id: string, at: Date, title: string): Promise<string | null> {
  if (!native) return "alarms are not available in this build";
  try {
    const set = await native.scheduleAlarm({
      id,
      epochSeconds: at.getTime() / 1000,
      title,
      stopButtonLabel: "I'm up",
      snoozeButtonLabel: "2 more min",
      snoozeDuration: 120,
      tintColor: "#7F3DFF",
    });
    return set ? null : "iOS did not accept the alarm";
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

export async function cancelAlarmKit(id: string): Promise<void> {
  if (!native) return;
  try {
    await native.cancelAlarm(id);
  } catch {
    // nothing scheduled under this id
  }
}
