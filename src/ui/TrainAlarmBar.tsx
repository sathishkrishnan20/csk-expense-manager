import { useCallback, useState } from "react";
import { AppState, Pressable, StyleSheet, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { MARKS_SUPPORTED, loadCheckList } from "../alarms/check";
import { whenStartupSyncDone } from "../alarms/startup";
import { describeSync, syncTrainAlarms } from "../alarms/sync";
import { notify } from "../platform/dialogs";
import { T } from "./Text";
import { TextButton } from "./forms";
import { colors } from "./theme";

// A warning at the top of Home when iOS no longer holds an alarm or reminder that a saved journey needs (iOS can drop them). It looks when Home is
// shown and each time the app comes back to the front, after the start-up has put the alarms right. It only looks: nothing is set again until the
// owner taps Set again, because setting an alarm again cancels it first, which must not happen to one that is ringing. Tapping the text opens the
// Train page, where each journey says what is missing. iPhone only, like the alarms.
export function TrainAlarmBar() {
  const router = useRouter();
  const [missing, setMissing] = useState(0);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async (stillShown: () => boolean) => {
    await whenStartupSyncDone();
    try {
      const list = await loadCheckList();
      if (stillShown()) setMissing(list.rows.filter((r) => !r.set).length);
    } catch {
      // iOS could not be asked: say nothing rather than something wrong
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!MARKS_SUPPORTED) return;
      let shown = true;
      check(() => shown);
      const subscription = AppState.addEventListener("change", (state) => {
        if (state === "active") check(() => shown);
      });
      return () => {
        shown = false;
        subscription.remove();
      };
    }, [check]),
  );

  const setAgain = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const outcome = describeSync(await syncTrainAlarms({ ask: true }));
      await check(() => true);
      notify(outcome);
    } catch (err) {
      notify(`The alarms could not be set: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  if (missing === 0) return null;
  return (
    <View style={styles.bar}>
      <Pressable style={styles.body} onPress={() => router.push("/train")} accessibilityRole="button" accessibilityLabel="Train alarms not set. Open Train alarms">
        <MaterialIcons name="alarm-off" size={24} color={colors.error} />
        <View style={{ flex: 1 }}>
          <T style={styles.text}>
            {missing} train {missing === 1 ? "alarm or reminder is" : "alarms and reminders are"} not set on this iPhone.
          </T>
          <T style={styles.hint}>Tap to see which.</T>
        </View>
      </Pressable>
      <View style={styles.action}>
        <TextButton label={busy ? "Setting…" : "Set again"} onPress={setAgain} color={colors.error} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", margin: 12, marginBottom: 0, borderRadius: 8, backgroundColor: "#fdecea" },
  body: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  text: { fontSize: 13, lineHeight: 18 },
  hint: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  action: { paddingRight: 8 },
});
