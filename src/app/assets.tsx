import { useCallback, useMemo, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { listAssets, type AssetRecord } from "../db/assets";
import { ASSET_SHOWS, ASSET_TYPES, NO_ASSET_FILTERS, filterAssets, hasAssetFilters, type AssetFilters } from "../domain/assets";
import { toISODate } from "../domain/format";
import { AppHeader } from "../ui/Header";
import { AssetRow } from "../ui/AssetRow";
import { RowDivider } from "../ui/TransactionRow";
import { T } from "../ui/Text";
import { Button, ChoiceField, OutlinedInput, TextButton } from "../ui/forms";
import { colors, shadow } from "../ui/theme";

const ALL_TYPES = "all";
const TYPE_CHOICES = [{ value: ALL_TYPES, label: "All types" }, ...ASSET_TYPES.map((t) => ({ value: t.value as string, label: t.label }))];

// Gold, land, mutual funds and the rest, as a flat list like Transactions: search, a Type dropdown and a Show dropdown (what you hold,
// what is pledged, what you sold). Information only; nothing here is part of any balance, and there is no total at the top.
export default function AssetsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [assets, setAssets] = useState<AssetRecord[] | null>(null);
  const [filters, setFilters] = useState<AssetFilters>(NO_ASSET_FILTERS);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      listAssets().then((a) => {
        if (alive) setAssets(a);
      });
      return () => {
        alive = false;
      };
    }, []),
  );

  const shown = useMemo(() => filterAssets(assets ?? [], filters), [assets, filters]);
  const filtered = hasAssetFilters(filters);
  const today = toISODate(new Date());

  const add = () => router.push({ pathname: "/asset", params: filters.type ? { type: filters.type } : {} });

  const header = (
    <View style={styles.filters}>
      <OutlinedInput label="Search name, lender or description" value={filters.search} onChangeText={(search) => setFilters({ ...filters, search })} />
      <ChoiceField
        label="Type"
        options={TYPE_CHOICES}
        value={filters.type ?? ALL_TYPES}
        onChange={(v) => setFilters({ ...filters, type: v === ALL_TYPES ? null : (ASSET_TYPES.find((t) => t.value === v)?.value ?? null) })}
      />
      <ChoiceField label="Show" options={ASSET_SHOWS} value={filters.show} onChange={(show) => setFilters({ ...filters, show })} />
      {filtered ? <TextButton label="Clear filters" onPress={() => setFilters(NO_ASSET_FILTERS)} /> : null}
    </View>
  );

  return (
    <View style={styles.page}>
      <AppHeader title="Assets" onBack={() => router.back()} />
      <FlatList
        data={shown}
        keyExtractor={(a) => a.id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <View>
            <AssetRow item={item} today={today} onPress={() => router.push({ pathname: "/asset", params: { id: item.id } })} />
            <RowDivider />
          </View>
        )}
        ListEmptyComponent={
          assets === null ? undefined : (
            <T style={styles.empty}>
              {assets.length === 0 ? "No assets yet. Tap Add asset to start with your gold." : "No assets match. Clear the filters to see them all."}
            </T>
          )
        }
        contentContainerStyle={{ paddingBottom: 96 }}
      />

      <View style={[styles.actions, { paddingBottom: insets.bottom + 8 }]}>
        <Button label="Add asset" onPress={add} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  filters: { padding: 8, paddingTop: 16, gap: 12 },
  empty: { textAlign: "center", color: colors.textSecondary, marginTop: 32, marginHorizontal: 32 },
  actions: { flexDirection: "row", gap: 8, paddingTop: 8, paddingHorizontal: 8, backgroundColor: "#fff", ...shadow.high },
});
