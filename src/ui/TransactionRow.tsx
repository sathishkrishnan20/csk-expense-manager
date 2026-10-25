import { Pressable, StyleSheet, View } from "react-native";
import { formatLongDate, formatRupees } from "../domain/format";
import type { TransactionRecord } from "../db/transactions";
import { T } from "./Text";
import { colors } from "./theme";

// One row of the web app's transaction list: date; payee and amount;
// category : subcategory and balance; description and payment method.
export function TransactionRow({ item, onPress }: { item: TransactionRecord; onPress: () => void }) {
  const credit = item.direction === "credit";
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: "#f6f2ff" }]}>
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
          {item.category} : {item.subcategory}
        </T>
        {item.balancePaise !== null ? <T weight="bold">{formatRupees(item.balancePaise)}</T> : null}
      </View>

      <View style={styles.line}>
        <T weight="light" style={[styles.left, { fontSize: 14 }]} numberOfLines={1}>
          {item.description ?? ""}
        </T>
        {item.paymentMethod ? <T weight="light">{item.paymentMethod}</T> : null}
      </View>
    </Pressable>
  );
}

export function RowDivider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  row: { backgroundColor: "#fff", padding: 8 },
  date: { color: colors.grayText },
  line: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, minHeight: 24 },
  left: { flex: 1 },
  divider: { height: 1.5, backgroundColor: colors.rowDivider },
});
