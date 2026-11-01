import { useEffect, useMemo, useState, type ReactNode } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { listGroupsWithBalances } from "../db/groups";
import type { TransactionRecord } from "../db/transactions";
import { createdGroupInfo, type GroupWithBalance } from "../domain/groups";
import type { CategoryDef } from "../domain/masterData";
import { keepPresent, selectAll, toggle } from "../domain/selection";
import { NO_FILTERS, activeFilterCount, applyFilters, type TransactionFilters } from "../domain/transactionFilters";
import { T } from "./Text";
import { Button, TextButton } from "./forms";
import { TransactionFiltersPanel } from "./TransactionFilters";
import { RowDivider, TransactionRow } from "./TransactionRow";
import { setPendingDuplicate } from "./pendingDuplicate";
import { colors, shadow } from "./theme";

interface Props {
  groupId: string;
  items: TransactionRecord[] | null; // null while loading
  categories: CategoryDef[];
  filters: TransactionFilters;
  onFiltersChange: (filters: TransactionFilters) => void;
  header?: ReactNode; // above the filters (the group filter)
  resetKey?: string; // changes when the groups shown change, which clears a selection of rows
  groupNames?: ReadonlyMap<string, string>; // when set, each row says which group it is in
  emptyText: string;
}

// One group's transactions with the filters, and the select-then-Duplicate flow: long-press a row to start
// selecting, tick rows (or "Select all" for everything the filters show), then Duplicate.
export function TransactionList({ groupId, items, categories, filters, onFiltersChange, header, emptyText, resetKey, groupNames }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState(false);

  const all = useMemo(() => items ?? [], [items]);

  // The groups that entries here created, so each of those rows can show what is left in its group.
  const [groups, setGroups] = useState<GroupWithBalance[]>([]);
  useEffect(() => {
    if (!all.some((t) => t.createdGroupId)) {
      setGroups([]);
      return;
    }
    let alive = true;
    listGroupsWithBalances().then((gs) => {
      if (alive) setGroups(gs);
    });
    return () => {
      alive = false;
    };
  }, [all]);
  const shown = useMemo(() => applyFilters(all, filters), [all, filters]);
  const filtered = activeFilterCount(filters) > 0;

  // Another group, or a reload that dropped rows, must not leave stale ticks behind.
  useEffect(() => {
    setSelected(new Set());
    setSelecting(false);
  }, [groupId, resetKey]);
  useEffect(() => {
    setSelected((current) => keepPresent(current, all.map((t) => t.id)));
  }, [all]);

  const stopSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const duplicate = () => {
    const rows = all.filter((t) => selected.has(t.id));
    if (rows.length === 0) return;
    // The copies go into the group the rows are in; rows from several groups go into the page's own group.
    const owners = new Set(rows.map((t) => t.groupId));
    setPendingDuplicate(owners.size === 1 ? [...owners][0] : groupId, rows);
    stopSelecting();
    router.push("/duplicate");
  };

  return (
    <View style={styles.page}>
      {selecting ? (
        <View style={styles.bar}>
          <T weight="medium" style={styles.count}>
            {selected.size} selected
          </T>
          <TextButton label="Select all" onPress={() => setSelected(selectAll(shown.map((t) => t.id)))} />
          <TextButton label="Cancel" onPress={stopSelecting} />
          <Button label="Duplicate" onPress={duplicate} disabled={selected.size === 0} />
        </View>
      ) : null}

      <FlatList
        data={shown}
        extraData={selected}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TransactionRow
            item={item}
            createdGroup={createdGroupInfo(groups, item.createdGroupId)}
            groupName={groupNames?.get(item.groupId)}
            selecting={selecting}
            selected={selected.has(item.id)}
            onPress={() =>
              selecting
                ? setSelected((current) => toggle(current, item.id))
                : router.push({ pathname: "/add", params: { id: item.id } })
            }
            onLongPress={() => {
              if (selecting) return;
              setSelecting(true);
              setSelected(new Set([item.id]));
            }}
          />
        )}
        ItemSeparatorComponent={RowDivider}
        contentContainerStyle={{ paddingBottom: 32 }}
        ListHeaderComponent={
          <>
            {header}
            {items ? (
              <TransactionFiltersPanel
                filters={filters}
                onChange={onFiltersChange}
                categories={categories}
                rows={all}
                shown={shown.length}
                total={all.length}
              />
            ) : null}
          </>
        }
        ListEmptyComponent={
          items ? (
            filtered && all.length > 0 ? (
              <View style={styles.emptyBox}>
                <T style={styles.empty}>No transactions match these filters.</T>
                <TextButton label="Clear filters" onPress={() => onFiltersChange(NO_FILTERS)} />
              </View>
            ) : (
              <T style={styles.empty}>{emptyText}</T>
            )
          ) : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  bar: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: "#fff", ...shadow.low },
  count: { flex: 1, fontSize: 15 },
  emptyBox: { alignItems: "center", marginTop: 48 },
  empty: { textAlign: "center", color: colors.textSecondary, marginTop: 48, marginHorizontal: 32 },
});
