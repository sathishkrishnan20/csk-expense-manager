import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getGroup, listGroupsWithBalances } from "../db/groups";
import { countUnresolved, getTotals, listTransactions, type Totals, type TransactionRecord } from "../db/transactions";
import { formatLongDate, formatRupees } from "../domain/format";
import { MAIN_GROUP_ID, groupDatesLabel, type GroupWithBalance } from "../domain/groups";
import { T } from "./Text";
import { Button, Chip } from "./forms";
import { GroupCard } from "./GroupCard";
import { RowDivider, TransactionRow } from "./TransactionRow";
import { colors, fonts, shadow } from "./theme";

const RECENT_COUNT = 5;

// The overview of one group; Main is a group too. Neither has a title bar: the purple block runs to the top of the
// screen. Main shows its wallet icon there, plus its groups and the first-run welcome card; a group (`groupBar`)
// shows a back button, its name and an options button instead.
export interface GroupBar {
  name: string;
  onBack: () => void;
  onMenu: () => void;
}

export function HomeView({ groupId, groupBar }: { groupId: string; groupBar?: GroupBar }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const main = groupId === MAIN_GROUP_ID;
  const [group, setGroup] = useState<GroupWithBalance | null>(null);
  const [totals, setTotals] = useState<Totals>({ incomePaise: 0, expensePaise: 0 });
  const [recent, setRecent] = useState<TransactionRecord[] | null>(null);
  const [unresolved, setUnresolved] = useState(0);
  const [groups, setGroups] = useState<GroupWithBalance[]>([]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      Promise.all([
        getTotals(groupId),
        listTransactions(groupId, RECENT_COUNT),
        countUnresolved(groupId),
        main ? listGroupsWithBalances() : Promise.resolve([]),
        main ? Promise.resolve(null) : getGroup(groupId),
      ]).then(([t, r, n, gs, g]) => {
        if (!alive) return;
        setTotals(t);
        setRecent(r);
        setUnresolved(n);
        setGroups(gs.filter((x) => x.id !== MAIN_GROUP_ID && x.status === "ACTIVE"));
        setGroup(g);
      });
      return () => {
        alive = false;
      };
    }, [groupId, main]),
  );

  // Pages of a group live under /groups/<id>; Main's are the tabs.
  const transactionsPath = main ? "/transactions" : `/groups/${groupId}/transactions`;
  const add = (type: "CREDIT" | "DEBIT") => router.push({ pathname: "/add", params: { type, group: groupId } });
  const dates = group ? groupDatesLabel(group, formatLongDate) : null;

  // Same as the web app: balance is everything in minus everything out.
  const balance = totals.incomePaise - totals.expensePaise;

  return (
    <View style={styles.page}>
      <ScrollView style={styles.page} contentContainerStyle={{ paddingBottom: 32 }}>
        <LinearGradient
          colors={[colors.gradientFrom, colors.gradientTo]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[styles.summary, { paddingTop: insets.top + 16 }, shadow.mid]}
        >
          <View style={[styles.avatarRow, groupBar && styles.avatarRowGroup]}>
            {groupBar ? (
              <>
                <Pressable onPress={groupBar.onBack} style={styles.barButton} hitSlop={8} accessibilityLabel="Back">
                  <MaterialIcons name="arrow-back" size={26} color="#fff" />
                </Pressable>
                <T weight="medium" style={styles.groupName} numberOfLines={1}>
                  {groupBar.name}
                </T>
                <Pressable onPress={groupBar.onMenu} style={styles.barButton} hitSlop={8} accessibilityLabel="Group options">
                  <MaterialIcons name="more-vert" size={26} color="#fff" />
                </Pressable>
              </>
            ) : (
              <View style={styles.avatar}>
                <MaterialIcons name="account-balance-wallet" size={24} color={colors.primary} />
              </View>
            )}
          </View>
          <T style={styles.balanceLabel}>{main ? "Account Balance" : group?.status === "CLOSED" ? "Balance (closed)" : "Balance"}</T>
          <T style={styles.balance} adjustsFontSizeToFit numberOfLines={1}>
            {formatRupees(balance)}
          </T>
          {dates ? <T style={styles.dates}>{dates}</T> : null}
        </LinearGradient>

        <View style={styles.cardsPaper}>
          <View style={styles.cards}>
            <Pressable
              style={[styles.card, { backgroundColor: colors.income }]}
              onPress={() => add("CREDIT")}
            >
              <MaterialIcons name="add-card" size={40} color="#fff" style={{ marginLeft: 4 }} />
              <View style={{ marginLeft: 8, flex: 1 }}>
                <T style={styles.cardLabel}>Income</T>
                <T style={styles.cardAmount} numberOfLines={1} adjustsFontSizeToFit>
                  {formatRupees(totals.incomePaise)}
                </T>
              </View>
            </Pressable>
            <Pressable
              style={[styles.card, { backgroundColor: colors.expense }]}
              onPress={() => add("DEBIT")}
            >
              <MaterialIcons name="credit-card-off" size={40} color="#fff" style={{ marginLeft: 4 }} />
              <View style={{ marginLeft: 8, flex: 1 }}>
                <T style={styles.cardLabel}>Expenses</T>
                <T style={styles.cardAmount} numberOfLines={1} adjustsFontSizeToFit>
                  {formatRupees(totals.expensePaise)}
                </T>
              </View>
            </Pressable>
          </View>
        </View>

        {main ? (
          <>
            <View style={styles.groupsHeader}>
              <T weight="black" style={styles.recentTitle}>
                Groups
              </T>
              <Chip label="All groups" onPress={() => router.push("/groups")} />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.groupsRow}>
              {groups.map((g) => (
                <GroupCard key={g.id} group={g} compact onPress={() => router.push(`/groups/${g.id}`)} />
              ))}
              <Pressable style={styles.newGroup} onPress={() => router.push("/groups/edit")} accessibilityRole="button">
                <MaterialIcons name="add" size={28} color={colors.primary} />
                <T style={{ color: colors.primary, fontSize: 14 }}>New group</T>
              </Pressable>
            </ScrollView>
          </>
        ) : null}

        {unresolved > 0 ? (
          <Pressable
            style={styles.review}
            onPress={() => router.navigate({ pathname: transactionsPath, params: { review: String(Date.now()) } })}
            accessibilityRole="button"
          >
            <MaterialIcons name="help-outline" size={24} color={colors.error} />
            <View style={{ flex: 1 }}>
              <T weight="medium" style={{ fontSize: 14 }}>
                {unresolved} transaction{unresolved === 1 ? "" : "s"} the AI couldn't categorise
              </T>
              <T style={{ fontSize: 13, color: colors.textSecondary }}>Tap to choose a category for them.</T>
            </View>
            <MaterialIcons name="chevron-right" size={24} color={colors.textSecondary} />
          </Pressable>
        ) : null}

        {main && recent && recent.length === 0 ? <WelcomeCard onHelp={() => router.push("/help")} /> : null}

        <View style={styles.recentHeader}>
          <T weight="black" style={styles.recentTitle}>
            Recent Transactions
          </T>
          <Chip label="See All" onPress={() => router.navigate(transactionsPath)} />
        </View>

        {recent && recent.length === 0 ? (
          <T style={styles.empty}>No transactions yet.</T>
        ) : (
          (recent ?? []).map((item) => (
            <View key={item.id}>
              <TransactionRow item={item} onPress={() => router.push({ pathname: "/add", params: { id: item.id } })} />
              <RowDivider />
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

// Shown only until the first transaction exists.
function WelcomeCard({ onHelp }: { onHelp: () => void }) {
  return (
    <View style={styles.welcome}>
      <T weight="bold" style={{ fontSize: 17 }}>
        Welcome! Get started in three steps
      </T>
      {[
        "Config > AI: choose an AI (Gemini, Claude, ChatGPT or Ollama) and save its key.",
        "Config > Categories: check the list. AI only uses your own categories.",
        "Import your bank statement, or add a Credit or Debit by hand.",
      ].map((step, i) => (
        <View key={step} style={styles.welcomeStep}>
          <T style={styles.welcomeNumber}>{i + 1}.</T>
          <T style={styles.welcomeText}>{step}</T>
        </View>
      ))}
      <View style={{ marginTop: 6 }}>
        <Button label="How it works" onPress={onHelp} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  review: { flexDirection: "row", alignItems: "center", gap: 10, margin: 12, padding: 12, borderRadius: 8, backgroundColor: "#fdecea" },
  welcome: { margin: 12, padding: 16, gap: 8, borderRadius: 8, backgroundColor: colors.primaryTint },
  welcomeStep: { flexDirection: "row", gap: 8 },
  welcomeNumber: { width: 20, fontSize: 15, lineHeight: 22, color: colors.textSecondary },
  welcomeText: { flex: 1, fontSize: 15, lineHeight: 22 },
  page: { flex: 1, backgroundColor: colors.background },
  summary: { paddingHorizontal: 16, paddingBottom: 16 },
  avatarRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginHorizontal: 20, gap: 12 },
  // Cancels the block's own padding and Main's side margin, so the buttons sit near the screen edges.
  avatarRowGroup: { marginHorizontal: -10 },
  barButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  groupName: { flex: 1, color: "#fff", fontSize: 18, textAlign: "center" },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  dates: { color: "rgba(255,255,255,0.85)", fontSize: 13, textAlign: "center", marginTop: -8 },
  balanceLabel: { color: "#fff", fontFamily: fonts.serifBold, textAlign: "center", marginTop: 4 },
  balance: {
    color: "#fff",
    fontFamily: fonts.serifBold,
    fontSize: 24,
    textAlign: "center",
    marginVertical: 20,
    marginHorizontal: 20,
  },
  cardsPaper: { padding: 16, backgroundColor: "#fff", ...shadow.low },
  cards: { flexDirection: "row", gap: 20 },
  card: { flex: 1, flexDirection: "row", alignItems: "center", padding: 10, borderRadius: 20 },
  cardLabel: { color: "#fff", fontFamily: fonts.serifBold, fontSize: 10 },
  cardAmount: { color: "#fff", fontFamily: fonts.serifBold, fontSize: 14 },
  recentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
    marginBottom: 4,
    marginLeft: 6,
  },
  recentTitle: { fontSize: 16 },
  groupsHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12, marginLeft: 6, marginRight: 6 },
  groupsRow: { gap: 10, paddingHorizontal: 12, paddingVertical: 8, paddingBottom: 12 },
  newGroup: { width: 110, borderRadius: 8, borderWidth: 1, borderStyle: "dashed", borderColor: colors.primary, alignItems: "center", justifyContent: "center", gap: 2, padding: 12 },
  empty: { textAlign: "center", color: colors.textSecondary, marginTop: 32, marginHorizontal: 32 },
});
