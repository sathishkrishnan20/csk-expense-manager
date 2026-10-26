import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { loadCategories } from "../../db/config";
import { listTransactions, type TransactionRecord } from "../../db/transactions";
import type { CategoryDef } from "../../domain/masterData";
import { NO_FILTERS, activeFilterCount, applyFilters, type TransactionFilters } from "../../domain/transactionFilters";
import { AppHeader } from "../../ui/Header";
import { T } from "../../ui/Text";
import { TextButton } from "../../ui/forms";
import { TransactionFiltersPanel } from "../../ui/TransactionFilters";
import { RowDivider, TransactionRow } from "../../ui/TransactionRow";
import { colors } from "../../ui/theme";

export default function Transactions() {
  const router = useRouter();
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
      Promise.all([listTransactions(), loadCategories()]).then(([rows, cats]) => {
        if (!alive) return;
        setItems(rows);
        setCategories(cats);
      });
      return () => {
        alive = false;
      };
    }, []),
  );

  const all = useMemo(() => items ?? [], [items]);
  const shown = useMemo(() => applyFilters(all, filters), [all, filters]);
  const filtered = activeFilterCount(filters) > 0;

  return (
    <View style={styles.page}>
      <AppHeader title="Transactions" />
      <FlatList
        data={shown}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TransactionRow item={item} onPress={() => router.push({ pathname: "/add", params: { id: item.id } })} />
        )}
        ItemSeparatorComponent={RowDivider}
        contentContainerStyle={{ paddingBottom: 32 }}
        ListHeaderComponent={
          items ? (
            <TransactionFiltersPanel
              filters={filters}
              onChange={setFilters}
              categories={categories}
              rows={all}
              shown={shown.length}
              total={all.length}
            />
          ) : undefined
        }
        ListEmptyComponent={
          items ? (
            filtered && all.length > 0 ? (
              <View style={styles.emptyBox}>
                <T style={styles.empty}>No transactions match these filters.</T>
                <TextButton label="Clear filters" onPress={() => setFilters(NO_FILTERS)} />
              </View>
            ) : (
              <T style={styles.empty}>No transactions yet. Tap + to add one or import your bank statement.</T>
            )
          ) : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  emptyBox: { alignItems: "center", marginTop: 48 },
  empty: { textAlign: "center", color: colors.textSecondary, marginTop: 48, marginHorizontal: 32 },
});
