import { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { deleteGroup, getGroup, setGroupClosed, setGroupPinned, subtreeCounts } from "../db/groups";
import { resolveHomeGroupId } from "../db/homeGroup";
import { saveHomeGroupId } from "../settings/homeGroup";
import { MAIN_GROUP_ID, isMainGroup, type GroupWithBalance } from "../domain/groups";
import { confirmAction } from "../platform/dialogs";
import { useOpenDrawer } from "./AppDrawer";
import { AppHeader } from "./Header";
import { T } from "./Text";
import { Sheet } from "./forms";
import { colors } from "./theme";

// The group's options menu (edit, pin to Home, close or reopen, delete) and the group it belongs to. `sheet` is the
// menu itself and must be rendered by the page; `openMenu` shows it. Used by the title bar below and by the group's
// Overview, which carries its back and options buttons in the purple block instead of a title bar.
export function useGroupActions(groupId: string) {
  const router = useRouter();
  const [group, setGroup] = useState<GroupWithBalance | null>(null);
  const [menu, setMenu] = useState(false);
  const [homeId, setHomeId] = useState<string>(MAIN_GROUP_ID); // the group the app opens on

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      if (!groupId) return; // the route's id has not arrived; do not mistake that for a deleted group
      resolveHomeGroupId().then((id) => alive && setHomeId(id));
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

  // Make this group the one the app opens on, or (when it already is) go back to Main.
  const toggleHome = async () => {
    setMenu(false);
    const next = homeId === groupId ? MAIN_GROUP_ID : groupId;
    await saveHomeGroupId(next);
    setHomeId(next);
  };

  const togglePinned = async () => {
    setMenu(false);
    await setGroupPinned(groupId, !group?.pinned);
    if (group) setGroup({ ...group, pinned: !group.pinned });
  };

  const remove = async () => {
    setMenu(false);
    const { subgroups, transactions } = await subtreeCounts(groupId);
    const parts: string[] = [];
    if (subgroups > 0) parts.push(`its ${subgroups} subgroup${subgroups === 1 ? "" : "s"}`);
    if (transactions > 0) parts.push(`${subgroups > 0 ? "all their entries and its own" : "its"} ${transactions} transaction${transactions === 1 ? "" : "s"}`);
    const ok = await confirmAction({
      title: "Delete this group?",
      message: parts.length > 0 ? `${parts.join(" and ")} will be deleted too.`.replace(/^./, (c) => c.toUpperCase()) : undefined,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    await deleteGroup(groupId);
    router.navigate("/groups");
  };

  const main = isMainGroup(groupId);
  const isHome = homeId === groupId;
  const items: { label: string; icon: keyof typeof MaterialIcons.glyphMap; onPress: () => void; color?: string }[] = [
    {
      label: main ? "Rename" : "Edit name, dates and parent",
      icon: "edit",
      onPress: () => {
        setMenu(false);
        router.push({ pathname: "/groups/edit", params: { id: groupId } });
      },
    },
    // Main is already Home when nothing else is chosen, so there is nothing to switch off.
    ...(main && isHome
      ? []
      : [
          {
            label: isHome ? "Stop showing on Home (back to Main)" : "Show on Home",
            icon: (isHome ? "home" : "home-filled") as keyof typeof MaterialIcons.glyphMap,
            onPress: toggleHome,
          },
        ]),
    // Main can be renamed and chosen as Home, but never pinned, closed or deleted.
    ...(main
      ? []
      : [
          { label: group?.pinned ? "Unpin from Home" : "Pin to Home", icon: (group?.pinned ? "bookmark" : "bookmark-border") as keyof typeof MaterialIcons.glyphMap, onPress: togglePinned },
          { label: closed ? "Reopen group" : "Close group", icon: (closed ? "lock-open" : "lock-outline") as keyof typeof MaterialIcons.glyphMap, onPress: toggleClosed },
          { label: "Delete group", icon: "delete-outline" as keyof typeof MaterialIcons.glyphMap, onPress: remove, color: colors.error },
        ]),
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
  const openDrawer = useOpenDrawer();
  return (
    <>
      <AppHeader
        title={group?.name ?? "Group"}
        onBack={() => router.navigate("/groups")}
        right={
          <>
            {openDrawer ? (
              <Pressable onPress={openDrawer} hitSlop={8} style={styles.menuButton} accessibilityRole="button" accessibilityLabel="Open menu">
                <MaterialIcons name="menu" size={24} color="#fff" />
              </Pressable>
            ) : null}
            <Pressable onPress={openMenu} hitSlop={8} style={styles.menuButton} accessibilityLabel="Group options">
              <MaterialIcons name="more-vert" size={24} color="#fff" />
            </Pressable>
          </>
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
