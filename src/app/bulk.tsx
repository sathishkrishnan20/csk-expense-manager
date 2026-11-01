import { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { loadCategories } from "../db/config";
import { listGroupsWithBalances } from "../db/groups";
import { resolveHomeGroupId } from "../db/homeGroup";
import { addEntries } from "../db/transactions";
import { BULK_HEADER, BULK_TEMPLATE_FILE_NAME, bulkTemplateCsv, parseBulkList } from "../domain/bulkList";
import { excelToCSV, isExcelBinary } from "../domain/excelReader";
import { formatLongDate, formatRupees, toISODate } from "../domain/format";
import { MAIN_GROUP_ID, type Group } from "../domain/groups";
import type { CategoryDef } from "../domain/masterData";
import type { Direction } from "../domain/taxonomy";
import { notify } from "../platform/dialogs";
import { readPickedBytes, saveCsvFile } from "../platform/files";
import { AppHeader } from "../ui/Header";
import { T } from "../ui/Text";
import { Button, DateField, Segmented, SelectField, TextButton, useSnackbar } from "../ui/forms";
import { colors, fonts, shadow } from "../ui/theme";

const TYPES: { value: Direction; label: string }[] = [
  { value: "debit", label: "Expense" },
  { value: "credit", label: "Credit" },
];

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

// Add many hand entries at once: paste rows copied from Excel, or choose a CSV or Excel file (a template can be
// downloaded). Each row is a payee and an amount; a row with no category is left for the AI ("Categorise later").
export default function AddList() {
  const { group } = useLocalSearchParams<{ group?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const snackbar = useSnackbar();

  const [text, setText] = useState("");
  const [date, setDate] = useState(toISODate(new Date()));
  const [direction, setDirection] = useState<Direction>("debit");
  const [groupId, setGroupId] = useState(group || MAIN_GROUP_ID);
  const [groups, setGroups] = useState<Group[]>([]);
  const [categories, setCategories] = useState<CategoryDef[]>([]);
  const [left, setLeft] = useState<Set<number>>(new Set()); // rows unticked in the preview, by line
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!group) resolveHomeGroupId().then((id) => alive && setGroupId(id)); // from the Home tabs: the home group
    Promise.all([listGroupsWithBalances(), loadCategories()]).then(([gs, cats]) => {
      if (!alive) return;
      setGroups(gs.filter((g) => g.status === "ACTIVE" || g.id === groupId));
      setCategories(cats);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = useMemo(() => parseBulkList(text, categories), [text, categories]);
  const chosen = rows.filter((r) => !r.issue && !left.has(r.line));
  const problems = rows.filter((r) => r.issue).length;
  const total = chosen.reduce((n, r) => n + r.amountPaise, 0);

  // A category decides the type when the row gives no type (Income categories already make a row a credit).
  const typeOf = (r: (typeof rows)[number]): Direction => r.direction ?? (r.category ? "debit" : direction);
  const dateOf = (r: (typeof rows)[number]) => r.date ?? date;

  const groupName = groups.find((g) => g.id === groupId)?.name ?? "Main";
  const today = toISODate(new Date());
  const future = groupId === MAIN_GROUP_ID && chosen.some((r) => dateOf(r) > today);

  const changeText = (next: string) => {
    setText(next);
    setLeft(new Set());
  };

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

  const downloadTemplate = async () => {
    try {
      await saveCsvFile(BULK_TEMPLATE_FILE_NAME, bulkTemplateCsv(), "Template for adding a list");
    } catch (err) {
      notify(message(err));
    }
  };

  const toggle = (line: number) =>
    setLeft((current) => {
      const next = new Set(current);
      if (!next.delete(line)) next.add(line);
      return next;
    });

  const create = async () => {
    if (chosen.length === 0 || busy) return;
    setBusy(true);
    try {
      await addEntries(
        chosen.map((r) => ({
          input: {
            groupId,
            txnDate: dateOf(r),
            direction: typeOf(r),
            amountPaise: r.amountPaise,
            category: r.category,
            subcategory: r.subcategory,
            categoriseLater: !r.category,
            payee: r.name,
            paymentMethod: r.paymentMethod,
            description: r.description,
          },
        })),
      );
      snackbar.show(`${chosen.length} added to ${groupName}`, 1200);
      setTimeout(() => router.back(), 900);
    } catch (err) {
      setBusy(false);
      snackbar.show(message(err), 3000);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <AppHeader title="Add a list" onBack={() => router.back()} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
        <T style={styles.help}>
          Paste rows below the header, or choose a CSV or Excel file. Only Payee and Amount are needed (*); the rest can be left out. Columns
          follow the header's order, or paste your own header row first and its columns can be in any order. A row with no date gets the date picked
          below, and a row with no category is left for the AI.
        </T>
        <View style={styles.buttons}>
          <Button label="Choose file" onPress={upload} style={{ flex: 1 }} />
          <Button label="Download template" onPress={downloadTemplate} color={colors.importAction} style={{ flex: 1 }} />
        </View>

        {/* The header is fixed above the rows, so pasting can never replace it. */}
        <View style={styles.pasteBox}>
          <View style={styles.headerStrip}>
            {BULK_HEADER.map((h) => (
              <T key={h} weight="medium" style={styles.headerCell}>
                {h}
                {h === "Payee" || h === "Amount" ? " *" : ""}
              </T>
            ))}
          </View>
          <TextInput
            value={text}
            onChangeText={changeText}
            multiline
            placeholder={"Room Rent\t24000\nInternet Bill\t1030"}
            placeholderTextColor={colors.textSecondary}
            style={styles.paste}
            textAlignVertical="top"
            autoCapitalize="none"
            autoCorrect={false}
            selectionColor={colors.primary}
          />
        </View>
        {text !== "" ? <TextButton label="Clear" onPress={() => changeText("")} /> : null}

        <Segmented options={TYPES} value={direction} onChange={setDirection} />
        <DateField label="Date for rows without one" value={date} onChange={setDate} />
        <SelectField
          label="Into group"
          value={groupName}
          options={groups.map((g) => g.name)}
          onChange={(name) => setGroupId(groups.find((g) => g.name === name)?.id ?? MAIN_GROUP_ID)}
        />

        {future ? (
          <T style={styles.warning}>
            Some entries are dated in the future. If you import your bank statement later, the real rows will be added as well, so they would be counted
            twice. Consider adding them to a group instead.
          </T>
        ) : null}

        {rows.length > 0 ? (
          <>
            <T weight="medium" style={styles.listTitle}>
              {chosen.length} of {rows.length} will be added · {formatRupees(total)}
              {problems > 0 ? ` · ${problems} can't be added` : ""}
            </T>
            {rows.map((r) => {
              const on = !r.issue && !left.has(r.line);
              return (
                <Pressable
                  key={r.line}
                  onPress={() => (r.issue ? undefined : toggle(r.line))}
                  disabled={!!r.issue}
                  style={[styles.row, !on && { opacity: r.issue ? 1 : 0.45 }, r.issue ? styles.rowBad : null]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on, disabled: !!r.issue }}
                >
                  <MaterialIcons
                    name={r.issue ? "error-outline" : on ? "check-box" : "check-box-outline-blank"}
                    size={24}
                    color={r.issue ? colors.error : on ? colors.primary : colors.textSecondary}
                  />
                  <View style={{ flex: 1 }}>
                    <T numberOfLines={2}>{r.name || "(no name)"}</T>
                    {r.issue ? (
                      <T style={styles.error}>{r.issue}</T>
                    ) : (
                      <T style={styles.small}>
                        {formatLongDate(dateOf(r))} · {typeOf(r) === "credit" ? "Credit" : "Expense"} ·{" "}
                        {r.category ? `${r.category} : ${r.subcategory}` : "AI will categorise"}
                      </T>
                    )}
                  </View>
                  {!r.issue || r.amountPaise > 0 ? (
                    <T weight="bold" style={{ color: typeOf(r) === "credit" ? colors.creditText : colors.debitText }}>
                      {formatRupees(r.amountPaise)}
                    </T>
                  ) : null}
                </Pressable>
              );
            })}
          </>
        ) : null}
        <View style={{ height: 80 }} />
      </ScrollView>

      {snackbar.node}

      <View style={[styles.actions, { paddingBottom: insets.bottom + 8 }]}>
        <Button
          label={`Add ${chosen.length} ${chosen.length === 1 ? "entry" : "entries"}`}
          onPress={create}
          disabled={chosen.length === 0 || busy}
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
  pasteBox: { borderWidth: 1, borderColor: colors.outline, borderRadius: 4, overflow: "hidden", backgroundColor: "#fff" },
  headerStrip: { flexDirection: "row", flexWrap: "wrap", columnGap: 12, rowGap: 2, padding: 10, backgroundColor: colors.primaryTint },
  headerCell: { color: colors.primary, fontSize: 13 },
  paste: {
    minHeight: 130,
    maxHeight: 260,
    padding: 12,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.text,
  },
  warning: { backgroundColor: "#fff4e5", color: "#7a4a00", padding: 10, borderRadius: 6, fontSize: 13, lineHeight: 19 },
  listTitle: { marginTop: 8, marginLeft: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderRadius: 6,
    padding: 8,
    borderWidth: 1,
    borderColor: colors.outline,
  },
  rowBad: { borderColor: colors.error, backgroundColor: "#fdecea" },
  small: { color: colors.textSecondary, fontSize: 12 },
  error: { color: colors.error, fontSize: 13 },
  actions: { flexDirection: "row", gap: 4, paddingTop: 8, paddingHorizontal: 8, backgroundColor: "#fff", ...shadow.high },
});
