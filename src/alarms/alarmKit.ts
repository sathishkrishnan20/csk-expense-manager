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

// Asks iOS for permission to set alarms (a prompt the first time only). False when AlarmKit is not in this build.
export async function requestAlarmKit(): Promise<boolean> {
  if (!native) return false;
  try {
    return (await native.requestAuthorization()) === "authorized";
  } catch {
    return false;
  }
}

// Schedules a one-time alarm at an exact moment. False when iOS refused it.
export async function scheduleAlarmKit(id: string, at: Date, title: string): Promise<boolean> {
  if (!native) return false;
  try {
    return await native.scheduleAlarm({
      id,
      epochSeconds: at.getTime() / 1000,
      title,
      stopButtonLabel: "I'm up",
      snoozeButtonLabel: "5 more min",
      snoozeDuration: 300,
      tintColor: "#7F3DFF",
    });
  } catch {
    return false;
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
