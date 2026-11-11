import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useDataVersion } from "../import/dataVersion";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { listGroupsWithBalances } from "../db/groups";
import { countUnresolved, getTotals, listTransactions, type Totals, type TransactionRecord } from "../db/transactions";
import { formatLongDate, formatRupees } from "../domain/format";
import {
  MAIN_GROUP_ID,
  createdGroupInfo,
  groupDatesLabel,
  homeStripGroups,
  stripGroups,
  totalInPaise,
  totalOutPaise,
  type GroupWithBalance,
} from "../domain/groups";
import { T } from "./Text";
import { Button, Chip } from "./forms";
import { GroupCard } from "./GroupCard";
import { SmsProblemBar } from "./SmsProblemBar";
import { TrainAlarmBar } from "./TrainAlarmBar";
import { RowDivider, TransactionRow } from "./TransactionRow";
import { useAddClearance } from "./AddMenu";
import { useOpenDrawer } from "./AppDrawer";
import { colors, fonts, shadow } from "./theme";

const RECENT_COUNT = 5;

// The overview of one group; Main is a group too. Neither has a title bar: the purple block runs to the top of the
// screen. Main shows a menu button there (the wallet icon where there is no drawer), plus its groups and the first-run welcome card; a group (`groupBar`)
// shows a back button, its name, a menu button and an options button instead.
export interface GroupBar {
  name: string;
  onBack: () => void;
  onMenu: () => void;
}

