import { Pressable, StyleSheet, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { formatLongDate, formatRupees } from "../domain/format";
import { balanceOf, groupDatesLabel, type GroupWithBalance } from "../domain/groups";
import { T } from "./Text";
import { colors, shadow } from "./theme";

// A group's name, dates and balance. `compact` is the narrow card in Home's strip.
export function GroupCard({ group, onPress, compact = false }: { group: GroupWithBalance; onPress: () => void; compact?: boolean }) {
  const balance = balanceOf(group);
  const dates = groupDatesLabel(group, formatLongDate);
  return (
    <Pressable onPress={onPress} style={[styles.card, compact ? styles.compact : styles.full]} accessibilityRole="button">
      <View style={styles.titleRow}>
        <T weight="bold" numberOfLines={1} style={styles.name}>
          {group.name}
        </T>
        {group.status === "CLOSED" ? <MaterialIcons name="lock-outline" size={16} color={colors.textSecondary} /> : null}
      </View>
      {dates ? (
        <T numberOfLines={1} style={styles.dates}>
          {dates}
        </T>
      ) : null}
      <T weight="black" style={[styles.balance, { color: balance < 0 ? colors.error : colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
        {formatRupees(balance)}
      </T>
      {!compact ? (
        <View style={styles.inOut}>
          <T style={{ color: colors.creditText, fontSize: 13 }}>In {formatRupees(group.inPaise)}</T>
          <T style={{ color: colors.debitText, fontSize: 13 }}>Out {formatRupees(group.outPaise)}</T>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#fff", borderRadius: 8, padding: 12, gap: 2, ...shadow.low },
  compact: { width: 160 },
  full: { marginHorizontal: 12, marginVertical: 6 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 },
  name: { flex: 1, fontSize: 15 },
  dates: { color: colors.grayText, fontSize: 12 },
  balance: { fontSize: 18, marginTop: 4 },
  inOut: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
});
