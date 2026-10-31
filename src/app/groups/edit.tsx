import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { createGroup, getGroup, listGroupsWithBalances, updateGroup } from "../../db/groups";
import { isMainGroup, validateGroup } from "../../domain/groups";
import { AppHeader } from "../../ui/Header";
import { T } from "../../ui/Text";
import { Button, DateField, OutlinedInput } from "../../ui/forms";
import { colors, shadow } from "../../ui/theme";

// Create a group, or edit one when ?id= is given: a name and an optional start and end date.
export default function EditGroup() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const editing = typeof id === "string" && id !== "";

  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [otherNames, setOtherNames] = useState<string[]>([]);
  const [showError, setShowError] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const all = await listGroupsWithBalances();
      if (!alive) return;
      setOtherNames(all.filter((g) => g.id !== id).map((g) => g.name));
      if (editing) {
        const g = await getGroup(id);
        if (!alive) return;
        if (!g) {
          router.back();
          return;
        }
        setName(g.name);
        setStartDate(g.startDate);
        setEndDate(g.endDate);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const main = editing && isMainGroup(id);
  const problem = validateGroup({ name, startDate: main ? null : startDate, endDate: main ? null : endDate }, otherNames);

  const save = async () => {
    if (problem) {
      setShowError(true);
      return;
    }
    const input = { name, startDate: main ? null : startDate, endDate: main ? null : endDate };
    if (editing) {
      await updateGroup(id, input);
      router.back();
    } else {
      const newId = await createGroup(input);
      router.replace(`/groups/${newId}`);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <AppHeader title={editing ? "Edit Group" : "New Group"} onBack={() => router.back()} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
        <OutlinedInput label="Group name" value={name} onChangeText={setName} autoCapitalize="words" />
        {main ? null : (
          <>
            <DateField label="Start date (optional)" value={startDate} onChange={setStartDate} onClear={() => setStartDate(null)} placeholder="Not set" />
            <DateField label="End date (optional)" value={endDate} onChange={setEndDate} onClear={() => setEndDate(null)} placeholder="Not set" />
            <T style={styles.note}>
              The dates are only labels for when the group runs. They do not stop you adding or importing transactions with other dates.
            </T>
          </>
        )}
        {showError && problem ? <T style={styles.error}>{problem}</T> : null}
      </ScrollView>
      <View style={[styles.actions, { paddingBottom: insets.bottom + 8 }]}>
        <Button label={editing ? "Save" : "Create group"} onPress={save} disabled={!name.trim()} style={{ flex: 1 }} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  form: { padding: 8, paddingTop: 20, gap: 14 },
  note: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, paddingHorizontal: 4 },
  error: { color: colors.error, fontSize: 14, paddingHorizontal: 4 },
  actions: { flexDirection: "row", gap: 4, paddingTop: 8, paddingHorizontal: 8, backgroundColor: "#fff", ...shadow.high },
});
