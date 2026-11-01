import { ScrollView, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialIcons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import { MenuButton } from "./MenuButton";
import { MENU_PAGES, groupMenuPages, type IconName } from "./menuPages";
import { T } from "./Text";
import { colors } from "./theme";
import { SIDEBAR_WIDTH } from "./useLayout";

// The permanent left drawer of the web Expense Manager, shown on wide browser windows
// instead of the bottom bar and + button. The same three + actions sit under the pages.
export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();

  // Inside a group (/groups/<id>/...) the menu shows that group's pages and adds to it.
  const groupId = /^\/groups\/([^/]+)/.exec(pathname)?.[1];
  const inGroup = groupId !== undefined && groupId !== "edit";
  const group = inGroup ? { group: groupId } : {};
  const pages = inGroup ? groupMenuPages(groupId) : MENU_PAGES;

  const actions: { label: string; icon: IconName; color: string; open: () => void; path: string }[] = [
    { label: "Credit", icon: "add-card", color: colors.income, path: "/add", open: () => router.push({ pathname: "/add", params: { type: "CREDIT", ...group } }) },
    { label: "Debit", icon: "credit-card-off", color: colors.expense, path: "/add", open: () => router.push({ pathname: "/add", params: { type: "DEBIT", ...group } }) },
    {
      label: "Import",
      icon: "file-upload",
      color: colors.importAction,
      path: "/import",
      open: () => router.push(inGroup ? { pathname: "/import", params: group } : "/import"),
    },
    {
      label: "Add list",
      icon: "playlist-add",
      color: colors.primaryLight,
      path: "/bulk",
      open: () => router.push(inGroup ? { pathname: "/bulk", params: group } : "/bulk"),
    },
  ];

  return (
    <View style={styles.drawer}>
      <LinearGradient colors={[colors.gradientTo, colors.gradientFrom]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.brand}>
        <View style={styles.logo}>
          <MaterialIcons name="account-balance-wallet" size={26} color={colors.primary} />
        </View>
        <T weight="black" style={styles.title}>
          Expense Manager
        </T>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.menu}>
        {pages.map((p) => (
          <MenuButton
            key={p.label}
            label={p.label}
            icon={p.icon}
            selected={pathname === p.path}
            onPress={() => router.navigate(p.path as "/")}
          />
        ))}

        <View style={styles.divider} />
        <T style={styles.sectionLabel}>Add</T>
        {actions.map((a) => (
          <MenuButton
            key={a.label}
            label={a.label}
            icon={a.icon}
            iconColor={a.color}
            selected={(a.path === "/import" || a.path === "/bulk") && pathname === a.path}
            onPress={a.open}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  drawer: { width: SIDEBAR_WIDTH, backgroundColor: colors.surface, borderRightWidth: 1, borderRightColor: colors.outline },
  brand: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 16 },
  logo: { width: 44, height: 44, borderRadius: 8, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 17, flexShrink: 1 },
  menu: { paddingVertical: 8 },
  divider: { height: 1, backgroundColor: colors.outline, marginVertical: 8, marginHorizontal: 16 },
  sectionLabel: { color: colors.textSecondary, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", marginVertical: 6, marginLeft: 24 },
});
