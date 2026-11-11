import { useCallback, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { alarmKitInstalled } from "../alarms/alarmKit";
import { MARKS_SUPPORTED, loadCheckList } from "../alarms/check";
import { describeSync, syncTrainAlarms } from "../alarms/sync";
import { listJourneys, type JourneyRecord } from "../db/trainJourneys";
import { TRAIN_SHOWS, alarmTimeMarks, droppedText, filterJourneys, journeyStatus, type CheckList, type TrainShow } from "../domain/trainAlarms";
import { toISODate } from "../domain/format";
import { notify } from "../platform/dialogs";
import { AppHeader } from "../ui/Header";
import { RowDivider } from "../ui/TransactionRow";
import { T } from "../ui/Text";
import { Button, ChoiceField } from "../ui/forms";
import { TrainRow } from "../ui/TrainRow";
import { useGoBack } from "../ui/useGoBack";
import { colors, shadow } from "../ui/theme";

// Train journeys and the alarms for when their booking opens. Information only: not transactions, no category, no balance. Saving a
// journey sets the alarms (alarms/sync.ts); this page lists them, soonest journey first, with journeys already over at the end.
export default function TrainScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const insets = useSafeAreaInsets();
  const [all, setAll] = useState<JourneyRecord[] | null>(null);
  const [show, setShow] = useState<TrainShow>("all");
  // What iOS holds for the saved journeys: a check or cross beside each alarm time, and a warning under a journey that has something missing.
  const [checks, setChecks] = useState<CheckList | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      listJourneys().then((list) => {
        if (!alive) return;
        // Journeys that are over go below the ones still ahead.
        const now = new Date();
        const over = (j: JourneyRecord) => journeyStatus(j, now).phase === "past";
        setAll([...list.filter((j) => !over(j)), ...list.filter(over)]);
      });
      if (MARKS_SUPPORTED) {
        loadCheckList()
          .then((list) => alive && setChecks(list))
          .catch(() => undefined);
      }
      return () => {
        alive = false;
      };
    }, []),
  );

  // One warning for the whole page and one button that sets everything that is missing, besides the warning under each journey.
  const [busy, setBusy] = useState(false);
  const missing = checks ? checks.rows.filter((r) => !r.set).length : 0;
  const setMissing = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const outcome = describeSync(await syncTrainAlarms({ ask: true }));
      setChecks(await loadCheckList());
      notify(outcome);
    } catch (err) {
      notify(`The alarms could not be set: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const now = new Date();
  const journeys = all === null ? null : filterJourneys(all, show, toISODate(now));
  const header = (
    <View style={styles.intro}>
      {missing > 0 ? (
        <View style={styles.alert}>
          <View style={styles.alertLine}>
            <MaterialIcons name="warning" size={20} color={colors.error} />
            <T weight="medium" style={styles.alertText}>
              {missing} {missing === 1 ? "alarm or reminder is" : "alarms and reminders are"} not set on this iPhone.
            </T>
          </View>
          <Button label={busy ? "Setting…" : missing === 1 ? "Set it again" : `Set the ${missing} missing again`} onPress={setMissing} disabled={busy} />
        </View>
      ) : null}
      <ChoiceField label="Show" options={TRAIN_SHOWS} value={show} onChange={setShow} />
      <T style={styles.note}>
        Save the date of a journey and the app works out when booking opens (advance: 8:00 AM, 60 days before; Tatkal: the day before) and rings your alarms to wake you for it.
      </T>
      <T style={styles.note}>
        {alarmKitInstalled
          ? "This build can set real alarms (they ring like the Clock app, even on silent)."
          : "This build sets reminders as notifications, which are easier to miss. Real alarms need the installed app (AltStore), not Expo Go."}
      </T>
    </View>
  );

  return (
    <View style={styles.page}>
      <AppHeader title="Train alarms" onBack={goBack} />
      <FlatList
        data={journeys ?? []}
        keyExtractor={(j) => j.id}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <View>
            <TrainRow item={item} now={now} marks={checks ? alarmTimeMarks(checks, item.id) : undefined} warning={checks ? droppedText(checks, item.id) : null} onPress={() => router.push({ pathname: "/train-journey", params: { id: item.id } })} />
            <RowDivider />
          </View>
        )}
        ListEmptyComponent={
          journeys === null ? undefined : (
            <T style={styles.empty}>
              {all && all.length > 0
                ? show === "booked"
                  ? "No booked journeys. Open a journey and set Booked to Yes once the ticket is booked."
                  : "Nothing left to book."
                : "No journeys yet. Tap Add journey, pick the date you will travel, and the alarm is set for you."}
            </T>
          )
        }
        contentContainerStyle={{ paddingBottom: 96 }}
      />

      <View style={[styles.actions, { paddingBottom: insets.bottom + 8 }]}>
        <Button label="Add journey" onPress={() => router.push("/train-journey")} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  intro: { padding: 12, gap: 8 },
  alert: { gap: 8, padding: 12, borderRadius: 4, backgroundColor: "#fdecea" },
  alertLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  alertText: { flex: 1, color: colors.error, fontSize: 14 },
  note: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  empty: { textAlign: "center", color: colors.textSecondary, marginTop: 32, marginHorizontal: 32 },
  actions: { flexDirection: "row", gap: 8, paddingTop: 8, paddingHorizontal: 8, backgroundColor: "#fff", ...shadow.high },
});
