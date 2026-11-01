import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { createGroup, getGroup, listGroupsWithBalances, updateGroup } from "../../db/groups";
import { MAIN_GROUP_ID, descendantIds, isMainGroup, validateGroup, validateParent, type GroupWithBalance } from "../../domain/groups";
import { AppHeader } from "../../ui/Header";
import { T } from "../../ui/Text";
import { Button, DateField, OutlinedInput, SelectField } from "../../ui/forms";
import { colors, shadow } from "../../ui/theme";

const NO_PARENT = "None (kept separate)";

// Create a group, or edit one when ?id= is given: a name, the group it sits under, and an optional start and end date.
// Groups are made from an entry (Add > "Create a group for this entry"), so this screen is reached to edit one; ?parent= and the create
// mode are not used by any button now.
export default function EditGroup() {
  const { id, parent } = useLocalSearchParams<{ id?: string; parent?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const editing = typeof id === "string" && id !== "";

  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [otherNames, setOtherNames] = useState<string[]>([]);
  const [all, setAll] = useState<GroupWithBalance[]>([]);
  const [parentId, setParentId] = useState<string | null>(typeof parent === "string" && parent !== "" ? parent : MAIN_GROUP_ID);
  const [showError, setShowError] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const groups = await listGroupsWithBalances();
      if (!alive) return;
      setAll(groups);
      setOtherNames(groups.filter((g) => g.id !== id).map((g) => g.name));
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
        setParentId(g.parentId);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const main = editing && isMainGroup(id);
  // Any group except itself and the groups below it (that would be a loop).
  const parentOptions = all.filter((g) => g.id !== id && !(editing && descendantIds(all, id).has(g.id)));
  const parentName = parentOptions.find((g) => g.id === parentId)?.name ?? NO_PARENT;
  const problem =
    validateGroup({ name, startDate: main ? null : startDate, endDate: main ? null : endDate }, otherNames) ??
    validateParent(all, editing ? id : null, main ? null : parentId);

  const save = async () => {
    if (problem) {
      setShowError(true);
      return;
    }
    const input = { name, startDate: main ? null : startDate, endDate: main ? null : endDate, parentId: main ? null : parentId };
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
            <SelectField
              label="Sits under"
              value={parentName}
              options={[NO_PARENT, ...parentOptions.map((g) => g.name)]}
              onChange={(picked) => setParentId(parentOptions.find((g) => g.name === picked)?.id ?? null)}
            />
            <T style={styles.note}>
              A group's balance includes the groups under it, all the way up to Main. Choose "{NO_PARENT}" for a group that should stay on its own,
              such as a second bank account.
            </T>
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
