import { useCallback, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { alarmKitInstalled } from "../alarms/alarmKit";
import { listJourneys, type JourneyRecord } from "../db/trainJourneys";
import { journeyStatus } from "../domain/trainAlarms";
import { AppHeader } from "../ui/Header";
import { RowDivider } from "../ui/TransactionRow";
import { T } from "../ui/Text";
import { Button } from "../ui/forms";
import { TrainRow } from "../ui/TrainRow";
import { useGoBack } from "../ui/useGoBack";
import { colors, shadow } from "../ui/theme";

// Train journeys and the alarms for when their booking opens. Information only: not transactions, no category, no balance. Saving a
// journey sets the alarms (alarms/sync.ts); this page lists them, soonest journey first, with journeys already over at the end.
export default function TrainScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const insets = useSafeAreaInsets();
  const [journeys, setJourneys] = useState<JourneyRecord[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      listJourneys().then((list) => {
        if (!alive) return;
        // Journeys that are over go below the ones still ahead.
        const now = new Date();
        const over = (j: JourneyRecord) => journeyStatus(j, now).phase === "past";
        setJourneys([...list.filter((j) => !over(j)), ...list.filter(over)]);
      });
      return () => {
        alive = false;
      };
    }, []),
  );

  const now = new Date();
  const header = (
    <View style={styles.intro}>
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
            <TrainRow item={item} now={now} onPress={() => router.push({ pathname: "/train-journey", params: { id: item.id } })} />
            <RowDivider />
          </View>
        )}
        ListEmptyComponent={
          journeys === null ? undefined : <T style={styles.empty}>No journeys yet. Tap Add journey, pick the date you will travel, and the alarm is set for you.</T>
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
  note: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  empty: { textAlign: "center", color: colors.textSecondary, marginTop: 32, marginHorizontal: 32 },
  actions: { flexDirection: "row", gap: 8, paddingTop: 8, paddingHorizontal: 8, backgroundColor: "#fff", ...shadow.high },
});
