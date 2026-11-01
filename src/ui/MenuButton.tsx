import { Pressable, StyleSheet } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import type { IconName } from "./menuPages";
import { T } from "./Text";
import { colors } from "./theme";

// One row of the side menu, shared by the phone's drawer and the browser's Sidebar: a flat full-width row with an icon and a label,
// and for the page you are on a light purple background with a purple bar at its left edge.
export function MenuButton({
  label,
  icon,
  iconColor,
  selected,
  onPress,
}: {
  label: string;
  icon: IconName;
  iconColor?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={(state) => {
        const hovered = (state as { hovered?: boolean }).hovered === true;
        const pressed = state.pressed;
        return [styles.row, selected && styles.rowSelected, !selected && (hovered || pressed) && styles.rowHover];
      }}
    >
      <MaterialIcons name={icon} size={24} color={selected ? colors.primary : (iconColor ?? colors.textSecondary)} />
      <T weight={selected ? "medium" : "regular"} style={[styles.label, selected && { color: colors.primary }]}>
        {label}
      </T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    height: 52,
    paddingHorizontal: 20,
    borderLeftWidth: 4,
    borderLeftColor: "transparent",
  },
  rowSelected: { backgroundColor: colors.primaryTint, borderLeftColor: colors.primary },
  rowHover: { backgroundColor: "#f6f2ff" },
  label: { color: colors.text, fontSize: 15 },
});
