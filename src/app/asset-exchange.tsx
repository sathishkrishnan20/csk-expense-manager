import { useCallback, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { createExchange } from "../db/assetExchanges";
import { listAssets, type AssetRecord } from "../db/assets";
import { canGiveInExchange, describePiece, gramsMg, readExchangeForm } from "../domain/assetExchanges";
import { filterAssets, NO_ASSET_FILTERS } from "../domain/assets";
import { toISODate } from "../domain/format";
import { formatGrams } from "../domain/gifts";
import { AppHeader } from "../ui/Header";
import { T } from "../ui/Text";
import { Button, CheckOption, ChoiceField, DateField, OutlinedInput, useSnackbar } from "../ui/forms";
import { colors, shadow } from "../ui/theme";

const ALL = "__all__";

// Gold given to a shop in exchange for new gold. Choose the pieces you gave (only gold you hold and have not pledged), then the shop, the date
// and anything paid on top. Save records it: the pieces leave what you hold but stay on record under Exchanges. "Save and add what I bought"
// then opens the asset form for each new piece, linked to this exchange, so the history shows what you gave and what you got in its place.
export default function AssetExchangeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const snackbar = useSnackbar();
  const [pieces, setPieces] = useState<AssetRecord[] | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [forFilter, setForFilter] = useState(ALL);
  const [shop, setShop] = useState("");
  const [date, setDate] = useState<string | null>(toISODate(new Date()));
  const [extraText, setExtraText] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      listAssets().then((all) => alive && setPieces(all.filter(canGiveInExchange)));
      return () => {
        alive = false;
      };
    }, []),
  );

  const fors = useMemo(() => [...new Set((pieces ?? []).map((p) => p.forName).filter((f): f is string => !!f))], [pieces]);
  const shown = useMemo(
    () => filterAssets(pieces ?? [], { ...NO_ASSET_FILTERS, forName: forFilter === ALL ? null : forFilter }),
    [pieces, forFilter],
  );
  const picked = (pieces ?? []).filter((p) => chosen.includes(p.id));
  const result = readExchangeForm({ date, shop, extraText, note, givenIds: chosen });

  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  const save = async (thenAdd: boolean) => {
    if (!result.ok || busy) return;
    setBusy(true);
    try {
      const id = await createExchange(result.fields, result.givenIds);
      if (thenAdd) router.replace({ pathname: "/asset", params: { exchange: id } });
      else router.replace("/asset-exchanges");
    } catch (err) {
      snackbar.show(err instanceof Error ? err.message : String(err), 4000);
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.select<"padding" | "height" | undefined>({ ios: "padding", android: "height", web: undefined, default: undefined })}>
      <AppHeader title="Exchange with shop" onBack={() => router.back()} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
        <T style={styles.help}>
          Choose the gold you gave to the shop. It goes out of what you hold, and stays on record here. Then add the new gold you bought.
        </T>

        {fors.length > 1 ? (
          <ChoiceField
            label="Show pieces for"
            options={[{ value: ALL, label: "Everyone" }, ...fors.map((f) => ({ value: f, label: f }))]}
            value={forFilter}
            onChange={setForFilter}
          />
        ) : null}

        <View style={styles.list}>
          {pieces === null ? null : shown.length === 0 ? (
            <T style={styles.empty}>No gold to give. Only gold you hold and have not pledged can be given.</T>
          ) : (
            shown.map((p) => <CheckOption key={p.id} label={describePiece(p)} checked={chosen.includes(p.id)} onPress={() => toggle(p.id)} />)
          )}
        </View>
        {picked.length > 0 ? <T style={styles.total}>Giving {picked.length} {picked.length === 1 ? "piece" : "pieces"} · {formatGrams(gramsMg(picked))}</T> : null}

        <OutlinedInput label="Shop (optional)" value={shop} onChangeText={setShop} autoCapitalize="words" />
        <DateField label="Date" value={date} onChange={setDate} />
        <OutlinedInput label="Extra paid (₹, optional)" value={extraText} onChangeText={setExtraText} keyboardType="decimal-pad" />
        <OutlinedInput label="Note (optional)" value={note} onChangeText={setNote} />
        {!result.ok && chosen.length > 0 ? <T style={styles.error}>{result.error}</T> : null}
        <View style={{ height: 80 }} />
      </ScrollView>
      {snackbar.node}
      <View style={[styles.actions, { paddingBottom: insets.bottom + 8 }]}>
        <Button label="Save" onPress={() => save(false)} disabled={!result.ok || busy} style={{ flex: 1 }} />
        <Button label="Save & add bought" color={colors.importAction} onPress={() => save(true)} disabled={!result.ok || busy} style={{ flex: 1 }} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  form: { padding: 8, paddingTop: 16, gap: 12 },
  help: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, paddingHorizontal: 4 },
  list: { gap: 2 },
  empty: { color: colors.textSecondary, paddingHorizontal: 4 },
  total: { color: colors.primary, paddingHorizontal: 4 },
  error: { color: colors.error, fontSize: 14, paddingHorizontal: 4 },
  actions: { flexDirection: "row", gap: 4, paddingTop: 8, paddingHorizontal: 8, backgroundColor: "#fff", ...shadow.high },
});
