import { Pressable, StyleSheet, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { formatLongDate, formatRupees } from "../domain/format";
import type { TransactionRecord } from "../db/transactions";
import { UNRESOLVED } from "../domain/classificationOutcome";
import { PENDING_AI } from "../domain/taxonomy";
import { T } from "./Text";
import { colors } from "./theme";

// One row of the web app's transaction list: date; payee and amount;
// category : subcategory and balance; description and payment method.
// While a selection is being made (select, then Duplicate) the row shows a checkbox and a tap ticks it.
// A long press starts the selection.
export function TransactionRow({
  item,
  onPress,
  onLongPress,
  selecting = false,
  selected = false,
}: {
  item: TransactionRecord;
  onPress: () => void;
  onLongPress?: () => void;
  selecting?: boolean;
  selected?: boolean;
}) {
  const credit = item.direction === "credit";
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityState={selecting ? { selected } : undefined}
      style={({ pressed }) => [
        styles.row,
        selecting && styles.selectingRow,
        selected && { backgroundColor: colors.primaryTint },
        pressed && { backgroundColor: "#f6f2ff" },
      ]}
    >
      {selecting ? (
        <MaterialIcons
          name={selected ? "check-box" : "check-box-outline-blank"}
          size={24}
          color={selected ? colors.primary : colors.textSecondary}
        />
      ) : null}
      <View style={styles.content}>
        <T style={styles.date}>{formatLongDate(item.txnDate)}</T>

        <View style={styles.line}>
          <T style={styles.left} numberOfLines={1}>
            {item.payee ?? ""}
          </T>
          <T weight="black" style={{ color: credit ? colors.creditText : colors.debitText }}>
            {formatRupees(item.amountPaise)}
          </T>
        </View>

        <View style={styles.line}>
          <T style={styles.left} numberOfLines={1}>
            {item.classifiedBy === PENDING_AI
              ? "Waiting for AI"
              : item.classifiedBy === UNRESOLVED
                ? "Couldn't categorise · tap to choose"
                : `${item.category} : ${item.subcategory}`}
          </T>
          {item.balancePaise !== null ? <T weight="bold">{formatRupees(item.balancePaise)}</T> : null}
        </View>

        <View style={styles.line}>
          <T weight="light" style={[styles.left, { fontSize: 14 }]} numberOfLines={1}>
            {item.description ?? ""}
          </T>
          {item.paymentMethod ? <T weight="light">{item.paymentMethod}</T> : null}
        </View>
        </View>
      </Pressable>
    );
  }

  export function RowDivider() {
    return <View style={styles.divider} />;
  }

  const styles = StyleSheet.create({
    row: { backgroundColor: "#fff", padding: 8 },
    selectingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    content: { flex: 1 },
    date: { color: colors.grayText },
    line: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, minHeight: 24 },
    left: { flex: 1 },
    divider: { height: 1.5, backgroundColor: colors.rowDivider },
  });
