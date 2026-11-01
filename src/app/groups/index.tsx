import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { listGroupsWithBalances, setGroupPinned } from "../../db/groups";
import { resolveHomeGroupId } from "../../db/homeGroup";
import { saveHomeGroupId } from "../../settings/homeGroup";
import { MAIN_GROUP_ID, flattenTree, type GroupWithBalance } from "../../domain/groups";
import { GroupCard } from "../../ui/GroupCard";
import { AppHeader, HeaderTextButton } from "../../ui/Header";
import { T } from "../../ui/Text";
import { Button } from "../../ui/forms";
import { colors } from "../../ui/theme";

// Every group with its balance as a tree: Main with the groups under it, then groups kept separate, then closed ones. A
// group's balance includes the groups under it. The pin button puts a group first on Home; the home button makes it the group the app opens
// on (Main is one of the groups here and opens like any other).
export default function Groups() {
  const router = useRouter();
  const [groups, setGroups] = useState<GroupWithBalance[] | null>(null);
  const [homeId, setHomeId] = useState<string>(MAIN_GROUP_ID);

  const reload = useCallback(() => listGroupsWithBalances().then(setGroups), []);
  const reloadHome = useCallback(() => resolveHomeGroupId().then(setHomeId), []);
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      listGroupsWithBalances().then((gs) => {
        if (alive) setGroups(gs);
      });
      resolveHomeGroupId().then((id) => alive && setHomeId(id));
      return () => {
        alive = false;
      };
    }, []),
  );

  // The home icon: this group becomes the one the app opens on; tapping the current one goes back to Main (Main stays Home when tapped).
  const toggleHome = async (g: GroupWithBalance) => {
    await saveHomeGroupId(g.id === homeId ? MAIN_GROUP_ID : g.id);
    await reloadHome();
  };

  const togglePin = async (g: GroupWithBalance) => {
    await setGroupPinned(g.id, !g.pinned);
    await reload();
  };

  const open = (g: GroupWithBalance) => router.push(`/groups/${g.id}`);
  const nameOf = new Map((groups ?? []).map((g) => [g.id, g.name]));
  const active = (groups ?? []).filter((g) => g.status === "ACTIVE");
  const closed = (groups ?? []).filter((g) => g.status === "CLOSED");
  const card = ({ group: g, depth }: { group: GroupWithBalance; depth: number }) => (
    <GroupCard
      key={g.id}
      group={g}
      depth={depth}
      // A card at the top of a list whose group sits under another one (for example a closed subgroup of an open group) says where.
      parentName={depth === 0 && g.parentId ? nameOf.get(g.parentId) : null}
      onPress={() => open(g)}
      onTogglePin={g.id === MAIN_GROUP_ID ? undefined : () => togglePin(g)}
      home={g.id === homeId}
      onToggleHome={g.status === "ACTIVE" ? () => toggleHome(g) : undefined}
    />
  );

  return (
    <View style={styles.page}>
      <AppHeader title="Groups" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ paddingVertical: 8, paddingBottom: 32 }}>
        {flattenTree(active).map(card)}

        {groups && active.length === 1 ? (
          <View style={styles.hint}>
            <T style={styles.hintText}>
              A group has its own incomes and expenses, for a month, a trip, an event, or a second bank account, and its balance includes the groups under it.
              Statements can be imported straight into it. To make one, add a credit or debit and tick "Create a group for this entry".
            </T>
          </View>
        ) : null}

        {closed.length > 0 ? (
          <>
            <T weight="medium" style={styles.section}>
              Closed
            </T>
            {flattenTree(closed).map(card)}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  section: { marginHorizontal: 16, marginTop: 20, marginBottom: 4, color: colors.textSecondary },
  hint: { margin: 16, gap: 12 },
  hintText: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
});
