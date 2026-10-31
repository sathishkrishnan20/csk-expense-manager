import { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { deleteGroup, getGroup, setGroupClosed } from "../db/groups";
import { listTransactions } from "../db/transactions";
import type { GroupWithBalance } from "../domain/groups";
import { confirmAction } from "../platform/dialogs";
import { AppHeader } from "./Header";
import { T } from "./Text";
import { Sheet } from "./forms";
import { colors } from "./theme";

// The group's options menu (edit name and dates, close or reopen, delete) and the group it belongs to. `sheet` is the
// menu itself and must be rendered by the page; `openMenu` shows it. Used by the title bar below and by the group's
// Overview, which carries its back and options buttons in the purple block instead of a title bar.
export function useGroupActions(groupId: string) {
  const router = useRouter();
  const [group, setGroup] = useState<GroupWithBalance | null>(null);
  const [menu, setMenu] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      if (!groupId) return; // the route's id has not arrived; do not mistake that for a deleted group
      getGroup(groupId).then((g) => {
        if (!alive) return;
        if (!g) router.navigate("/groups"); // deleted
        else setGroup(g);
      });
      return () => {
        alive = false;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [groupId]),
  );

  const closed = group?.status === "CLOSED";

  const toggleClosed = async () => {
    setMenu(false);
    await setGroupClosed(groupId, !closed);
    if (!closed) router.navigate("/groups");
    else setGroup(group ? { ...group, status: "ACTIVE" } : group);
  };

  const remove = async () => {
    setMenu(false);
    const count = (await listTransactions(groupId)).length;
    const ok = await confirmAction({
      title: "Delete this group?",
      message: count > 0 ? `Its ${count} transaction${count === 1 ? "" : "s"} will be deleted too.` : undefined,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    await deleteGroup(groupId);
    router.navigate("/groups");
  };

  const items: { label: string; icon: keyof typeof MaterialIcons.glyphMap; onPress: () => void; color?: string }[] = [
    {
      label: "Edit name and dates",
      icon: "edit",
      onPress: () => {
        setMenu(false);
        router.push({ pathname: "/groups/edit", params: { id: groupId } });
      },
    },
    { label: closed ? "Reopen group" : "Close group", icon: closed ? "lock-open" : "lock-outline", onPress: toggleClosed },
    { label: "Delete group", icon: "delete-outline", onPress: remove, color: colors.error },
  ];

  const sheet = (
    <Sheet visible={menu} title={group?.name ?? ""} onClose={() => setMenu(false)}>
      {items.map((m) => (
        <Pressable key={m.label} onPress={m.onPress} style={styles.menuItem}>
          <MaterialIcons name={m.icon} size={22} color={m.color ?? colors.textSecondary} />
          <T style={{ color: m.color ?? colors.text }}>{m.label}</T>
        </Pressable>
      ))}
    </Sheet>
  );

  return { group, openMenu: () => setMenu(true), sheet };
}

// The title bar of a group's Transactions and Charts pages (like Main's): the group's name, a back arrow to the Groups
// list, and the options button.
export function GroupHeader({ groupId }: { groupId: string }) {
  const router = useRouter();
  const { group, openMenu, sheet } = useGroupActions(groupId);
  return (
    <>
      <AppHeader
        title={group?.name ?? "Group"}
        onBack={() => router.navigate("/groups")}
        right={
          <Pressable onPress={openMenu} hitSlop={8} style={styles.menuButton} accessibilityLabel="Group options">
            <MaterialIcons name="more-vert" size={24} color="#fff" />
          </Pressable>
        }
      />
      {sheet}
    </>
  );
}

const styles = StyleSheet.create({
  menuButton: { padding: 8 },
  menuItem: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
});
