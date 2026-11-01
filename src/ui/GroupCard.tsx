import { Pressable, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import { formatLongDate, formatRupees } from "../domain/format";
import { balanceOf, groupDatesLabel, totalInPaise, totalOutPaise, type GroupWithBalance } from "../domain/groups";
import { T } from "./Text";
import { colors, shadow } from "./theme";

// A group's name, dates and balance (which includes the groups under it). `compact` is the narrow card in Home's strip,
// `parentName` says where a subgroup sits, `depth` indents a card in the tree, and `onTogglePin` adds the pin button.
export function GroupCard({
  group,
  onPress,
  compact = false,
  depth = 0,
  parentName,
  onTogglePin,
  home = false,
  onToggleHome,
}: {
  group: GroupWithBalance;
  onPress: () => void;
  compact?: boolean;
  depth?: number;
  parentName?: string | null;
  onTogglePin?: () => void;
  home?: boolean; // the group the app opens on
  onToggleHome?: () => void;
}) {
  const balance = balanceOf(group);
  const dates = groupDatesLabel(group, formatLongDate);
  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, compact ? styles.compact : [styles.full, { marginLeft: 12 + depth * 20 }]]}
      accessibilityRole="button"
    >
      <View style={styles.titleRow}>
        <T weight="bold" numberOfLines={1} style={styles.name}>
          {group.name}
        </T>
        {group.status === "CLOSED" ? <MaterialIcons name="lock-outline" size={16} color={colors.textSecondary} /> : null}
        {onToggleHome ? (
          <Pressable onPress={onToggleHome} hitSlop={10} accessibilityLabel={home ? "Home group" : "Show on Home"}>
            <MaterialCommunityIcons name={home ? "home" : "home-outline"} size={22} color={home ? colors.primary : colors.textSecondary} />
          </Pressable>
        ) : home ? (
          <MaterialCommunityIcons name="home" size={14} color={colors.primary} />
        ) : null}
        {onTogglePin ? (
          <Pressable onPress={onTogglePin} hitSlop={10} accessibilityLabel={group.pinned ? "Unpin from Home" : "Pin to Home"}>
            <MaterialCommunityIcons
              name={group.pinned ? "pin" : "pin-outline"}
              size={20}
              color={group.pinned ? colors.primary : colors.textSecondary}
            />
          </Pressable>
        ) : group.pinned ? (
          <MaterialCommunityIcons name="pin" size={14} color={colors.primary} />
        ) : null}
      </View>
      {parentName ? (
        <T numberOfLines={1} style={styles.dates}>
          in {parentName}
        </T>
      ) : null}
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
          <T style={{ color: colors.creditText, fontSize: 13 }}>In {formatRupees(totalInPaise(group))}</T>
          <T style={{ color: colors.debitText, fontSize: 13 }}>Out {formatRupees(totalOutPaise(group))}</T>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#fff", borderRadius: 8, padding: 12, gap: 2, ...shadow.low },
  compact: { width: 160 },
  full: { marginRight: 12, marginVertical: 6 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 },
  name: { flex: 1, fontSize: 15 },
  dates: { color: colors.grayText, fontSize: 12 },
  balance: { fontSize: 18, marginTop: 4 },
  inOut: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8, marginTop: 4 },
});
