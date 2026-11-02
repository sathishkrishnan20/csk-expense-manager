import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { listDeletedJourneyIds, listJourneys } from "../db/trainJourneys";
import { plainStorage } from "../platform/secureStorage";
import {
  ALARM_CHAIN,
  NOTIFICATION_ID_PREFIX,
  LEGACY_ALARM_KINDS,
  REAL_ALARM_KINDS,
  alarmUuid,
  capNotifications,
  planAlarms,
  describeSyncOutcome,
  planNotifications,
  type PlannedNotification,
} from "../domain/trainAlarms";
import { alarmKitInstalled, cancelAlarmKit, requestAlarmKit, scheduleAlarmKit } from "./alarmKit";

// Makes iOS match the saved train journeys. The alarms are never the source of truth: the journeys in SQLite are, and this rebuilds the
// alarms from them, so it is safe to run as often as needed (every launch, and after every save or delete). Two kinds of alarm:
//  - AlarmKit (real alarms, iOS 26) for the run of alarms before each opening, when the build has it and iOS allows it;
//  - local notifications otherwise (those alarms are then repeated a minute apart), plus the evening-before and 7:00 AM
//    reminders, which are always notifications.
// Alarms are set up on the phone only; nothing is sent to a server.

const ALARMKIT_OK_KEY = "train_alarmkit_ok"; // "1" once iOS has let this app set alarms, so a launch never has to ask

export type AlarmBackend = "alarmkit" | "notifications" | "none";

export interface SyncResult {
  backend: AlarmBackend; // what rings the wake-up and 5-minute alarms
  alarms: number; // AlarmKit alarms scheduled
  notifications: number; // notifications scheduled
  failed: number; // alarms or notifications iOS refused
  errors: string[]; // why, as iOS or the module said it (the first few, each once)
  notificationsDenied: boolean; // iOS notifications are switched off for the app
  alarmKitDenied: boolean; // AlarmKit is in the build but iOS did not allow it
}

const EMPTY: SyncResult = { backend: "none", alarms: 0, notifications: 0, failed: 0, errors: [], notificationsDenied: false, alarmKitDenied: false };

const MAX_ERRORS_SHOWN = 3;

// Counts one alarm or notification iOS refused, and keeps its reason (each reason once) to show the owner.
function recordFailure(result: SyncResult, reason: string): void {
  result.failed++;
  if (result.errors.length < MAX_ERRORS_SHOWN && !result.errors.includes(reason)) result.errors.push(reason);
}
let handlerSet = false;

// Shows a notification (banner, sound) even while the app is open.
export function configureAlarmNotifications(): void {
  if (handlerSet || Platform.OS === "web") return;
  handlerSet = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

async function notificationsAllowed(ask: boolean): Promise<boolean> {
  let status = await Notifications.getPermissionsAsync();
  if (!status.granted && ask && status.canAskAgain) status = await Notifications.requestPermissionsAsync();
  return status.granted;
}

// Whether to use AlarmKit. Asking iOS shows a prompt the first time, so only a save (ask = true) asks; a launch uses the remembered answer.
async function useAlarmKit(ask: boolean): Promise<{ use: boolean; denied: boolean }> {
  if (!alarmKitInstalled) return { use: false, denied: false };
  if ((await plainStorage.get(ALARMKIT_OK_KEY)) === "1") return { use: true, denied: false };
  if (!ask) return { use: false, denied: false };
  const allowed = await requestAlarmKit();
  if (allowed) await plainStorage.set(ALARMKIT_OK_KEY, "1");
  return { use: allowed, denied: !allowed };
}

async function clearOurNotifications(): Promise<void> {
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of pending) {
    if (n.identifier.startsWith(NOTIFICATION_ID_PREFIX)) await Notifications.cancelScheduledNotificationAsync(n.identifier);
  }
}

// Null when it was scheduled; otherwise why it was not.
async function scheduleNotification(n: PlannedNotification): Promise<string | null> {
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: n.identifier,
      content: { title: n.title, body: n.body, sound: "default", interruptionLevel: "timeSensitive" },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: n.at },
    });
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

