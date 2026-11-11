import { useState, type ReactNode } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { T } from "./Text";
import { colors, shadow } from "./theme";
import { useIsDesktop } from "./useLayout";
import { groupIdFromPath } from "./useRouteGroupId";

type IconName = keyof typeof MaterialIcons.glyphMap;

const FAB_SIZE = 60;
const FAB_BOTTOM = 20;
const ACTION_SIZE = 40;
const ASK_SIZE = 48; // the Ask AI button, a little smaller than the + button it sits above
const ASK_GAP = 12;

interface Action {
  label: string;
  icon: IconName;
  color: string;
  open: () => void;
}

// How much room a page's list needs at its end so the last row is not hidden behind the floating + button: its height, the gap
// below and above it, and the bottom safe area. Zero in a wide browser window, where the Sidebar has the add actions instead.
export function useAddClearance(): number {
  const insets = useSafeAreaInsets();
  const desktop = useIsDesktop();
  return desktop ? 0 : FAB_SIZE + FAB_BOTTOM * 2 + insets.bottom;
}

// The round Ask AI button that floats just above the + button (on Home and a group's Overview). It opens the Ask AI chat for the group the page
// belongs to: the group's own chat inside a group page, the home group's elsewhere. Like the + button it is part of the page, and a wide browser
// window has Ask AI in the Sidebar instead.
export function AskAiButton() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const groupId = groupIdFromPath(usePathname());
  const desktop = useIsDesktop();
  if (desktop) return null;
  return (
    <View pointerEvents="box-none" style={[styles.anchored, styles.askSide, { bottom: insets.bottom + FAB_BOTTOM + FAB_SIZE + ASK_GAP }]}>
      <Pressable onPress={() => router.push(groupId ? `/groups/${groupId}/chat` : "/chat")} style={styles.ask} accessibilityRole="button" accessibilityLabel="Ask AI">
        <MaterialIcons name="auto-awesome" size={24} color={colors.primary} />
      </Pressable>
    </View>
  );
}

function Fab({ open, onPress }: { open: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.fab} accessibilityLabel={open ? "Close menu" : "Add"}>
      <MaterialIcons name="add" size={32} color="#fff" style={{ transform: [{ rotate: open ? "45deg" : "0deg" }] }} />
    </Pressable>
  );
}

// The round + button and the menu it opens (Credit, Debit, Import, Add list), as in the web app. It positions itself against the
// bottom of the view it is placed in (that view must fill the screen and let touches through with pointerEvents="box-none"), so
// it floats over a page. Inside a group page (the address is /groups/<id>/...) the menu adds to that group; elsewhere to the home
// group. `align` is the middle of the screen or the right edge. A wide browser window uses the Sidebar instead.
export function AddMenu({ align = "center" }: { align?: "center" | "right" }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const groupId = groupIdFromPath(usePathname()) ?? undefined;
  const desktop = useIsDesktop();
  const [open, setOpen] = useState(false);

  const go = (route: () => void) => () => {
    setOpen(false);
    route();
  };

  // Listed from the one nearest the + button outwards, like the web app.
  const actions: Action[] = [
    {
      label: "Credit",
      icon: "add-card",
      color: colors.income,
      open: go(() => router.push({ pathname: "/add", params: { type: "CREDIT", ...(groupId ? { group: groupId } : {}) } })),
    },
    {
      label: "Debit",
      icon: "credit-card-off",
      color: colors.expense,
      open: go(() => router.push({ pathname: "/add", params: { type: "DEBIT", ...(groupId ? { group: groupId } : {}) } })),
    },
    {
      label: "Import",
      icon: "file-upload",
      color: colors.importAction,
      open: go(() => router.push(groupId ? { pathname: "/import", params: { group: groupId } } : "/import")),
    },
    {
      label: "Add list",
      icon: "playlist-add",
      color: colors.primaryLight,
      open: go(() => router.push(groupId ? { pathname: "/bulk", params: { group: groupId } } : "/bulk")),
    },
  ];

  if (desktop) return null;

  const side = align === "right" ? styles.right : null;

  return (
    <>
      <View pointerEvents="box-none" style={[styles.anchored, side, { bottom: insets.bottom + FAB_BOTTOM }]}>
        <Fab open={false} onPress={() => setOpen(true)} />
      </View>

      {/* The open menu lives in a Modal so every action can be tapped, however far it sits above the bottom. */}
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
        <View pointerEvents="box-none" style={[styles.anchored, side, { bottom: 0, paddingBottom: insets.bottom + FAB_BOTTOM }]}>
          {[...actions].reverse().map((a) => (
            <View key={a.label} style={styles.actionSlot}>
              <View style={styles.tooltipWrap} pointerEvents="none">
                <View style={styles.tooltip}>
                  <T weight="medium" style={styles.tooltipText}>
                    {a.label}
                  </T>
                </View>
              </View>
              <Pressable onPress={a.open} style={[styles.action, { backgroundColor: a.color }]} accessibilityLabel={a.label}>
                <MaterialIcons name={a.icon} size={22} color="#fff" />
              </Pressable>
            </View>
          ))}
          <Fab open onPress={() => setOpen(false)} />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  // Pinned to the bottom edge; children define the height.
  anchored: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  right: { alignItems: "flex-end", paddingRight: 20 },
  // centred over the + button, which is wider
  askSide: { alignItems: "flex-end", paddingRight: 20 + (FAB_SIZE - ASK_SIZE) / 2 },
  ask: {
    width: ASK_SIZE,
    height: ASK_SIZE,
    borderRadius: ASK_SIZE / 2,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.primaryTint,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.mid,
  },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.high,
  },
  actionSlot: { width: ACTION_SIZE, height: ACTION_SIZE, marginBottom: 16, justifyContent: "center" },
  action: {
    width: ACTION_SIZE,
    height: ACTION_SIZE,
    borderRadius: ACTION_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.mid,
  },
  // Wide enough that the label never wraps inside the 40px slot.
  tooltipWrap: { position: "absolute", right: ACTION_SIZE + 8, width: 140, alignItems: "flex-end" },
  tooltip: {
    backgroundColor: "rgba(97,97,97,0.92)",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tooltipText: { color: "#fff", fontSize: 11 },
});

// A page with the + button floating over it. The layer holding the button fills the page and lets touches through, so the button is
// inside its parent's bounds (iOS ignores touches outside them) without taking any room. It is part of the page, so it slides in
// and out with it.
// `askAi` adds the Ask AI button above the + button; only Home and a group's Overview ask for it.
export function WithAddButton({ children, askAi = false }: { children: ReactNode; askAi?: boolean }) {
  return (
    <View style={styles.page}>
      {children}
      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        {askAi ? <AskAiButton /> : null}
        <AddMenu align="right" />
      </View>
    </View>
  );
}
