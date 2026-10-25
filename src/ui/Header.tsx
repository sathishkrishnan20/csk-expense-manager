import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { T } from "./Text";
import { colors, shadow } from "./theme";

interface Props {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
}

// The purple MUI AppBar. Pages reached from the + menu show a back arrow;
// the four main tabs do not.
export function AppHeader({ title, onBack, right }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: insets.top }]}>
      <View style={styles.toolbar}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={8} style={styles.back} accessibilityLabel="Back">
            <MaterialIcons name="arrow-back" size={24} color="#fff" />
          </Pressable>
        ) : (
          <View style={styles.spacer} />
        )}
        <T weight="medium" numberOfLines={1} style={styles.title}>
          {title}
        </T>
        {right}
      </View>
    </View>
  );
}

export function HeaderTextButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={styles.textButton}>
      <T weight="medium" style={styles.textButtonLabel}>
        {label.toUpperCase()}
      </T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: colors.primary, ...shadow.mid, zIndex: 2 },
  toolbar: { height: 56, flexDirection: "row", alignItems: "center", paddingRight: 8 },
  back: { width: 48, height: 48, marginHorizontal: 4, alignItems: "center", justifyContent: "center" },
  spacer: { width: 16 },
  title: { flex: 1, color: "#fff", fontSize: 20, letterSpacing: 0.15 },
  textButton: { paddingHorizontal: 12, paddingVertical: 6 },
  textButtonLabel: { color: "#fff", fontSize: 14, letterSpacing: 1.25 },
});
