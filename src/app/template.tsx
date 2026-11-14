import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { loadMonthTemplate } from "../db/monthTemplate";
import { formatRupees } from "../domain/format";
import { containersOf, emptyTemplate, type MonthTemplate } from "../domain/monthTemplate";
import { AppHeader } from "../ui/Header";
import { T } from "../ui/Text";
import { Button, TextButton } from "../ui/forms";
import { colors } from "../ui/theme";

// The monthly template: the entries (and the groups some of them create) that the app makes at the start of each month ("Set up December?"). The owner builds all of it, as when adding
// a transaction: add an entry to Main or to a group, and tick "Create a group for this entry" to make a group under it. Nothing is built in.
export default function TemplateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [template, setTemplate] = useState<MonthTemplate>(emptyTemplate());

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      loadMonthTemplate().then((t) => alive && setTemplate(t));
      return () => {
        alive = false;
      };
    }, []),
  );

  const lineForm = (params: { group: string; id?: string }) => router.push({ pathname: "/template-line", params });
  const containers = containersOf(template);

  return (
    <View style={styles.page}>
      <AppHeader title="Monthly template" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <T style={styles.intro}>
          The entries you want in every month, each on its own day. Add an entry to Main or to a group; tick "Create a group for this entry" to make a group under it, as when you add a transaction. At the start of a month Home offers "Set up December?" and creates it all once you confirm. Group names get the month added ({"{Month} {Year}"} puts it where you want it).
        </T>

        {containers.map(({ id, group, depth, lines }) => (
          <View key={id} style={[styles.card, { marginLeft: depth * 16 }]}>
            <View style={styles.titleRow}>
              <T weight="medium" style={styles.title} numberOfLines={2}>{group ? group.name : "Main"}</T>
              <TextButton label="Add entry" onPress={() => lineForm({ group: id })} />
            </View>
            {group && (group.fundsHere || group.home) ? (
              <View style={styles.tags}>
                {group.fundsHere ? <T style={styles.tag}>Mutual funds go here</T> : null}
                {group.home ? <T style={styles.tag}>Opens on Home</T> : null}
              </View>
            ) : null}
            {lines.length === 0 ? <T style={styles.sub}>No entries yet</T> : null}
            {lines.map((l) => (
              <View key={l.id} style={styles.lineBox}>
                <View style={styles.line}>
                  <T style={styles.lineDay}>{l.day}</T>
                  <View style={{ flex: 1 }}>
                    <T numberOfLines={1}>{l.payee}</T>
                    <T style={styles.sub} numberOfLines={1}>{`${l.category} · ${l.subcategory}`}</T>
                  </View>
                  <T style={{ color: l.direction === "credit" ? colors.income : colors.text, fontSize: 13 }}>{l.amountPaise === null ? "asked each month" : formatRupees(l.amountPaise)}</T>
                  <TextButton label="Edit" onPress={() => lineForm({ group: id, id: l.id })} />
                </View>
                {l.createsGroupId ? <T style={styles.creates}>Creates the group below</T> : null}
              </View>
            ))}
          </View>
        ))}

        {template.lines.length === 0 ? <T style={styles.empty}>Start by adding an entry to Main, for example your salary.</T> : <Button label="Set up a month now" onPress={() => router.push("/month-setup")} />}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { padding: 12, gap: 12 },
  intro: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  empty: { textAlign: "center", color: colors.textSecondary, marginVertical: 8 },
  card: { backgroundColor: "#fff", borderRadius: 8, padding: 12, gap: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(0,0,0,0.12)" },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { flex: 1, fontSize: 16 },
  sub: { color: colors.textSecondary, fontSize: 12 },
  tags: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  tag: { fontSize: 11, color: colors.primary, backgroundColor: "#ede7f6", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, overflow: "hidden" },
  lineBox: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: "rgba(0,0,0,0.12)", paddingVertical: 4 },
  line: { flexDirection: "row", alignItems: "center", gap: 8 },
  lineDay: { width: 24, textAlign: "center", color: colors.textSecondary },
  creates: { color: colors.primary, fontSize: 12, marginLeft: 32 },
});
