import { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { loadCategories } from "../db/config";
import { listGroupsWithBalances } from "../db/groups";
import { addEntries, type NewEntry } from "../db/transactions";
import { buildDuplicates, futureDateWarning, type DateRule } from "../domain/duplicate";
import {
  copyGroupName,
  endOfMonth,
  incomeClassFor,
  openingIncomeFor,
  heldOpening,
  suggestGroup,
  validateNewGroups,
  type GroupPlan,
} from "../domain/entryGroup";
import { formatLongDate, formatRupees, parseAmountInput, toISODate } from "../domain/format";
import { MAIN_GROUP_ID, type Group } from "../domain/groups";
import type { CategoryDef } from "../domain/masterData";
import { AppHeader } from "../ui/Header";
import { T } from "../ui/Text";
import { Button, CheckOption, DateField, OutlinedInput, Segmented, SelectField, useSnackbar } from "../ui/forms";
import { clearPendingDuplicate, getPendingDuplicate } from "../ui/pendingDuplicate";
import { colors, shadow } from "../ui/theme";

type Mode = "shift" | "date";

const MODES: { value: Mode; label: string }[] = [
  { value: "shift", label: "Move by months" },
  { value: "date", label: "One date for all" },
];

// What the owner changed about the group a copy would create; anything not changed is the suggestion.
interface GroupEdit {
  on?: boolean;
  name?: string;
  startDate?: string;
  endDate?: string;
}

// Copies the rows ticked in a list as new hand entries with new dates. The copies go into the same group
// by default; the group field changes that. Amounts can be edited and rows left out before saving. A copy of an
// entry that created a group can create a new group too: its name and dates are shown here, ready to edit.
export default function DuplicateTransactions() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const snackbar = useSnackbar();
  const pending = useMemo(() => getPendingDuplicate(), []);
  const rows = useMemo(() => pending?.rows ?? [], [pending]);

  const [mode, setMode] = useState<Mode>("shift");
  const [months, setMonths] = useState("1");
  const [date, setDate] = useState(toISODate(new Date()));
  const [targetId, setTargetId] = useState(pending?.groupId ?? MAIN_GROUP_ID);
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [categories, setCategories] = useState<CategoryDef[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.id, String(r.amountPaise / 100)])),
  );
  const [left, setLeft] = useState<Set<string>>(new Set()); // rows unticked in the preview
  const [groupEdits, setGroupEdits] = useState<Record<string, GroupEdit>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!pending || rows.length === 0) router.back();
    let alive = true;
    Promise.all([listGroupsWithBalances(), loadCategories()]).then(([gs, cats]) => {
      if (!alive) return;
      setAllGroups(gs);
      setCategories(cats);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The target can be any open group, or the one the rows came from.
  const groups = useMemo(() => allGroups.filter((g) => g.status === "ACTIVE" || g.id === pending?.groupId), [allGroups, pending]);

  const monthCount = /^\d{1,2}$/.test(months.trim()) ? Number(months.trim()) : 0;
  const rule: DateRule = mode === "date" ? { mode: "date", date } : { mode: "shift", months: monthCount };
  const ruleValid = mode === "date" || monthCount >= 1;

  const drafts = useMemo(() => buildDuplicates(rows, rule, targetId), [rows, mode, date, monthCount, targetId]); // eslint-disable-line react-hooks/exhaustive-deps
  const chosen = drafts.filter((d) => !left.has(d.sourceId));
  const amountOf = (sourceId: string) => parseAmountInput(amounts[sourceId] ?? "");
  const badAmount = chosen.some((d) => amountOf(d.sourceId) === null);
  const warning = futureDateWarning(chosen, targetId, toISODate(new Date()));

  // The group each copy would create. Only entries that created a group offer one; it sits under the group the copy goes into.
  const groupFor = (sourceId: string, txnDate: string): { offered: boolean; on: boolean; plan: GroupPlan } => {
    const source = rows.find((r) => r.id === sourceId);
    const offered = !!source?.createdGroupId;
    const edit = groupEdits[sourceId] ?? {};
    const baseName = allGroups.find((g) => g.id === source?.createdGroupId)?.name ?? (source ? suggestGroup(source).name : "");
    return {
      offered,
      on: offered && (edit.on ?? true),
      plan: {
        name: edit.name ?? copyGroupName(baseName, txnDate),
        startDate: edit.startDate ?? txnDate,
        endDate: edit.endDate ?? endOfMonth(txnDate),
      },
    };
  };
  const planned = chosen.map((d) => ({ sourceId: d.sourceId, ...groupFor(d.sourceId, d.txnDate) })).filter((p) => p.on);
  const groupErrors = validateNewGroups(
    planned.map((p) => p.plan),
    allGroups.map((g) => g.name),
  );
  const errorOf = (sourceId: string) => groupErrors[planned.findIndex((p) => p.sourceId === sourceId)] ?? null;
  const hasGroupError = groupErrors.some((e) => e !== null);

  const canCreate = ruleValid && chosen.length > 0 && !badAmount && !hasGroupError && !saving;
  const targetName = groups.find((g) => g.id === targetId)?.name ?? "Main";
  const sourceDate = (sourceId: string) => rows.find((r) => r.id === sourceId)?.txnDate ?? "";

  const toggleRow = (sourceId: string) =>
    setLeft((current) => {
      const next = new Set(current);
      if (!next.delete(sourceId)) next.add(sourceId);
      return next;
    });
  const edit = (sourceId: string, change: GroupEdit) => setGroupEdits((all) => ({ ...all, [sourceId]: { ...all[sourceId], ...change } }));

  const create = async () => {
    if (!canCreate) return;
    setSaving(true);
    try {
      const incomeClass = incomeClassFor(categories);
      const entries: NewEntry[] = chosen.map((d) => {
        const amountPaise = amountOf(d.sourceId) as number;
        const g = groupFor(d.sourceId, d.txnDate);
        return {
          input: { ...d, amountPaise },
          group: g.on
            ? {
                name: g.plan.name.trim(),
                startDate: g.plan.startDate,
                endDate: g.plan.endDate,
                parentId: targetId,
                opening: openingIncomeFor({ ...d, amountPaise }, incomeClass, targetName),
                heldPaise: heldOpening(d.direction, amountPaise, true),
              }
            : undefined,
        };
      });
      await addEntries(entries);
      clearPendingDuplicate();
      const made = entries.filter((e) => e.group).length;
      snackbar.show(`${chosen.length} added to ${targetName}${made > 0 ? ` and ${made} ${made === 1 ? "group" : "groups"} created` : ""}`, 1200);
      setTimeout(() => router.back(), 900);
    } catch (err) {
      setSaving(false);
      snackbar.show(err instanceof Error ? err.message : String(err), 3000);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <AppHeader
        title="Duplicate"
        onBack={() => {
          clearPendingDuplicate();
          router.back();
        }}
      />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
        <Segmented options={MODES} value={mode} onChange={setMode} />
        {mode === "shift" ? (
          <OutlinedInput label="Months later" value={months} onChangeText={setMonths} keyboardType="number-pad" />
        ) : (
          <DateField label="Date for all copies" value={date} onChange={setDate} />
        )}
        <SelectField
          label="Into group"
          value={targetName}
          options={groups.map((g) => g.name)}
          onChange={(name) => setTargetId(groups.find((g) => g.name === name)?.id ?? MAIN_GROUP_ID)}
        />

        {warning ? <T style={styles.warning}>{warning}</T> : null}
        {planned.length > 0 ? (
          <T style={styles.warning}>
            {planned.length === 1 ? "1 new group" : `${planned.length} new groups`} will be created, each starting with an income equal to the copy's
            amount. Their names and dates are below; change them if you like. To copy only the entry, untick "Create a new group" on that copy.
          </T>
        ) : null}

        <T weight="medium" style={styles.listTitle}>
          {chosen.length} of {rows.length} will be created
        </T>
        {drafts.map((d) => {
          const on = !left.has(d.sourceId);
          const invalid = on && amountOf(d.sourceId) === null;
          const g = groupFor(d.sourceId, d.txnDate);
          const error = errorOf(d.sourceId);
          return (
            <View key={d.sourceId} style={[styles.row, !on && { opacity: 0.45 }]}>
              <Pressable onPress={() => toggleRow(d.sourceId)} style={styles.rowTop} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                <MaterialIcons name={on ? "check-box" : "check-box-outline-blank"} size={24} color={on ? colors.primary : colors.textSecondary} />
                <View style={{ flex: 1 }}>
                  <T numberOfLines={1}>{d.label}</T>
                  <T style={styles.small}>
                    {ruleValid ? formatLongDate(d.txnDate) : "Enter the number of months"} · was {formatLongDate(sourceDate(d.sourceId))}
                  </T>
                </View>
                <T weight="bold" style={{ color: d.direction === "credit" ? colors.creditText : colors.debitText }}>
                  {d.direction === "credit" ? "+" : "-"}
                  {formatRupees(amountOf(d.sourceId) ?? 0)}
                </T>
              </Pressable>
              {on ? (
                <View style={{ marginTop: 10, gap: 10 }}>
                  <OutlinedInput
                    label={invalid ? "Amount (enter a valid amount)" : "Amount"}
                    value={amounts[d.sourceId] ?? ""}
                    onChangeText={(t) => setAmounts((a) => ({ ...a, [d.sourceId]: t }))}
                    keyboardType="decimal-pad"
                  />
                  {g.offered ? (
                    <>
                      <CheckOption
                        label="Create a new group for this copy"
                        hint={`The original entry created a group. The copy stays in ${targetName}, and the new group sits under it.`}
                        checked={g.on}
                        onPress={() => edit(d.sourceId, { on: !g.on })}
                      />
                      {g.on ? (
                        <>
                          <OutlinedInput label="Group name" value={g.plan.name} onChangeText={(name) => edit(d.sourceId, { name })} autoCapitalize="words" />
                          <DateField label="Group start date" value={g.plan.startDate} onChange={(startDate) => edit(d.sourceId, { startDate })} />
                          <DateField label="Group end date" value={g.plan.endDate} onChange={(endDate) => edit(d.sourceId, { endDate })} />
                          <T style={styles.small}>It starts with an income of {formatRupees(amountOf(d.sourceId) ?? 0)}.</T>
                          {error ? <T style={styles.error}>{error}</T> : null}
                        </>
                      ) : null}
                    </>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}
        <View style={{ height: 80 }} />
      </ScrollView>

      {snackbar.node}

      <View style={[styles.actions, { paddingBottom: insets.bottom + 8 }]}>
        <Button
          label={`Create ${chosen.length} ${chosen.length === 1 ? "entry" : "entries"}${planned.length > 0 ? ` and ${planned.length} ${planned.length === 1 ? "group" : "groups"}` : ""}`}
          onPress={create}
          disabled={!canCreate}
          style={{ flex: 1 }}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  form: { padding: 8, paddingTop: 16, gap: 12 },
  warning: { backgroundColor: "#fff4e5", color: "#7a4a00", padding: 10, borderRadius: 6, fontSize: 13, lineHeight: 19 },
  listTitle: { marginTop: 8, marginLeft: 4 },
  row: { backgroundColor: "#fff", borderRadius: 6, padding: 8, borderWidth: 1, borderColor: colors.outline },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  small: { color: colors.textSecondary, fontSize: 12 },
  error: { color: colors.error, fontSize: 13 },
  actions: { flexDirection: "row", gap: 4, paddingTop: 8, paddingHorizontal: 8, backgroundColor: "#fff", ...shadow.high },
});
