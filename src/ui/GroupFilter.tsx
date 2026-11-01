import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { flattenTree, type GroupWithBalance } from "../domain/groups";
import { scopeLabel, toggleInScope, type GroupScope } from "../domain/groupScope";
import { T } from "./Text";
import { Button, CheckOption, Sheet } from "./forms";
import { colors } from "./theme";

// The Group filter of the Transactions and Charts pages: which groups the page covers. One group, several (tick as many as you
// like) or all of them. It starts on the group the page belongs to and can be changed at any time.
export function GroupFilter({
  groups,
  scope,
  onChange,
}: {
  groups: readonly GroupWithBalance[];
  scope: GroupScope;
  onChange: (scope: GroupScope) => void;
}) {
  const [open, setOpen] = useState(false);
  const nameOf = new Map(groups.map((g) => [g.id, g.name]));
  const rows = flattenTree(groups);

  return (
    <>
      <Pressable style={styles.bar} onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel="Choose groups">
        <MaterialIcons name="folder-open" size={20} color={colors.primary} />
        <T numberOfLines={1} style={styles.label}>
          Group: {scopeLabel(scope, nameOf)}
        </T>
        <MaterialIcons name="arrow-drop-down" size={24} color={colors.textSecondary} />
      </Pressable>

      <Sheet visible={open} title="Show these groups" onClose={() => setOpen(false)}>
        <ScrollView style={styles.list}>
          <CheckOption label="All groups" checked={scope === null} onPress={() => onChange(null)} />
          {rows.map(({ group: g, depth }) => (
            <View key={g.id} style={{ marginLeft: depth * 18 }}>
              <CheckOption
                label={g.status === "CLOSED" ? `${g.name} (closed)` : g.name}
                checked={scope !== null && scope.includes(g.id)}
                onPress={() => onChange(toggleInScope(scope, g.id))}
              />
            </View>
          ))}
        </ScrollView>
        <View style={styles.done}>
          <Button label="Done" onPress={() => setOpen(false)} />
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: colors.outline,
  },
  label: { flex: 1, fontSize: 15 },
  list: { maxHeight: 360, paddingHorizontal: 8 },
  done: { padding: 12 },
});
