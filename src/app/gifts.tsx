import { useCallback, useMemo, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { listGifts, listOccasions, type GiftRecord, type OccasionSummary } from "../db/gifts";
import { GIFT_DIRECTIONS, NO_GIFT_FILTERS, filterGifts, hasGiftFilters, type DirectionFilter, type GiftFilters } from "../domain/gifts";
import { AppHeader } from "../ui/Header";
import { GiftRow } from "../ui/GiftRow";
import { RowDivider } from "../ui/TransactionRow";
import { T } from "../ui/Text";
import { Button, OutlinedInput, Segmented, SelectField, TextButton } from "../ui/forms";
import { colors, shadow } from "../ui/theme";

const ALL_OCCASIONS = "All occasions";
const DIRECTIONS: { value: DirectionFilter; label: string }[] = [{ value: "all", label: "All" }, ...GIFT_DIRECTIONS];

// Gifts received and given at functions, as a flat list like Transactions: search by name, gift or occasion, filter by occasion
// and Received/Given. Information only; nothing here is part of any balance, so there is no overview or total on the page.
export default function GiftsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [gifts, setGifts] = useState<GiftRecord[] | null>(null);
  const [occasions, setOccasions] = useState<OccasionSummary[]>([]);
  const [filters, setFilters] = useState<GiftFilters>(NO_GIFT_FILTERS);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      Promise.all([listGifts(), listOccasions()]).then(([g, o]) => {
        if (!alive) return;
        setGifts(g);
        setOccasions(o);
        // An occasion that no longer has gifts cannot stay selected in the filter.
        setFilters((f) => (f.occasionId !== null && !o.some((x) => x.id === f.occasionId) ? { ...f, occasionId: null } : f));
      });
      return () => {
        alive = false;
      };
    }, []),
  );

  const shown = useMemo(() => filterGifts(gifts ?? [], filters), [gifts, filters]);
  const occasionTitle = occasions.find((o) => o.id === filters.occasionId)?.title ?? ALL_OCCASIONS;
  const filtered = hasGiftFilters(filters);

  const add = () => router.push({ pathname: "/gift", params: filters.occasionId ? { occasion: filters.occasionId } : {} });

  const header = (
    <View>
      <View style={styles.filters}>
        <OutlinedInput
          label="Search name, gift or occasion"
          value={filters.search}
          onChangeText={(search) => setFilters({ ...filters, search })}
        />
        {occasions.length > 0 ? (
          <SelectField
            label="Occasion"
            value={occasionTitle}
            options={[ALL_OCCASIONS, ...occasions.map((o) => o.title)]}
            onChange={(title) => setFilters({ ...filters, occasionId: occasions.find((o) => o.title === title)?.id ?? null })}
          />
        ) : null}
        <Segmented options={DIRECTIONS} value={filters.direction} onChange={(direction) => setFilters({ ...filters, direction })} />
        {filtered ? <TextButton label="Clear filters" onPress={() => setFilters(NO_GIFT_FILTERS)} /> : null}
      </View>
    </View>
  );

  return (
    <View style={styles.page}>
      <AppHeader title="Gifts" onBack={() => router.back()} />
      <FlatList
        data={shown}
        keyExtractor={(g) => g.id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <View>
            <GiftRow item={item} onPress={() => router.push({ pathname: "/gift", params: { id: item.id } })} />
            <RowDivider />
          </View>
        )}
        ListEmptyComponent={
          gifts === null ? undefined : (
            <T style={styles.empty}>
              {gifts.length === 0
                ? "No gifts yet. Tap Add gift, or Import list to bring in your notebook."
                : "No gifts match. Clear the filters to see them all."}
            </T>
          )
        }
        contentContainerStyle={{ paddingBottom: 96 }}
      />

      <View style={[styles.actions, { paddingBottom: insets.bottom + 8 }]}>
        <Button label="Import list" color={colors.importAction} onPress={() => router.push("/gift-import")} style={{ flex: 1 }} />
        <Button label="Add gift" onPress={add} style={{ flex: 1 }} />
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
