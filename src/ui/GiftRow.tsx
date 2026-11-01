import { Pressable, StyleSheet, View } from "react-native";
import { formatLongDate } from "../domain/format";
import { describeGift, estimatedPaise, rupeesText, showsNoteLine } from "../domain/gifts";
import type { GiftRecord } from "../db/gifts";
import { T } from "./Text";
import { colors } from "./theme";

// One gift in the flat list, laid out like a transaction row: the occasion and its date (with Received or Given); the name and
// what was given; the note and, when the gold or silver has a price, what it was worth that day.
export function GiftRow({ item, onPress }: { item: GiftRecord; onPress: () => void }) {
  const received = item.direction === "received";
  const tint = received ? colors.creditText : colors.debitText;
  const worth = estimatedPaise(item);
  const note = showsNoteLine(item) ? item.note : null;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: "#f6f2ff" }]}>
      <View style={styles.line}>
        <T style={[styles.left, styles.date]} numberOfLines={1}>
          {item.occasionTitle} · {formatLongDate(item.occasionDate)}
        </T>
        <T weight="medium" style={{ color: tint, fontSize: 13 }}>
          {received ? "Received" : "Given"}
        </T>
      </View>

      <View style={styles.line}>
        <T style={styles.left} numberOfLines={1}>
          {item.name}
        </T>
        <T weight="black" style={{ color: tint }}>
          {describeGift(item)}
        </T>
      </View>

      {note || worth !== null ? (
        <View style={styles.line}>
          <T weight="light" style={[styles.left, { fontSize: 14 }]} numberOfLines={1}>
            {note ?? ""}
          </T>
          {worth !== null ? (
            <T weight="light" style={{ fontSize: 14 }}>
              Worth then {rupeesText(worth)}
            </T>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { backgroundColor: "#fff", padding: 8 },
  line: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, minHeight: 24 },
  left: { flex: 1 },
  date: { color: colors.grayText },
});
