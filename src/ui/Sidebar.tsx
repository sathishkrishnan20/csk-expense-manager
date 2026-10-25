import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialIcons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import { T } from "./Text";
import { colors } from "./theme";
import { SIDEBAR_WIDTH } from "./useLayout";

type IconName = keyof typeof MaterialIcons.glyphMap;

const PAGES: { label: string; icon: IconName; path: string }[] = [
  { label: "Home", icon: "home", path: "/" },
  { label: "Transactions", icon: "dynamic-form", path: "/transactions" },
  { label: "Charts", icon: "pie-chart", path: "/charts" },
  { label: "Config", icon: "settings", path: "/config" },
  { label: "How it works", icon: "help-outline", path: "/help" },
];

// The permanent left drawer of the web Expense Manager, shown on wide browser windows
// instead of the bottom bar and + button. The same three + actions sit under the pages.
export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();

  const actions: { label: string; icon: IconName; color: string; open: () => void; path: string }[] = [
    { label: "Credit", icon: "add-card", color: colors.income, path: "/add", open: () => router.push({ pathname: "/add", params: { type: "CREDIT" } }) },
    { label: "Debit", icon: "credit-card-off", color: colors.expense, path: "/add", open: () => router.push({ pathname: "/add", params: { type: "DEBIT" } }) },
    { label: "Import", icon: "file-upload", color: colors.importAction, path: "/import", open: () => router.push("/import") },
  ];

  return (
    <LinearGradient colors={[colors.gradientTo, colors.gradientFrom]} style={styles.drawer}>
      <View style={styles.brand}>
        <View style={styles.logo}>
          <MaterialIcons name="account-balance-wallet" size={26} color={colors.primary} />
        </View>
        <T weight="black" style={styles.title}>
          Expense Manager
        </T>
      </View>
      <View style={styles.rule} />

      <ScrollView contentContainerStyle={styles.menu}>
        {PAGES.map((p) => (
          <MenuButton
            key={p.label}
            label={p.label}
            icon={p.icon}
            selected={pathname === p.path}
            onPress={() => router.navigate(p.path as "/")}
          />
        ))}

        <T style={styles.sectionLabel}>Add</T>
        {actions.map((a) => (
          <MenuButton
            key={a.label}
            label={a.label}
            icon={a.icon}
            iconColor={a.color}
            selected={a.path === "/import" && pathname === "/import"}
            onPress={a.open}
          />
        ))}
      </ScrollView>
    </LinearGradient>
  );
}

function MenuButton({
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
      style={(state) => {
        const hovered = (state as { hovered?: boolean }).hovered === true;
        return [styles.button, selected && styles.buttonSelected, !selected && hovered && styles.buttonHover];
      }}
    >
      <MaterialIcons name={icon} size={22} color={selected ? "#fff" : (iconColor ?? colors.primary)} />
      <T weight="medium" style={[styles.buttonLabel, selected && { color: "#fff" }]}>
        {label}
      </T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  drawer: { width: SIDEBAR_WIDTH },
  brand: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 14 },
  logo: { width: 44, height: 44, borderRadius: 8, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 17, flexShrink: 1 },
  rule: { height: 1, backgroundColor: "rgba(255,255,255,0.3)" },
  menu: { paddingHorizontal: 24, paddingTop: 32, gap: 8 },
  sectionLabel: { color: "rgba(255,255,255,0.8)", fontSize: 13, marginTop: 20, marginLeft: 8 },
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 22,
    backgroundColor: "#fff",
  },
  buttonSelected: { backgroundColor: colors.primary },
  buttonHover: { backgroundColor: colors.primaryTint },
  buttonLabel: { color: colors.primary, fontSize: 15 },
});