export async function syncTrainAlarms(options: { ask?: boolean } = {}): Promise<SyncResult> {
  if (Platform.OS === "web") return EMPTY;
  const ask = options.ask === true;
  const result: SyncResult = { ...EMPTY, errors: [] };

  const [journeys, deletedIds] = await Promise.all([listJourneys(), listDeletedJourneyIds()]);
  const plans = planAlarms(journeys, new Date());

  const kit = await useAlarmKit(ask);
  let kitWorks = kit.use;
  result.alarmKitDenied = kit.denied;

  // Real alarms. Every journey's alarm ids are known from its id, so alarms that are no longer wanted (deleted journey, moved date,
  // already past) are cancelled and the wanted ones are replaced, with nothing to remember between runs.
  if (kit.use) {
    const wanted = new Map(plans.filter((p) => !p.reminder).map((p) => [alarmUuid(p.journeyId, p.kind), p]));
    for (const id of [...journeys.map((j) => j.id), ...deletedIds]) {
      for (const kind of [...REAL_ALARM_KINDS, ...LEGACY_ALARM_KINDS]) {
        const uuid = alarmUuid(id, kind);
        if (!wanted.has(uuid)) await cancelAlarmKit(uuid);
      }
    }
    for (const [uuid, plan] of wanted) {
      await cancelAlarmKit(uuid);
      const problem = await scheduleAlarmKit(uuid, plan.at, plan.title);
      if (problem === null) result.alarms++;
      else recordFailure(result, problem);
    }
    // iOS refused every alarm (for example the permission was switched off later): forget the remembered yes and fall back to
    // notifications, so the owner is not left with no wake-up at all.
    if (wanted.size > 0 && result.alarms === 0) {
      await plainStorage.remove(ALARMKIT_OK_KEY);
      kitWorks = false;
      // Every alarm was refused: the notifications below take over, and the message says so, so their reasons are not repeated.
      result.failed = 0;
      result.errors = [];
      result.alarmKitDenied = true;
    } else {
      result.backend = "alarmkit";
    }
  }

  // Notifications: the evening and morning reminders always, and the alarms too when AlarmKit is not doing them.
  const allowed = await notificationsAllowed(ask);
  result.notificationsDenied = !allowed;
  if (allowed) {
    await clearOurNotifications();
    for (const n of capNotifications(planNotifications(plans, kitWorks))) {
      const problem = await scheduleNotification(n);
      if (problem === null) result.notifications++;
      else recordFailure(result, problem);
    }
    if (!kitWorks) result.backend = "notifications";
  } else if (!kitWorks) {
    result.backend = "none";
  }
  return result;
}

// One-line summary shown after a save.
export const describeSync = (r: SyncResult): string => describeSyncOutcome(r);

// Config > "Test alarm in 1 minute": a single alarm a minute from now, on the same mechanism the journeys use, so the owner can hear
// exactly what will ring. Returns what was used and when it will ring.
export async function scheduleTestAlarm(): Promise<{
  backend: AlarmBackend;
  at: Date;
  alarmKitDenied: boolean;
  notificationsDenied: boolean;
  problem: string | null; // why the alarm or a notification could not be set, when it could not
}> {
  const at = new Date(Date.now() + 60_000);
  const alarmKit = await useAlarmKit(true);
  let problem: string | null = null;
  if (alarmKit.use) {
    const uuid = alarmUuid("test", "a0");
    await cancelAlarmKit(uuid);
    problem = await scheduleAlarmKit(uuid, at, "Test alarm");
    if (problem === null) return { backend: "alarmkit", at, alarmKitDenied: false, notificationsDenied: false, problem: null };
  }
  if (!(await notificationsAllowed(true))) {
    return { backend: "none", at, alarmKitDenied: alarmKit.denied, notificationsDenied: true, problem };
  }
  // Same repeat as a real alarm without AlarmKit: notifications a minute apart.
  for (let i = 0; i < ALARM_CHAIN; i++) {
    const failure = await scheduleNotification({
      identifier: `traintest-${i}`,
      at: new Date(at.getTime() + i * 60_000),
      title: "Test alarm",
      body: "This is how the train booking alarm sounds without AlarmKit.",
    });
    problem ??= failure;
  }
  return { backend: "notifications", at, alarmKitDenied: alarmKit.denied, notificationsDenied: false, problem };
}
