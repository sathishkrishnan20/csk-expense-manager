import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getTotals, listTransactions, type Totals, type TransactionRecord } from "../../db/transactions";
import { formatRupees } from "../../domain/format";
import { T } from "../../ui/Text";
import { Chip } from "../../ui/forms";
import { RowDivider, TransactionRow } from "../../ui/TransactionRow";
import { colors, fonts, shadow } from "../../ui/theme";

const RECENT_COUNT = 5;

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [totals, setTotals] = useState<Totals>({ incomePaise: 0, expensePaise: 0 });
  const [recent, setRecent] = useState<TransactionRecord[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      Promise.all([getTotals(), listTransactions(RECENT_COUNT)]).then(([t, r]) => {
        if (!alive) return;
        setTotals(t);
        setRecent(r);
      });
      return () => {
        alive = false;
      };
    }, []),
  );

  // Same as the web app: balance is everything in minus everything out.
  const balance = totals.incomePaise - totals.expensePaise;

  return (
    <ScrollView style={styles.page} contentContainerStyle={{ paddingBottom: 32 }}>
      <LinearGradient
        colors={[colors.gradientFrom, colors.gradientTo]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[styles.summary, { paddingTop: insets.top + 16 }, shadow.mid]}
      >
        <View style={styles.avatarRow}>
          <View style={styles.avatar}>
            <MaterialIcons name="account-balance-wallet" size={24} color={colors.primary} />
          </View>
        </View>
        <T style={styles.balanceLabel}>Account Balance</T>
        <T style={styles.balance} adjustsFontSizeToFit numberOfLines={1}>
          {formatRupees(balance)}
        </T>
      </LinearGradient>

      <View style={styles.cardsPaper}>
        <View style={styles.cards}>
          <Pressable
            style={[styles.card, { backgroundColor: colors.income }]}
            onPress={() => router.push({ pathname: "/add", params: { type: "CREDIT" } })}
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
            onPress={() => router.push({ pathname: "/add", params: { type: "DEBIT" } })}
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

      <View style={styles.recentHeader}>
        <T weight="black" style={styles.recentTitle}>
          Recent Transactions
        </T>
        <Chip label="See All" onPress={() => router.navigate("/transactions")} />
      </View>

      {recent && recent.length === 0 ? (
        <T style={styles.empty}>No transactions yet. Tap + to add one or import your bank statement.</T>
      ) : (
        (recent ?? []).map((item) => (
          <View key={item.id}>
            <TransactionRow item={item} onPress={() => router.push({ pathname: "/add", params: { id: item.id } })} />
            <RowDivider />
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  summary: { paddingHorizontal: 16, paddingBottom: 16 },
  avatarRow: { flexDirection: "row", justifyContent: "space-between", marginHorizontal: 20 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
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
  empty: { textAlign: "center", color: colors.textSecondary, marginTop: 32, marginHorizontal: 32 },
});
