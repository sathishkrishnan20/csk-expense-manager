import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  Roboto_300Light,
  Roboto_400Regular,
  Roboto_500Medium,
  Roboto_700Bold,
  Roboto_900Black,
  useFonts,
} from "@expo-google-fonts/roboto";
import { configureAlarmNotifications, syncTrainAlarms } from "../alarms/sync";
import { getDb } from "../db/database";
import { AppDrawer } from "../ui/AppDrawer";
import { Sidebar } from "../ui/Sidebar";
import { T } from "../ui/Text";
import { colors } from "../ui/theme";
import { PHONE_COLUMN_MAX_WIDTH, useIsDesktop } from "../ui/useLayout";

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Roboto_300Light, Roboto_400Regular, Roboto_500Medium, Roboto_700Bold, Roboto_900Black });
  const desktop = useIsDesktop();
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    getDb()
      .then(() => setDbReady(true))
      .catch((err) => setDbError(err instanceof Error ? err.message : String(err)));
  }, []);

  // Train alarms are rebuilt from the saved journeys at every launch, so they stay right after a restore, a clock change or the
  // app being re-signed. It never asks for permission here (a save does), and a failure only means the alarms stay as they were.
  useEffect(() => {
    if (!dbReady) return;
    configureAlarmNotifications();
    syncTrainAlarms().catch(() => {});
  }, [dbReady]);

  if (dbError) {
    return (
      <View style={styles.center}>
        <T weight="medium">Could not open the database.</T>
        <T style={{ color: colors.textSecondary, marginTop: 8, textAlign: "center" }}>{dbError}</T>
      </View>
    );
  }
  if (!fontsLoaded || !dbReady) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <View style={desktop ? styles.shell : styles.phoneFrame}>
        {desktop ? <Sidebar /> : null}
        <View style={styles.fill}>
          <AppDrawer>
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
          </AppDrawer>
        </View>
      </View>
    </SafeAreaProvider>
  );
}

// Built for a phone. In a browser: narrow windows keep the phone layout as a centred column;
// wide ones (>= 768px) get the web Expense Manager's side drawer with the page filling the rest. On a phone (and a narrow window)
// the same list of pages is a drawer that slides over the page from the menu button on Home (ui/AppDrawer.tsx).
const styles = StyleSheet.create({
  fill: { flex: 1 },
  phoneFrame: { flex: 1, width: "100%", maxWidth: PHONE_COLUMN_MAX_WIDTH, alignSelf: "center" },
  shell: { flex: 1, flexDirection: "row" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#fff" },
});
