import { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { importGifts, listOccasions, type OccasionSummary } from "../db/gifts";
import { excelToCSV, isExcelBinary } from "../domain/excelReader";
import { formatLongDate, toISODate } from "../domain/format";
import {
  GIFT_DIRECTIONS,
  describeGift,
  giftTotals,
  occasionKey,
  parseGiftList,
  totalsLines,
  type GiftDirection,
} from "../domain/gifts";
import { notify } from "../platform/dialogs";
import { readPickedBytes } from "../platform/files";
import { AppHeader } from "../ui/Header";
import { T } from "../ui/Text";
import { Button, DateField, OutlinedInput, Segmented, TextButton, useSnackbar } from "../ui/forms";
import { colors, fonts, shadow } from "../ui/theme";

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

interface Edit {
  title?: string;
  date?: string;
  direction?: GiftDirection;
}

// Bring in a notebook or sheet in one go: paste it (or choose a CSV or Excel file). A line with one cell is a heading (an occasion),
// lines with a name and a gift are gifts. Each occasion's name, date and Received/Given can be fixed before saving, and gifts can be
// left out. A name that is already an occasion adds to that one and keeps its date.
export default function GiftImport() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const snackbar = useSnackbar();

  const [text, setText] = useState("");
  const [defaultDate, setDefaultDate] = useState(toISODate(new Date()));
  const [edits, setEdits] = useState<Record<number, Edit>>({});
  const [left, setLeft] = useState<Set<number>>(new Set()); // gifts unticked in the preview, by line
  const [existing, setExisting] = useState<OccasionSummary[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listOccasions().then(setExisting);
  }, []);

  const parsed = useMemo(() => parseGiftList(text), [text]);

  const occasions = parsed.map((o, index) => {
    const edit = edits[index] ?? {};
    const title = edit.title ?? o.title;
    const direction = edit.direction ?? o.direction;
    const match = title.trim() === "" ? undefined : existing.find((x) => occasionKey(x.title) === occasionKey(title));
    const date = match ? match.date : (edit.date ?? defaultDate);
    const gifts = o.gifts.filter((g) => !g.issue && !left.has(g.line));
    return { index, source: o, title, direction, date, match, gifts };
  });

  const chosen = occasions.reduce((n, o) => n + o.gifts.length, 0);
  const total = parsed.reduce((n, o) => n + o.gifts.length, 0);
  const problems = parsed.reduce((n, o) => n + o.gifts.filter((g) => g.issue).length, 0);
  const warnings = parsed.reduce((n, o) => n + o.gifts.filter((g) => g.warning).length, 0);
  const missingTitle = occasions.some((o) => o.gifts.length > 0 && o.title.trim() === "");

  const changeText = (next: string) => {
    setText(next);
    setEdits({});
    setLeft(new Set());
  };
  const edit = (index: number, change: Edit) => setEdits((current) => ({ ...current, [index]: { ...current[index], ...change } }));
  const toggle = (line: number) =>
    setLeft((current) => {
      const next = new Set(current);
      if (!next.delete(line)) next.add(line);
      return next;
    });

  const upload = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
      if (picked.canceled) return;
      const bytes = await readPickedBytes(picked.assets[0]);
      changeText(isExcelBinary(bytes) ? excelToCSV(bytes) : new TextDecoder().decode(bytes));
    } catch (err) {
      notify(message(err));
    }
  };

  const save = async () => {
    if (chosen === 0 || missingTitle || busy) return;
    setBusy(true);
    try {
      const result = await importGifts(
        occasions.map((o) => ({
          title: o.title,
          date: o.date,
          direction: o.direction,
          gifts: o.gifts.map((g) => ({ name: g.name, type: g.type, value: g.value, unit: g.unit, ratePaise: null, note: g.note })),
        })),
      );
      snackbar.show(`${result.gifts} ${result.gifts === 1 ? "gift" : "gifts"} added`, 1200);
      setTimeout(() => router.back(), 900);
    } catch (err) {
      setBusy(false);
      snackbar.show(message(err), 3000);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <AppHeader title="Import gifts" onBack={() => router.back()} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
        <T style={styles.help}>
          Paste your list as you keep it: a line with just a name is a heading (the occasion), and the lines under it are a name and what they gave
          ("Kannaki 3 gram gold", "Ramesh 100000Rs", "Nisha Bangle"). Blank lines separate occasions. You can check and fix everything below before it is
          saved. Gifts you write as "1G" are read as gold.
        </T>
        <View style={styles.buttons}>
          <Button label="Choose file" onPress={upload} style={{ flex: 1 }} />
        </View>

        <TextInput
          value={text}
          onChangeText={changeText}
          multiline
          placeholder={"Thishika Hair Offering\nKannan\t1000\nKartheesan\t1G gold"}
          placeholderTextColor={colors.textSecondary}
          style={styles.paste}
          textAlignVertical="top"
          autoCapitalize="none"
          autoCorrect={false}
          selectionColor={colors.primary}
        />
        {text !== "" ? <TextButton label="Clear" onPress={() => changeText("")} /> : null}

        <DateField label="Date for new occasions" value={defaultDate} onChange={setDefaultDate} />

        {parsed.length > 0 ? (
          <T weight="medium" style={styles.listTitle}>
            {chosen} of {total} {total === 1 ? "gift" : "gifts"} in {parsed.length} {parsed.length === 1 ? "occasion" : "occasions"} will be added
            {problems > 0 ? ` · ${problems} can't be added` : ""}
            {warnings > 0 ? ` · ${warnings} to check` : ""}
          </T>
        ) : null}

        {occasions.map((o) => {
          const totals = totalsLines(giftTotals(o.gifts));
          return (
            <View key={o.index} style={styles.occasion}>
              <OutlinedInput label="Occasion" value={o.title} onChangeText={(title) => edit(o.index, { title })} autoCapitalize="words" />
              {o.match ? (
                <T style={styles.small}>Already an occasion ({formatLongDate(o.match.date)}). These gifts are added to it and its date stays.</T>
              ) : (
                <DateField label="Occasion date" value={o.date} onChange={(date) => edit(o.index, { date })} />
              )}
              <Segmented options={GIFT_DIRECTIONS} value={o.direction} onChange={(direction) => edit(o.index, { direction })} />
              {totals.length > 0 ? <T style={styles.small}>{totals.join(" · ")}</T> : null}

              {o.source.gifts.map((g) => {
                const on = !g.issue && !left.has(g.line);
                const tint = o.direction === "received" ? colors.creditText : colors.debitText;
                return (
                  <Pressable
                    key={g.line}
                    onPress={() => (g.issue ? undefined : toggle(g.line))}
                    disabled={!!g.issue}
                    style={[styles.row, !on && { opacity: g.issue ? 1 : 0.45 }, g.issue ? styles.rowBad : g.warning ? styles.rowWarn : null]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on, disabled: !!g.issue }}
                  >
                    <MaterialIcons
                      name={g.issue ? "error-outline" : on ? "check-box" : "check-box-outline-blank"}
                      size={24}
                      color={g.issue ? colors.error : on ? colors.primary : colors.textSecondary}
                    />
                    <View style={{ flex: 1 }}>
                      <T numberOfLines={2}>{g.name || "(no name)"}</T>
                      {g.issue ? <T style={styles.error}>{g.issue}</T> : g.warning ? <T style={styles.warn}>{g.warning}</T> : null}
                    </View>
                    {!g.issue ? (
                      <T weight="bold" style={{ color: tint }}>
                        {describeGift(g)}
                      </T>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          );
        })}
        <View style={{ height: 80 }} />
      </ScrollView>

      {snackbar.node}

      <View style={[styles.actions, { paddingBottom: insets.bottom + 8 }]}>
        <Button
          label={missingTitle ? "Name every occasion" : `Add ${chosen} ${chosen === 1 ? "gift" : "gifts"}`}
          onPress={save}
          disabled={chosen === 0 || missingTitle || busy}
          style={{ flex: 1 }}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  form: { padding: 8, paddingTop: 16, gap: 12 },
  help: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, paddingHorizontal: 4 },
  buttons: { flexDirection: "row", gap: 8 },
  paste: {
    minHeight: 140,
    maxHeight: 280,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: 4,
    backgroundColor: "#fff",
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.text,
  },
  listTitle: { marginTop: 8, marginLeft: 4 },
  occasion: { gap: 10, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.primaryTint },
  small: { color: colors.textSecondary, fontSize: 12, paddingHorizontal: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fff", borderRadius: 6, padding: 8, borderWidth: 1, borderColor: colors.outline },
  rowBad: { borderColor: colors.error, backgroundColor: "#fdecea" },
  rowWarn: { borderColor: "#e0a030", backgroundColor: "#fff4e5" },
  error: { color: colors.error, fontSize: 13 },
  warn: { color: "#7a4a00", fontSize: 13 },
  actions: { flexDirection: "row", gap: 4, paddingTop: 8, paddingHorizontal: 8, backgroundColor: "#fff", ...shadow.high },
});
