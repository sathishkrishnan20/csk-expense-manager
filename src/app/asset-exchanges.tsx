import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { listExchanges, undoExchange, type ExchangeRecord } from "../db/assetExchanges";
import { describePiece, exchangeWeights } from "../domain/assetExchanges";
import { formatLongDate } from "../domain/format";
import { formatGrams, rupeesText } from "../domain/gifts";
import { confirmAction } from "../platform/dialogs";
import { AppHeader } from "../ui/Header";
import { T } from "../ui/Text";
import { Button, TextButton } from "../ui/forms";
import { colors, shadow } from "../ui/theme";

// The history of exchanges with a shop, newest first: for each, what you gave, what you bought in its place, the weights and what you paid on
// top. A piece opens its asset. "Add bought piece" opens the asset form linked to the exchange; "Undo exchange" holds the given pieces again
// (the pieces bought stay as ordinary assets).
export default function AssetExchangesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [exchanges, setExchanges] = useState<ExchangeRecord[] | null>(null);

  const load = useCallback(() => listExchanges().then(setExchanges), []);
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      listExchanges().then((x) => alive && setExchanges(x));
      return () => {
        alive = false;
      };
    }, []),
  );

  const undo = async (x: ExchangeRecord) => {
    const ok = await confirmAction({
      title: "Undo this exchange?",
      message: "The pieces you gave are held again. The pieces you bought stay as they are.",
      confirmLabel: "Undo",
    });
    if (!ok) return;
    await undoExchange(x.id);
    await load();
  };

  const openPiece = (id: string) => router.push({ pathname: "/asset", params: { id } });

  return (
    <View style={styles.page}>
      <AppHeader title="Exchanges" onBack={() => router.back()} />
      <FlatList
        data={exchanges ?? []}
        keyExtractor={(x) => x.id}
        contentContainerStyle={{ padding: 8, gap: 12, paddingBottom: 96 }}
        ListEmptyComponent={
          exchanges === null ? undefined : <T style={styles.empty}>No exchanges yet. When you give old gold to a shop for new gold, tap Exchange.</T>
        }
        renderItem={({ item: x }) => {
          const w = exchangeWeights(x.given, x.bought);
          return (
            <View style={styles.card}>
              <T weight="medium" style={styles.title}>
                {formatLongDate(x.exchangeDate)}
                {x.shop ? ` · ${x.shop}` : ""}
              </T>

              <T style={styles.section}>Gave to the shop</T>
              {x.given.map((p) => (
                <Pressable key={p.id} onPress={() => openPiece(p.id)}>
                  <T style={styles.piece}>{describePiece(p)}</T>
                </Pressable>
              ))}
              <T weight="medium" style={styles.sum}>Total gave {formatGrams(w.gaveMg)}</T>

              <T style={styles.section}>Bought in its place</T>
              {x.bought.length === 0 ? <T style={styles.none}>Nothing added yet</T> : null}
              {x.bought.map((p) => (
                <Pressable key={p.id} onPress={() => openPiece(p.id)}>
                  <T style={styles.piece}>{describePiece(p)}</T>
                </Pressable>
              ))}
              {x.bought.length > 0 ? <T weight="medium" style={styles.sum}>Total bought {formatGrams(w.gotMg)}</T> : null}

              {x.bought.length > 0 && w.moreMg !== 0 ? (
                <T style={styles.diff}>{w.moreMg > 0 ? `${formatGrams(w.moreMg)} more than you gave` : `${formatGrams(-w.moreMg)} less than you gave`}</T>
              ) : null}
              {x.extraPaise !== null ? <T style={styles.diff}>Extra paid {rupeesText(x.extraPaise)}</T> : null}
              {x.note ? <T style={styles.none}>{x.note}</T> : null}

              <View style={styles.actions}>
                <TextButton label="Add bought piece" onPress={() => router.push({ pathname: "/asset", params: { exchange: x.id } })} />
                <TextButton label="Undo exchange" color={colors.error} onPress={() => undo(x)} />
              </View>
            </View>
          );
        }}
      />
      <View style={[styles.bar, { paddingBottom: insets.bottom + 8 }]}>
        <Button label="New exchange" onPress={() => router.push("/asset-exchange")} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  empty: { textAlign: "center", color: colors.textSecondary, marginTop: 32, marginHorizontal: 32 },
  card: { borderWidth: 1, borderColor: colors.outline, borderRadius: 10, padding: 12, gap: 4, backgroundColor: "#fff" },
  title: { fontSize: 16 },
  section: { color: colors.primary, fontSize: 12, marginTop: 8 },
  piece: { fontSize: 15, paddingVertical: 2 },
  sum: { fontSize: 14, marginTop: 2 },
  none: { color: colors.textSecondary, fontSize: 13 },
  diff: { color: colors.textSecondary, fontSize: 13 },
  actions: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  bar: { paddingTop: 8, paddingHorizontal: 8, backgroundColor: "#fff", ...shadow.high },
});
