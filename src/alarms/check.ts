import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { listJourneys } from "../db/trainJourneys";
import { buildCheckList, planAlarms, triggerToDate, type CheckList, type PhoneReminder } from "../domain/trainAlarms";
import { readScheduledAlarms } from "./alarmKit";
import { loadSetAlarms } from "./sync";

// Whether this platform sets train alarms, and so can show their marks: the iPhone app only, for now.
export const MARKS_SUPPORTED = Platform.select<boolean>({ ios: true, android: false, web: false, default: false });

// Asks iOS what it holds for the saved journeys (its pending reminders, and its real alarms where this build can read them) and sets that beside what
// the journeys call for. Used by the Train list and the journey screen for the marks and the warning about alarms that are not set.
export async function loadCheckList(): Promise<CheckList> {
  const [journeys, record, alarms] = await Promise.all([listJourneys(), loadSetAlarms(), readScheduledAlarms()]);
  let reminders: PhoneReminder[] | null = null;
  try {
    reminders = (await Notifications.getAllScheduledNotificationsAsync()).map((n) => ({
      identifier: n.identifier,
      title: n.content.title ?? "",
      at: triggerToDate(n.trigger),
    }));
  } catch {
    reminders = null;
  }
  return buildCheckList({ plans: planAlarms(journeys, new Date()), journeys, alarms, reminders, record });
}
