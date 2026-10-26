import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { countUnresolved, getTotals, listTransactions, type Totals, type TransactionRecord } from "../../db/transactions";
import { formatRupees } from "../../domain/format";
import { T } from "../../ui/Text";
import { Button, Chip } from "../../ui/forms";
import { RowDivider, TransactionRow } from "../../ui/TransactionRow";
import { colors, fonts, shadow } from "../../ui/theme";

const RECENT_COUNT = 5;

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [totals, setTotals] = useState<Totals>({ incomePaise: 0, expensePaise: 0 });
  const [recent, setRecent] = useState<TransactionRecord[] | null>(null);
  const [unresolved, setUnresolved] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      Promise.all([getTotals(), listTransactions(RECENT_COUNT), countUnresolved()]).then(([t, r, n]) => {
        if (!alive) return;
        setTotals(t);
        setRecent(r);
        setUnresolved(n);
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

      {unresolved > 0 ? (
        <Pressable
          style={styles.review}
          onPress={() => router.navigate({ pathname: "/transactions", params: { review: String(Date.now()) } })}
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

      {recent && recent.length === 0 ? <WelcomeCard onHelp={() => router.push("/help")} /> : null}

      <View style={styles.recentHeader}>
        <T weight="black" style={styles.recentTitle}>
          Recent Transactions
        </T>
        <Chip label="See All" onPress={() => router.navigate("/transactions")} />
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