export function HomeView({ groupId, groupBar }: { groupId: string; groupBar?: GroupBar }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const openDrawer = useOpenDrawer();
  const clearance = useAddClearance();
  const main = groupId === MAIN_GROUP_ID;
  // The Home tab shows the home group (Main unless another was chosen); a group opened from the Groups list has its own bar.
  const homeScreen = !groupBar;
  const [group, setGroup] = useState<GroupWithBalance | null>(null);
  const [totals, setTotals] = useState<Totals>({ incomePaise: 0, expensePaise: 0 });
  const [recent, setRecent] = useState<TransactionRecord[] | null>(null);
  const [unresolved, setUnresolved] = useState(0);
  const [allGroups, setAllGroups] = useState<GroupWithBalance[]>([]);
  const dataVersion = useDataVersion();

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      Promise.all([
        getTotals(groupId),
        listTransactions(groupId, RECENT_COUNT),
        countUnresolved(groupId),
        listGroupsWithBalances(),
      ]).then(([t, r, n, gs]) => {
        if (!alive) return;
        setTotals(t);
        setRecent(r);
        setUnresolved(n);
        setAllGroups(gs);
        setGroup(gs.find((x) => x.id === groupId) ?? null);
      });
      return () => {
        alive = false;
      };
    }, [groupId, main, dataVersion]),
  );

  // Pages of a group live under /groups/<id>; Main's are at the top level (/transactions, /charts).
  const transactionsPath = homeScreen ? "/transactions" : `/groups/${groupId}/transactions`;
  const add = (type: "CREDIT" | "DEBIT") => router.push({ pathname: "/add", params: { type, group: groupId } });
  const dates = group ? groupDatesLabel(group, formatLongDate) : null;

  // Everything in minus everything out, counting the groups under this one at any depth: the Income and Expenses cards and the
  // balance all include them, so income minus expenses is the balance.
  const income = group ? totalInPaise(group) : totals.incomePaise;
  const expenses = group ? totalOutPaise(group) : totals.expensePaise;
  const balance = income - expenses;
  const hasSubgroups = !!group && (group.subgroupsInPaise !== 0 || group.subgroupsOutPaise !== 0);
  // The strip: on the Home screen the pinned groups, Main and the other groups; on a group's own page, its subgroups (on Main's page, its groups).
  const strip = homeScreen ? homeStripGroups(allGroups, groupId) : stripGroups(allGroups, groupId);
  const nameOf = new Map(allGroups.map((g) => [g.id, g.name]));

  return (
    <View style={styles.page}>
      <ScrollView style={styles.page} contentContainerStyle={{ paddingBottom: clearance || 32 }}>
        <LinearGradient
          colors={[colors.gradientFrom, colors.gradientTo]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[styles.summary, { paddingTop: insets.top + 16 }, shadow.mid]}
        >
          <View style={[styles.avatarRow, (groupBar || openDrawer) && styles.avatarRowGroup]}>
            {groupBar ? (
              <>
                <Pressable onPress={groupBar.onBack} style={styles.barButton} hitSlop={8} accessibilityLabel="Back">
                  <MaterialIcons name="arrow-back" size={26} color="#fff" />
                </Pressable>
                <T weight="medium" style={styles.groupName} numberOfLines={1}>
                  {groupBar.name}
                </T>
                {openDrawer ? (
                  <Pressable onPress={openDrawer} style={styles.barButton} hitSlop={8} accessibilityRole="button" accessibilityLabel="Open menu">
                    <MaterialIcons name="menu" size={26} color="#fff" />
                  </Pressable>
                ) : null}
                <Pressable onPress={groupBar.onMenu} style={styles.barButton} hitSlop={8} accessibilityLabel="Group options">
                  <MaterialIcons name="more-vert" size={26} color="#fff" />
                </Pressable>
              </>
            ) : (
              <>
                {/* The menu (Assets, Gifts, Groups, ...) opens from here, at the left edge like a group's back button. Where there is no drawer (a wide browser window has the Sidebar) the wallet icon stays instead. */}
                {openDrawer ? (
                  <Pressable onPress={openDrawer} style={styles.barButton} hitSlop={8} accessibilityRole="button" accessibilityLabel="Open menu">
                    <MaterialIcons name="menu" size={26} color="#fff" />
                  </Pressable>
                ) : (
                  <View style={styles.avatar}>
                    <MaterialIcons name="account-balance-wallet" size={24} color={colors.primary} />
                  </View>
                )}
              </>
            )}
          </View>
          <T style={styles.balanceLabel} numberOfLines={1}>
            {main ? "Account Balance" : group?.status === "CLOSED" ? "Balance (closed)" : homeScreen && group ? `${group.name} balance` : "Balance"}
          </T>
          <T style={styles.balance} adjustsFontSizeToFit numberOfLines={1}>
            {formatRupees(balance)}
          </T>
          {dates ? <T style={styles.dates}>{dates}</T> : null}
          {hasSubgroups ? <T style={styles.dates}>Includes the groups under it</T> : null}
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
                  {formatRupees(income)}
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
                  {formatRupees(expenses)}
                </T>
              </View>
            </Pressable>
          </View>
        </View>

        {homeScreen ? <SmsProblemBar /> : null}
        {homeScreen ? <TrainAlarmBar /> : null}

        {/* Groups are only made from an entry (Add > "Create a group for this entry"), so there is no New group button here. */}
        {strip.length > 0 ? (
          <>
            <View style={styles.groupsHeader}>
              <T weight="black" style={styles.recentTitle}>
                {homeScreen || main ? "Groups" : "Subgroups"}
              </T>
              {homeScreen || main ? <Chip label="All groups" onPress={() => router.push("/groups")} /> : null}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.groupsRow}>
              {strip.map((g) => (
                <GroupCard
                  key={g.id}
                  group={g}
                  compact
                  parentName={g.parentId && g.parentId !== groupId && g.parentId !== MAIN_GROUP_ID ? nameOf.get(g.parentId) : null}
                  onPress={() => router.push(`/groups/${g.id}`)}
                />
              ))}
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

        {homeScreen && main && recent && recent.length === 0 && allGroups.length <= 1 ? <WelcomeCard onHelp={() => router.push("/help")} /> : null}

        <View style={styles.recentHeader}>
          <T weight="black" style={styles.recentTitle}>
            Recent Transactions
          </T>
          <Chip label="See All" onPress={() => router.navigate({ pathname: transactionsPath, params: { fresh: String(Date.now()) } })} />
        </View>

        {recent && recent.length === 0 ? (
          <T style={styles.empty}>No transactions yet.</T>
        ) : (
          (recent ?? []).map((item) => (
            <View key={item.id}>
              <TransactionRow
                item={item}
                createdGroup={createdGroupInfo(allGroups, item.createdGroupId)}
                onPress={() => router.push({ pathname: "/add", params: { id: item.id } })}
              />
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
