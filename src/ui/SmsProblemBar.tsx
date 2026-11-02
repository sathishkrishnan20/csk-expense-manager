import { Pressable, StyleSheet, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { dismissSmsProblem, useSmsProblem } from "../import/smsProblemStore";
import { T } from "./Text";
import { colors } from "./theme";

// One line at the top of Home when the automatic bank SMS check could not do its job even after retrying (see domain/smsProblem.ts).
// Tapping it opens Config > Bank SMS; the cross hides it until the problem changes or the app is opened again.
export function SmsProblemBar() {
  const router = useRouter();
  const problem = useSmsProblem();
  if (!problem) return null;
  return (
    <View style={styles.bar}>
      <Pressable
        style={styles.body}
        onPress={() => router.navigate({ pathname: "/config", params: { open: "sms", at: String(Date.now()) } })}
        accessibilityRole="button"
        accessibilityLabel="Bank messages problem. Open Bank SMS"
      >
        <MaterialIcons name="sync-problem" size={24} color={colors.error} />
        <View style={{ flex: 1 }}>
          <T style={styles.text}>{problem}</T>
          <T style={styles.hint}>Tap for details.</T>
        </View>
      </Pressable>
      <Pressable onPress={dismissSmsProblem} hitSlop={10} style={styles.close} accessibilityRole="button" accessibilityLabel="Dismiss">
        <MaterialIcons name="close" size={20} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "flex-start", margin: 12, marginBottom: 0, borderRadius: 8, backgroundColor: "#fdecea" },
  body: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  text: { fontSize: 13, lineHeight: 18 },
  hint: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  close: { padding: 12 },
});
