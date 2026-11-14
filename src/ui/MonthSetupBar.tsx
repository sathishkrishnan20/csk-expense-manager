import { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { dismissSetup, monthToOffer } from "../db/monthTemplate";
import { monthLabel } from "../domain/monthTemplate";
import { useDataVersion } from "../import/dataVersion";
import { T } from "./Text";
import { colors } from "./theme";

// One line on Home in a month the monthly template has not set up (and no group made by hand covers): "Set up December?". Tapping it opens the preview (app/month-setup.tsx), where
// nothing is created until the owner confirms; the cross hides it for this month (see db/monthTemplate.ts, monthToOffer).
export function MonthSetupBar() {
  const router = useRouter();
  const [month, setMonth] = useState<string | null>(null);
  const dataVersion = useDataVersion();

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      monthToOffer().then((m) => alive && setMonth(m), () => alive && setMonth(null));
      return () => {
        alive = false;
      };
    }, [dataVersion]),
  );

  if (!month) return null;
  const label = monthLabel(month).split(" ")[0];
  return (
    <View style={styles.bar}>
      <Pressable style={styles.body} onPress={() => router.push({ pathname: "/month-setup", params: { month } })} accessibilityRole="button" accessibilityLabel={`Set up ${label}`}>
        <MaterialIcons name="event-available" size={24} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <T weight="medium" style={styles.text}>{`Set up ${label}?`}</T>
          <T style={styles.hint}>Makes this month's groups and entries from your template. You check them first.</T>
        </View>
      </Pressable>
      <Pressable
        onPress={() => {
          setMonth(null);
          dismissSetup(month).catch(() => {});
        }}
        hitSlop={10}
        style={styles.close}
        accessibilityRole="button"
        accessibilityLabel="Not now"
      >
        <MaterialIcons name="close" size={20} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "flex-start", margin: 12, marginBottom: 0, borderRadius: 8, backgroundColor: "#ede7f6" },
  body: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  text: { fontSize: 14 },
  hint: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  close: { padding: 12 },
});
