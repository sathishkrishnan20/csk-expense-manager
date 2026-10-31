import { useCallback, useEffect, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { loadCategories } from "../db/config";
import { listTransactions, type TransactionRecord } from "../db/transactions";
import type { CategoryDef } from "../domain/masterData";
import { NO_FILTERS, type TransactionFilters } from "../domain/transactionFilters";
import { TransactionList } from "./TransactionList";
import { colors } from "./theme";

// Every transaction of one group (Main is a group too), newest first, with the filters and select-then-duplicate.
// `header` is the page's title bar.
export function TransactionsView({ groupId, header }: { groupId: string; header: ReactNode }) {
  const [items, setItems] = useState<TransactionRecord[] | null>(null);
  const [categories, setCategories] = useState<CategoryDef[]>([]);
  const [filters, setFilters] = useState<TransactionFilters>(NO_FILTERS);
  // Home's "couldn't categorise" card links here; the value changes on every press so it applies each time.
  const { review } = useLocalSearchParams<{ review?: string }>();
  useEffect(() => {
    if (review) setFilters({ ...NO_FILTERS, uncategorised: "unresolved" });
  }, [review]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      Promise.all([listTransactions(groupId), loadCategories()]).then(([rows, cats]) => {
        if (!alive) return;
        setItems(rows);
        setCategories(cats);
      });
      return () => {
        alive = false;
      };
    }, [groupId]),
  );

  return (
    <View style={styles.page}>
      {header}
      <TransactionList
        groupId={groupId}
        items={items}
        categories={categories}
        filters={filters}
        onFiltersChange={setFilters}
        emptyText="No transactions yet. Tap + to add one or import your bank statement."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
});
