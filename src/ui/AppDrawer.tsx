import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialIcons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import { Drawer } from "react-native-drawer-layout";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MenuButton } from "./MenuButton";
import { MENU_PAGES, groupMenuPages } from "./menuPages";
import { T } from "./Text";
import { colors } from "./theme";
import { useIsDesktop } from "./useLayout";
import { groupIdFromPath } from "./useRouteGroupId";

const DRAWER_WIDTH = 280;

// Opens the drawer; null where there is no drawer (a wide browser window has the permanent Sidebar instead).
const OpenDrawerContext = createContext<(() => void) | null>(null);
export const useOpenDrawer = (): (() => void) | null => useContext(OpenDrawerContext);

// The phone's side menu: slides in over the page from the left when a page's menu button is tapped, and lists the pages of the app
// (MENU_PAGES), or of the group you are in (groupMenuPages). It wraps the whole navigator, so no route moves. It is the same drawer
// Expo Router's own drawer layout uses (react-native-drawer-layout), used directly because this app only needs the panel: the menu
// items are plain links. It opens with the button only (swiping from the edge is off), and closes on a tap outside it, or on choosing a page.
export function AppDrawer({ children }: { children: ReactNode }) {
  const desktop = useIsDesktop();
  const [open, setOpen] = useState(false);
  const openDrawer = useCallback(() => setOpen(true), []);
  const closeDrawer = useCallback(() => setOpen(false), []);

  // A browser window made wide while the drawer is open switches to the Sidebar; do not leave the drawer open behind it.
  useEffect(() => {
    if (desktop) setOpen(false);
  }, [desktop]);

  if (desktop) return <>{children}</>;

  return (
    <OpenDrawerContext.Provider value={openDrawer}>
      <Drawer
        open={open}
        onOpen={openDrawer}
        onClose={closeDrawer}
        drawerType="front"
        swipeEnabled={false}
        drawerStyle={styles.drawer}
        overlayAccessibilityLabel="Close menu"
        renderDrawerContent={() => <DrawerMenu onClose={closeDrawer} />}
      >
        {children}
      </Drawer>
    </OpenDrawerContext.Provider>
  );
}

function DrawerMenu({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  // Inside a group the menu is that group's pages (the same list as the browser's Sidebar); everywhere else it is the app's pages.
  const groupId = groupIdFromPath(pathname);
  const pages = groupId ? groupMenuPages(groupId) : MENU_PAGES;

  const go = (path: string) => {
    onClose();
    if (path !== pathname) router.navigate(path as "/");
  };

  return (
    <View style={styles.fill}>
      <LinearGradient
        colors={[colors.gradientTo, colors.gradientFrom]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[styles.brand, { paddingTop: insets.top + 20 }]}
      >
        <View style={styles.logo}>
          <MaterialIcons name="account-balance-wallet" size={28} color={colors.primary} />
        </View>
        <T weight="black" style={styles.title}>
          Expense Manager
        </T>
      </LinearGradient>

      <ScrollView contentContainerStyle={[styles.menu, { paddingBottom: insets.bottom + 16 }]}>
        {pages.map((p) => (
          <MenuButton key={p.path} label={p.label} icon={p.icon} selected={pathname === p.path} onPress={() => go(p.path)} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  drawer: { width: DRAWER_WIDTH, backgroundColor: colors.surface },
  fill: { flex: 1, backgroundColor: colors.surface },
  brand: { paddingHorizontal: 20, paddingBottom: 20, gap: 12 },
  logo: { width: 52, height: 52, borderRadius: 10, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 18 },
  menu: { paddingTop: 8 },
});
