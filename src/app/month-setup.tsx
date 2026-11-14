import { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { loadSetupInputs, setUpMonth } from "../db/monthTemplate";
import { parseAmountInput } from "../domain/format";
import { monthLabel, planSetup, type MonthTemplate, type PlannedEntry, type SetupChanges, emptyTemplate } from "../domain/monthTemplate";
import { monthOf } from "../domain/savingsEntries";
import { AppHeader } from "../ui/Header";
import { T } from "../ui/Text";
import { Button, OutlinedInput, SelectField } from "../ui/forms";
import { colors, shadow } from "../ui/theme";

const nextMonthOf = (month: string): string => {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};

// "Set up December?": a preview of every group and entry the monthly template would make for the month. Amounts and days can be changed here for this month only (the template is not
// changed), an empty amount (a salary) must be filled in, and nothing is created until the owner confirms.
export default function MonthSetupScreen() {
  const { month: monthParam } = useLocalSearchParams<{ month?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const now = monthOf(new Date());
  const choices = [now, nextMonthOf(now)];
  const [month, setMonth] = useState(typeof monthParam === "string" && choices.includes(monthParam) ? monthParam : now);
  const [template, setTemplate] = useState<MonthTemplate>(emptyTemplate());
  const [names, setNames] = useState<string[]>([]);
  const [lineAmount, setLineAmount] = useState<Record<string, string>>({});
  const [lineDay, setLineDay] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadSetupInputs().then(({ template: t, existingNames }) => {
      if (!alive) return;
      setTemplate(t);
      setNames(existingNames);
      setLineAmount(Object.fromEntries(t.lines.map((l) => [l.id, l.amountPaise === null ? "" : String(l.amountPaise / 100)])));
      setLineDay(Object.fromEntries(t.lines.map((l) => [l.id, String(l.day)])));
    });
    return () => {
      alive = false;
    };
  }, []);

  // What the owner typed, as changes for this month; an unreadable or empty amount stays unfilled (the plan then says what is missing).
  const changes = useMemo<SetupChanges>(
    () => ({ line: Object.fromEntries(template.lines.map((l) => [l.id, { amountPaise: parseAmountInput(lineAmount[l.id] ?? ""), day: Number(lineDay[l.id] ?? l.day) }])) }),
    [template, lineAmount, lineDay],
  );
  const plan = useMemo(() => planSetup(template, month, changes, names), [template, month, changes, names]);
  const home = plan.groups.find((g) => g.home);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await setUpMonth(month, changes);
      router.navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  const entryRow = (e: PlannedEntry) => (
    <View key={e.lineId} style={styles.lineBlock}>
      <T numberOfLines={1}>{`${e.direction === "credit" ? "Income from" : "Expense to"} ${e.payee} · ${e.date}`}</T>
      <View style={styles.pair}>
        <View style={{ flex: 2 }}>
          <OutlinedInput label="Amount" value={lineAmount[e.lineId] ?? ""} onChangeText={(v) => setLineAmount({ ...lineAmount, [e.lineId]: v })} keyboardType="decimal-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <OutlinedInput label="Day" value={lineDay[e.lineId] ?? ""} onChangeText={(v) => setLineDay({ ...lineDay, [e.lineId]: v })} keyboardType="number-pad" />
        </View>
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <AppHeader title={`Set up ${monthLabel(month).split(" ")[0]}`} onBack={() => router.back()} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <SelectField label="Month" value={monthLabel(month)} options={choices.map(monthLabel)} onChange={(label) => setMonth(choices.find((m) => monthLabel(m) === label) ?? month)} />
        <T style={styles.note}>Check what will be made. Changing an amount or a day here is for this month only; the template stays as it is. Nothing is created until you press Set up.</T>

        {plan.mainLines.length > 0 ? (
          <View style={styles.card}>
            <T weight="medium" style={styles.title}>In Main</T>
            {plan.mainLines.map((e) => entryRow(e))}
          </View>
        ) : null}
        {plan.groups.map((g) => (
          <View key={g.templateId} style={styles.card}>
            <T weight="medium" style={styles.title}>{g.name}</T>
            <T style={styles.sub}>{`${g.parentTemplateId === null ? "Under Main" : "Under the group above"} · ${g.startDate} to ${g.endDate}`}</T>
            <T style={styles.sectionLabel}>{`Made by this entry in ${g.parentTemplateId === null ? "Main" : plan.groups.find((x) => x.templateId === g.parentTemplateId)?.name ?? "the group above"}:`}</T>
            {entryRow(g.funding)}
            {g.lines.map((e) => entryRow(e))}
            {g.fundsHere ? <T style={styles.tag}>Mutual fund purchases will go here</T> : null}
          </View>
        ))}

        {home ? <T style={styles.note}>{`Home will switch to "${home.name}".`}</T> : null}
        {plan.problems.map((p) => (
          <T key={p} style={styles.error}>{p}</T>
        ))}
        {error ? <T style={styles.error}>{error}</T> : null}
        <View style={{ height: 80 }} />
      </ScrollView>
      <View style={[styles.actions, { paddingBottom: insets.bottom + 8 }]}>
        <Button label={busy ? "Setting up…" : "Set up"} onPress={confirm} disabled={busy || plan.problems.length > 0} style={{ flex: 1 }} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { padding: 8, gap: 12 },
  note: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, paddingHorizontal: 4 },
  card: { backgroundColor: "#fff", borderRadius: 8, padding: 12, gap: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(0,0,0,0.12)" },
  title: { fontSize: 16 },
  sub: { color: colors.textSecondary, fontSize: 12 },
  sectionLabel: { fontSize: 13, marginTop: 4 },
  lineBlock: { gap: 4, borderTopWidth: StyleSheet.hairlineWidth, borderColor: "rgba(0,0,0,0.12)", paddingTop: 8 },
  pair: { flexDirection: "row", gap: 8 },
  tag: { fontSize: 12, color: colors.primary },
  error: { color: colors.error, fontSize: 14, paddingHorizontal: 4 },
  actions: { flexDirection: "row", gap: 4, paddingTop: 8, paddingHorizontal: 8, backgroundColor: "#fff", ...shadow.high },
});
