import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { alarmKitInstalled } from "../alarms/alarmKit";
import { scheduleTestAlarm } from "../alarms/sync";
import { formatClock } from "../domain/trainAlarms";
import { T } from "./Text";
import { Button } from "./forms";
import { colors } from "./theme";

// Config > Train alarms: one button that sets a test alarm a minute from now, on the same mechanism the journeys use, so the owner can
// check it rings (also with the phone on silent and locked) before trusting it for a real booking.
export function TrainAlarmSection() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const test = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await scheduleTestAlarm();
      const when = formatClock(r.at);
      const why = r.problem ? ` The reason: ${r.problem}.` : "";
      if (r.backend === "alarmkit") {
        setMessage({ text: `A real alarm will ring at ${when}. Lock the phone, and try it with the silent switch on.`, isError: false });
      } else if (r.backend === "notifications") {
        setMessage({
          text:
            `Three notifications, a minute apart from ${when}. ` +
            (r.alarmKitDenied ? "iOS did not allow alarms for this app (Settings > CSK Manager)." : "Real alarms need the installed app, not Expo Go.") +
            why,
          isError: false,
        });
      } else {
        setMessage({ text: `Nothing was set: notifications are switched off for this app in iOS Settings.${why}`, isError: true });
      }
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : String(err), isError: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.box}>
      <T style={styles.note}>
        {alarmKitInstalled
          ? "This build can set real alarms. They ring like the Clock app, on the lock screen, even with the silent switch on."
          : "This build cannot set real alarms (Expo Go does not include them), so journeys use notifications, repeated a minute apart."}{" "}
        The alarms are set on this phone only; nothing is sent anywhere.
      </T>
      <Button label="Test alarm in 1 minute" onPress={test} disabled={busy} />
      {message ? <T style={message.isError ? styles.error : styles.note}>{message.text}</T> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 12 },
  note: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  error: { color: colors.error, fontSize: 14 },
});
