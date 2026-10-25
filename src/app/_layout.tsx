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
import { getDb } from "../db/database";
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
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
        </View>
      </View>
    </SafeAreaProvider>
  );
}

// Built for a phone. In a browser: narrow windows keep the phone layout as a centred column;
// wide ones (>= 768px) get the web Expense Manager's side drawer with the page filling the rest.
const styles = StyleSheet.create({
  fill: { flex: 1 },
  phoneFrame: { flex: 1, width: "100%", maxWidth: PHONE_COLUMN_MAX_WIDTH, alignSelf: "center" },
  shell: { flex: 1, flexDirection: "row" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#fff" },
});
