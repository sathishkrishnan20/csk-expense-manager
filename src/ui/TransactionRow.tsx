import { Pressable, StyleSheet, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { formatLongDate, formatRupees } from "../domain/format";
import type { TransactionRecord } from "../db/transactions";
import { UNRESOLVED } from "../domain/classificationOutcome";
import { PENDING_AI } from "../domain/taxonomy";
import { SOURCE_LABEL } from "../domain/transactionSource";
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
  createdGroup = null,
  groupName,
}: {
  item: TransactionRecord;
  createdGroup?: { name: string; balancePaise: number } | null; // the group this entry created, with what is left in it
  groupName?: string; // the group the entry is in, shown when the list covers several groups
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
        <T style={styles.date} numberOfLines={1}>
          {formatLongDate(item.txnDate)}
          {groupName ? ` · ${groupName}` : ""}
        </T>

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

        {createdGroup ? (
          <T style={[styles.groupLine, createdGroup.balancePaise < 0 && { color: colors.error }]} numberOfLines={1}>
            {createdGroup.name} · Balance {formatRupees(createdGroup.balancePaise)}
          </T>
        ) : null}

        <View style={styles.line}>
          <T weight="light" style={[styles.left, { fontSize: 14 }]} numberOfLines={1}>
            {item.description ?? ""}
          </T>
          <View style={styles.tags}>
            {item.paymentMethod ? <T weight="light">{item.paymentMethod}</T> : null}
            <T style={styles.source}>{SOURCE_LABEL[item.source]}</T>
          </View>
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
    groupLine: { color: colors.primary, fontSize: 13 },
    tags: { flexDirection: "row", alignItems: "center", gap: 8 },
    source: { fontSize: 11, color: colors.textSecondary, borderWidth: 1, borderColor: colors.outline, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 },
    divider: { height: 1.5, backgroundColor: colors.rowDivider },
  });
