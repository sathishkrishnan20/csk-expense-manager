import { useCallback, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { listTransactions, type TransactionRecord } from "../../db/transactions";
import { AppHeader } from "../../ui/Header";
import { T } from "../../ui/Text";
import { RowDivider, TransactionRow } from "../../ui/TransactionRow";
import { colors } from "../../ui/theme";

export default function Transactions() {
  const router = useRouter();
  const [items, setItems] = useState<TransactionRecord[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      listTransactions().then((rows) => alive && setItems(rows));
      return () => {
        alive = false;
      };
    }, []),
  );

  return (
    <View style={styles.page}>
      <AppHeader title="Transactions" />
      <FlatList
        data={items ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TransactionRow item={item} onPress={() => router.push({ pathname: "/add", params: { id: item.id } })} />
        )}
        ItemSeparatorComponent={RowDivider}
        contentContainerStyle={{ paddingBottom: 32 }}
        ListEmptyComponent={
          items ? <T style={styles.empty}>No transactions yet. Tap + to add one or import your bank statement.</T> : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  empty: { textAlign: "center", color: colors.textSecondary, marginTop: 48, marginHorizontal: 32 },
});
