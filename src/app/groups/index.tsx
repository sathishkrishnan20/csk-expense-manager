import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { listGroupsWithBalances } from "../../db/groups";
import { MAIN_GROUP_ID, type GroupWithBalance } from "../../domain/groups";
import { GroupCard } from "../../ui/GroupCard";
import { AppHeader, HeaderTextButton } from "../../ui/Header";
import { T } from "../../ui/Text";
import { Button } from "../../ui/forms";
import { colors } from "../../ui/theme";

// Every group with its balance: Main, then open groups, then closed ones.
export default function Groups() {
  const router = useRouter();
  const [groups, setGroups] = useState<GroupWithBalance[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      listGroupsWithBalances().then((gs) => {
        if (alive) setGroups(gs);
      });
      return () => {
        alive = false;
      };
    }, []),
  );

  const open = (g: GroupWithBalance) => (g.id === MAIN_GROUP_ID ? router.navigate("/") : router.push(`/groups/${g.id}`));
  const active = (groups ?? []).filter((g) => g.status === "ACTIVE");
  const closed = (groups ?? []).filter((g) => g.status === "CLOSED");

  return (
    <View style={styles.page}>
      <AppHeader title="Groups" onBack={() => router.back()} right={<HeaderTextButton label="New" onPress={() => router.push("/groups/edit")} />} />
      <ScrollView contentContainerStyle={{ paddingVertical: 8, paddingBottom: 32 }}>
        {active.map((g) => (
          <GroupCard key={g.id} group={g} onPress={() => open(g)} />
        ))}

        {groups && active.length === 1 ? (
          <View style={styles.hint}>
            <T style={styles.hintText}>
              A group is a separate ledger with its own incomes and expenses, for a trip, an event, or a second bank account. Statements can be imported
              straight into it.
            </T>
            <Button label="New group" onPress={() => router.push("/groups/edit")} />
          </View>
        ) : null}

        {closed.length > 0 ? (
          <>
            <T weight="medium" style={styles.section}>
              Closed
            </T>
            {closed.map((g) => (
              <GroupCard key={g.id} group={g} onPress={() => open(g)} />
            ))}
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
