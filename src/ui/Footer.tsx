import { useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { T } from "./Text";
import { colors, shadow } from "./theme";
import { useIsDesktop } from "./useLayout";

type IconName = keyof typeof MaterialIcons.glyphMap;

const FAB_SIZE = 60;
const FAB_BOTTOM = 20;
const ACTION_SIZE = 40;
const BAR_HEIGHT = 56;

const TABS: ({ name: string; label: string; icon: IconName } | null)[] = [
  { name: "index", label: "Home", icon: "home" },
  { name: "transactions", label: "Transactions", icon: "dynamic-form" },
  null, // the centre slot belongs to the + button
  { name: "charts", label: "Charts", icon: "pie-chart" },
  { name: "config", label: "Config", icon: "settings" },
];

interface Action {
  label: string;
  icon: IconName;
  color: string;
  open: () => void;
}

function Fab({ open, onPress }: { open: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.fab} accessibilityLabel={open ? "Close menu" : "Add"}>
      <MaterialIcons
        name="add"
        size={32}
        color="#fff"
        style={{ transform: [{ rotate: open ? "45deg" : "0deg" }] }}
      />
    </Pressable>
  );
}

// MUI BottomNavigation with a SpeedDial in the middle slot, as in the web app.
export function Footer({ state, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const desktop = useIsDesktop();
  const active = state.routes[state.index]?.name;

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
      open: go(() => router.push({ pathname: "/add", params: { type: "CREDIT" } })),
    },
    {
      label: "Debit",
      icon: "credit-card-off",
      color: colors.expense,
      open: go(() => router.push({ pathname: "/add", params: { type: "DEBIT" } })),
    },
    { label: "Import", icon: "file-upload", color: colors.importAction, open: go(() => router.push("/import")) },
  ];

  // Wide browser windows use the side drawer instead.
  if (desktop) return null;

  return (
    <View pointerEvents="box-none" style={styles.wrapper}>
      <View style={[styles.bar, { height: BAR_HEIGHT + insets.bottom, paddingBottom: insets.bottom }]}>
        {TABS.map((tab, i) => {
          if (!tab) return <View key={`slot-${i}`} style={styles.item} />;
          const selected = active === tab.name;
          const tint = selected ? colors.primary : colors.textSecondary;
          return (
            <Pressable
              key={tab.name}
              style={styles.item}
              onPress={() => {
                const route = state.routes.find((r) => r.name === tab.name);
                if (route) navigateToTab(route.key);
              }}
            >
              <MaterialIcons name={tab.icon} size={24} color={tint} />
              <T
                weight="regular"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                style={[styles.label, { color: tint, fontSize: selected ? 14 : 12 }]}
              >
                {tab.label}
              </T>
            </Pressable>
          );
        })}
      </View>

      <View pointerEvents="box-none" style={[styles.anchored, { bottom: insets.bottom + FAB_BOTTOM }]}>
        <Fab open={false} onPress={() => setOpen(true)} />
      </View>

      {/* The open menu lives in a Modal so every action can be tapped, however far it sits above the bar. */}
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
        <View pointerEvents="box-none" style={[styles.anchored, { bottom: 0, paddingBottom: insets.bottom + FAB_BOTTOM }]}>
          {[...actions].reverse().map((a) => (
            <View key={a.label} style={styles.actionSlot}>
              <View style={styles.tooltipWrap} pointerEvents="none">
                <View style={styles.tooltip}>
                  <T weight="medium" style={styles.tooltipText}>
                    {a.label}
                  </T>
                </View>
              </View>
              <Pressable
                onPress={a.open}
                style={[styles.action, { backgroundColor: a.color }]}
                accessibilityLabel={a.label}
              >
                <MaterialIcons name={a.icon} size={22} color="#fff" />
              </Pressable>
            </View>
          ))}
          <Fab open onPress={() => setOpen(false)} />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  // Extends 24px above the bar so the top of the + button is inside this view
  // and receives touches; pointerEvents="box-none" lets everything else through.
  wrapper: { marginTop: -24, paddingTop: 24 },
  bar: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    ...shadow.high,
  },
  item: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 8, paddingBottom: 8 },
  label: { marginTop: 2, maxWidth: "100%", paddingHorizontal: 2 },
  // Pinned to the bottom edge and centred; children define the height.
  anchored: { position: "absolute", left: 0, right: 0, alignItems: "center" },
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
