import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { loadCategories } from "../db/config";
import { approveSuggestions, listSuggestions, listUnsuggested, type SuggestionEntry, type UnsuggestedEntry } from "../db/suggestions";
import { removeSuggestions } from "../import/suggestionStore";
import { formatLongDate, formatRupees } from "../domain/format";
import type { CategoryDef } from "../domain/masterData";
import { describeStatus, suggestionKey, suggestionStatus, tidyName, validateSuggestion } from "../domain/suggestions";
import type { Direction } from "../domain/taxonomy";
import { AppHeader } from "../ui/Header";
import { T } from "../ui/Text";
import { CategoryPicker } from "../ui/CategoryPicker";
import { Button, TextButton } from "../ui/forms";
import { colors } from "../ui/theme";

interface Edit {
  category: string;
  subcategory: string;
}

interface SuggestionGroup {
  key: string;
  direction: Direction;
  suggestion: Edit;
  entries: SuggestionEntry[];
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

// Entries the AI could not place, with where it thinks each belongs. Entries with the same suggestion sit in one card; the
// names can be edited there. Approve adds the names to the category list (if new) and files the entry under them.
export default function Suggestions() {
  // Set when Re-classify sends you here: how that run went.
  const params = useLocalSearchParams<{ moved?: string; still?: string; total?: string; skipped?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [entries, setEntries] = useState<SuggestionEntry[] | null>(null);
  const [unsuggested, setUnsuggested] = useState<UnsuggestedEntry[]>([]);
  const [master, setMaster] = useState<CategoryDef[]>([]);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState({ approved: 0, rejected: 0 });

  const load = useCallback(async () => {
    const [list, none, cats] = await Promise.all([listSuggestions(), listUnsuggested(), loadCategories()]);
    setEntries(list);
    setUnsuggested(none);
    setMaster(cats);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const groups = useMemo(() => {
    const byKey = new Map<string, SuggestionGroup>();
    for (const e of entries ?? []) {
      const key = suggestionKey(e.suggestion);
      const group = byKey.get(key);
      if (group) group.entries.push(e);
      else byKey.set(key, { key, direction: e.direction, suggestion: e.suggestion, entries: [e] });
    }
    return [...byKey.values()];
  }, [entries]);

  const editOf = (g: SuggestionGroup): Edit => edits[g.key] ?? g.suggestion;
  const setEdit = (g: SuggestionGroup, value: Edit) => setEdits((all) => ({ ...all, [g.key]: value }));

  // The category chosen for an entry the AI had no suggestion for, by entry id; a credit starts under Income.
  const [picks, setPicks] = useState<Record<string, Edit>>({});
  const pickOf = (e: UnsuggestedEntry): Edit => picks[e.id] ?? { category: e.direction === "credit" ? "Income" : "", subcategory: "" };
  const saveOwn = (e: UnsuggestedEntry) => {
    const pick = pickOf(e);
    return run(`own:${e.id}`, "approved", 1, () => approveSuggestions([e.id], e.direction === "credit" ? "Income" : pick.category, pick.subcategory));
  };

  const run = async (key: string, kind: "approved" | "rejected", count: number, action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setErrors((all) => ({ ...all, [key]: "" }));
    try {
      await action();
      setDone((d) => ({ ...d, [kind]: d[kind] + count }));
      await load();
    } catch (err) {
      setErrors((all) => ({ ...all, [key]: message(err) }));
    } finally {
      setBusy(false);
    }
  };

  const approve = (g: SuggestionGroup, ids: string[]) => {
    const edit = editOf(g);
    return run(g.key, "approved", ids.length, () =>
      approveSuggestions(ids, g.direction === "credit" ? "Income" : edit.category, edit.subcategory),
    );
  };
  const reject = (g: SuggestionGroup, ids: string[]) => run(g.key, "rejected", ids.length, async () => removeSuggestions(ids));

  const total = Number(params.total);
  const summary = params.total && total > 0 ? { total, moved: Number(params.moved) || 0, still: Number(params.still) || 0, skipped: Number(params.skipped) || 0 } : null;
  const reviewed = done.approved + done.rejected;

  return (
    <View style={styles.page}>
      <AppHeader title="AI suggestions" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        {summary ? (
          <View style={styles.summary}>
            <T weight="medium">
              {summary.moved} categorised out of {summary.total}
            </T>
            <T weight="medium" style={{ color: colors.error }}>
              {summary.still} uncategorised out of {summary.total}
            </T>
            {summary.skipped > 0 ? <T style={styles.small}>{summary.skipped} not processed.</T> : null}
          </View>
        ) : null}

        {entries === null ? null : groups.length === 0 && unsuggested.length === 0 ? (
          <View style={styles.doneBox}>
            <T weight="medium" style={{ fontSize: 16 }}>
              {reviewed > 0 ? "All reviewed" : "Nothing to review"}
            </T>
            <T style={styles.help}>
              {reviewed > 0
                ? `${done.approved} approved, ${done.rejected} rejected.${done.approved > 0 ? " The approved categories are now in Config > Categories." : ""}`
                : "When the AI cannot place an entry it also suggests a category here, for you to approve or reject."}
            </T>
            <View style={styles.actions}>
              <Button label="Go to Home" onPress={() => router.navigate("/")} style={{ flex: 1 }} />
              <Button label="Open Config" onPress={() => router.navigate("/config")} color={colors.importAction} style={{ flex: 1 }} />
            </View>
          </View>
        ) : groups.length === 0 ? null : (
          <T style={styles.help}>
            The AI could not place these entries in your categories, so it suggests where they could go. Approve adds the category or subcategory to
            your list and files the entry under it. Reject leaves the entry in Others : Uncategorised. You can change the names first. Suggestions you do not answer are forgotten when the app closes.
          </T>
        )}

        {groups.map((g) => {
          const edit = editOf(g);
          const credit = g.direction === "credit";
          const category = credit ? "Income" : edit.category;
          const problem = validateSuggestion(g.direction, category, edit.subcategory);
          const status = problem ? null : describeStatus(suggestionStatus(master, { category, subcategory: edit.subcategory }), tidyName(category));
          const all = g.entries.map((e) => e.id);
          return (
            <View key={g.key} style={styles.card}>
              <CategoryPicker master={master} direction={g.direction} value={edit} onChange={(v) => setEdit(g, v)} disabled={busy} />
              {status ? <T style={styles.status}>{status}</T> : <T style={styles.error}>{problem}</T>}
              {errors[g.key] ? <T style={styles.error}>{errors[g.key]}</T> : null}

              {g.entries.map((e) => (
                <View key={e.id} style={styles.entry}>
                  <View style={{ flex: 1 }}>
                    <T numberOfLines={1}>{e.payee || e.description || "(no name)"}</T>
                    <T style={styles.small} numberOfLines={1}>
                      {formatLongDate(e.txnDate)}
                      {e.description && e.payee ? ` · ${e.description}` : ""}
                    </T>
                  </View>
                  <T weight="bold" style={{ color: credit ? colors.creditText : colors.debitText }}>
                    {formatRupees(e.amountPaise)}
                  </T>
                  <Pressable
                    hitSlop={8}
                    disabled={busy || !!problem}
                    onPress={() => approve(g, [e.id])}
                    accessibilityLabel={`Approve for ${e.payee ?? "this entry"}`}
                    style={{ opacity: busy || problem ? 0.4 : 1 }}
                  >
                    <MaterialIcons name="check-circle" size={28} color={colors.primary} />
                  </Pressable>
                  <Pressable
                    hitSlop={8}
                    disabled={busy}
                    onPress={() => reject(g, [e.id])}
                    accessibilityLabel={`Reject for ${e.payee ?? "this entry"}`}
                    style={{ opacity: busy ? 0.4 : 1 }}
                  >
                    <MaterialIcons name="cancel" size={28} color={colors.textSecondary} />
                  </Pressable>
                </View>
              ))}

              {g.entries.length > 1 ? (
                <View style={styles.actions}>
                  <TextButton label={`Reject all ${g.entries.length}`} onPress={() => reject(g, all)} />
                  <Button label={`Approve all ${g.entries.length}`} onPress={() => approve(g, all)} disabled={busy || !!problem} style={{ flex: 1 }} />
                </View>
              ) : null}
            </View>
          );
        })}

        {unsuggested.length > 0 ? (
          <>
            <View style={{ gap: 4, paddingHorizontal: 4 }}>
              <T weight="medium">No AI suggestion</T>
              <T style={styles.help}>
                The AI could not place {unsuggested.length === 1 ? "this entry" : "these entries"} and has no idea where {unsuggested.length === 1 ? "it" : "they"} could go.
                Choose a category from your list, or add a new one, then Save. {unsuggested.length === 1 ? "It leaves" : "Each leaves"} this list once categorised.
              </T>
            </View>
            {unsuggested.map((e) => {
              const pick = pickOf(e);
              const credit = e.direction === "credit";
              const category = credit ? "Income" : pick.category;
              const problem = validateSuggestion(e.direction, category, pick.subcategory);
              const status = problem ? null : describeStatus(suggestionStatus(master, { category, subcategory: pick.subcategory }), tidyName(category));
              return (
                <View key={e.id} style={styles.card}>
                  <View style={styles.entry}>
                    <View style={{ flex: 1 }}>
                      <T numberOfLines={1}>{e.payee || e.description || "(no name)"}</T>
                      <T style={styles.small} numberOfLines={1}>
                        {formatLongDate(e.txnDate)}
                        {e.description && e.payee ? ` · ${e.description}` : ""}
                      </T>
                    </View>
                    <T weight="bold" style={{ color: credit ? colors.creditText : colors.debitText }}>
                      {formatRupees(e.amountPaise)}
                    </T>
                  </View>
                  <CategoryPicker
                    master={master}
                    direction={e.direction}
                    value={pick}
                    onChange={(v) => setPicks((all) => ({ ...all, [e.id]: v }))}
                    disabled={busy}
                  />
                  {status && pick.subcategory ? <T style={styles.status}>{status}</T> : null}
                  {errors[`own:${e.id}`] ? <T style={styles.error}>{errors[`own:${e.id}`]}</T> : null}
                  <Button label="Save" onPress={() => saveOwn(e)} disabled={busy || !!problem} />
                </View>
              );
            })}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { padding: 8, gap: 12 },
  help: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, paddingHorizontal: 4 },
  summary: { backgroundColor: colors.primaryTint, borderRadius: 6, padding: 12, gap: 2 },
  doneBox: { gap: 12, padding: 4 },
  card: { backgroundColor: "#fff", borderRadius: 6, borderWidth: 1, borderColor: colors.outline, padding: 10, gap: 10 },
  status: { color: colors.primary, fontSize: 13, paddingHorizontal: 4 },
  error: { color: colors.error, fontSize: 13, paddingHorizontal: 4 },
  entry: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 4 },
  small: { color: colors.textSecondary, fontSize: 12 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
});
