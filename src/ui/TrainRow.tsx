import { Pressable, StyleSheet, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { formatLongDate, toISODate } from "../domain/format";
import { describeStatus, formatClock, formatHm, journeyStatus } from "../domain/trainAlarms";
import type { JourneyRecord } from "../db/trainJourneys";
import { T } from "./Text";
import { colors } from "./theme";

// One journey in the list, laid out like a gift or transaction row: the journey and its date; when booking opens (and how soon);
// and the time the alarms start, or "Booked" and the PNR once it is booked (no alarms then). A journey that is over is dimmed.
// marks: whether iOS holds each alarm time of this journey ("HH:MM" to true or false); a time with no entry shows no mark.
// warning: shown under the journey when iOS does not hold all its alarms, so the owner knows to open it and update.
export function TrainRow({ item, now, marks, warning, onPress }: { item: JourneyRecord; now: Date; marks?: Record<string, boolean>; warning?: string | null; onPress: () => void }) {
  const status = journeyStatus(item, now);
  const over = status.phase === "past";
  const open = status.phase === "open";

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
          {status.tatkal ? "Tatkal" : "Booking"} opens {formatLongDate(toISODate(status.opensAt))}, {formatClock(status.opensAt)}
        </T>
        <T weight="medium" style={{ color: item.booked || open ? colors.creditText : colors.primary, fontSize: 13 }}>
          {item.booked ? "Booked" : describeStatus(status)}
        </T>
      </View>

      {over ? null : (
        <View style={styles.alarms}>
          {item.booked ? (
            <T weight="light" style={styles.small}>
              {item.pnr ? `PNR ${item.pnr}` : "No alarms: booked"}
            </T>
          ) : (
            <>
              <T weight="light" style={styles.small}>
                Alarms
              </T>
              {item.alarmTimes.map((hm) => (
                <View key={hm} style={styles.time}>
                  <T weight="light" style={styles.small}>
                    {formatHm(hm)}
                  </T>
                  {marks && hm in marks ? (
                    <MaterialIcons
                      name={marks[hm] ? "check-circle" : "cancel"}
                      size={16}
                      color={marks[hm] ? colors.creditText : colors.error}
                      accessibilityLabel={marks[hm] ? "Alarm is set" : "Alarm is not set"}
                    />
                  ) : null}
                </View>
              ))}
            </>
          )}
          {item.note ? (
            <T weight="light" style={styles.small}>
              · {item.note}
            </T>
          ) : null}
        </View>
      )}

      {warning && !over ? (
        <View style={styles.warning}>
          <MaterialIcons name="warning" size={16} color={colors.error} />
          <T style={styles.warningText}>{warning}</T>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { backgroundColor: "#fff", padding: 8 },
  line: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, minHeight: 24 },
  left: { flex: 1 },
  alarms: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 10, rowGap: 2 },
  time: { flexDirection: "row", alignItems: "center", gap: 3 },
  small: { fontSize: 14 },
  warning: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 4 },
  warningText: { flex: 1, color: colors.error, fontSize: 13, lineHeight: 18 },
});
