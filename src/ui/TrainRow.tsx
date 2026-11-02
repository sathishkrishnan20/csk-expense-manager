import { Pressable, StyleSheet, View } from "react-native";
import { formatLongDate, toISODate } from "../domain/format";
import { describeStatus, formatClock, journeyStatus } from "../domain/trainAlarms";
import type { JourneyRecord } from "../db/trainJourneys";
import { T } from "./Text";
import { colors } from "./theme";

// One journey in the list, laid out like a gift or transaction row: the journey and its date; when booking opens (and how soon);
// and the time of the wake-up alarm. A journey that is over is dimmed.
export function TrainRow({ item, now, onPress }: { item: JourneyRecord; now: Date; onPress: () => void }) {
  const status = journeyStatus(item, now);
  const over = status.phase === "past";
  const open = status.phase === "open";
  const wakeAt = new Date(status.opensAt.getTime() - item.wakeLeadMinutes * 60_000);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, over && { opacity: 0.5 }, pressed && { backgroundColor: "#f6f2ff" }]}
    >
      <View style={styles.line}>
        <T weight="medium" style={styles.left} numberOfLines={1}>
          {item.label}
        </T>
        <T style={{ color: colors.grayText }}>{formatLongDate(item.journeyDate)}</T>
      </View>

      <View style={styles.line}>
        <T style={[styles.left, { fontSize: 14 }]} numberOfLines={1}>
          {status.kind === "tatkal" ? "Tatkal" : "Booking"} opens {formatLongDate(toISODate(status.opensAt))}, {formatClock(status.opensAt)}
        </T>
        <T weight="medium" style={{ color: open ? colors.creditText : colors.primary, fontSize: 13 }}>
          {describeStatus(status)}
        </T>
      </View>

      {over ? null : (
        <T weight="light" style={{ fontSize: 14 }} numberOfLines={1}>
          Wake-up alarm {formatClock(wakeAt)}
          {item.note ? ` · ${item.note}` : ""}
        </T>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { backgroundColor: "#fff", padding: 8 },
  line: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, minHeight: 24 },
  left: { flex: 1 },
});
