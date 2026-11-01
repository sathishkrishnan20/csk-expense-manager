import { useCallback, useEffect, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { loadCategories } from "../db/config";
import { listGroupsWithBalances } from "../db/groups";
import { listTransactions, type TransactionRecord } from "../db/transactions";
import type { GroupWithBalance } from "../domain/groups";
import { scopeKey, spansSeveralGroups, type GroupScope } from "../domain/groupScope";
import type { CategoryDef } from "../domain/masterData";
import { NO_FILTERS, type TransactionFilters } from "../domain/transactionFilters";
import { GroupFilter } from "./GroupFilter";
import { TransactionList } from "./TransactionList";
import { colors } from "./theme";

// The transactions of the groups chosen in the Group filter (the page's own group to begin with; one, several or all), newest first, with
// the other filters and select-then-duplicate. `header` is the page's title bar.
export function TransactionsView({ groupId, header }: { groupId: string; header: ReactNode }) {
  const [items, setItems] = useState<TransactionRecord[] | null>(null);
  const [categories, setCategories] = useState<CategoryDef[]>([]);
  const [filters, setFilters] = useState<TransactionFilters>(NO_FILTERS);
  const [groups, setGroups] = useState<GroupWithBalance[]>([]);
  const [scope, setScope] = useState<GroupScope>([groupId]);
  useEffect(() => setScope([groupId]), [groupId]); // another page group starts on that group again
  const key = scopeKey(scope);
  // Home's "couldn't categorise" card links here; the value changes on every press so it applies each time.
  // "See All" on Home also changes on every press and starts the page on its own group again, whatever was picked in the Group filter.
  const { review, fresh } = useLocalSearchParams<{ review?: string; fresh?: string }>();
  useEffect(() => {
    if (review) {
      setFilters({ ...NO_FILTERS, uncategorised: "unresolved" });
      setScope([groupId]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review]);
  useEffect(() => {
    if (fresh) setScope([groupId]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      Promise.all([listTransactions(scope), loadCategories(), listGroupsWithBalances()]).then(([rows, cats, gs]) => {
        if (!alive) return;
        setItems(rows);
        setCategories(cats);
        setGroups(gs);
      });
      return () => {
        alive = false;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]),
  );

  return (
    <View style={styles.page}>
      {header}
      <TransactionList
        groupId={groupId}
        header={<GroupFilter groups={groups} scope={scope} onChange={setScope} />}
        resetKey={key}
        groupNames={spansSeveralGroups(scope) ? new Map(groups.map((g) => [g.id, g.name])) : undefined}
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
