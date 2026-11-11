import { Pressable, StyleSheet, View } from "react-native";
import { describeQuantity, investedText, isGivenInExchange, isPledged, pledgeDetails, pledgeTitle } from "../domain/assets";
import { rupeesText } from "../domain/gifts";
import type { AssetRecord } from "../db/assets";
import { T } from "./Text";
import { colors } from "./theme";

const PLEDGE = "#9a5b00";

// One asset in the flat list, laid out like a transaction row: the name and how much; the description and what was paid; and, for
// gold with a lender, the pledge in amber with the loan, the ticket and when it is due. `today` is yyyy-mm-dd.
export function AssetRow({ item, today, onPress }: { item: AssetRecord; today: string; onPress: () => void }) {
  const quantity = describeQuantity(item);
  const sold = item.status === "SOLD";
  const second = [sold ? (isGivenInExchange(item) ? "Given in exchange" : "Sold") : null, item.description].filter(Boolean).join(" · ");
  const pledged = !sold && isPledged(item);
  const details = pledged ? pledgeDetails(item, today) : [];

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: "#f6f2ff" }]}>
      <View style={styles.line}>
        <T style={styles.left} numberOfLines={1}>
          {item.name}
        </T>
        {quantity ? (
          <T weight="black" style={{ color: colors.text }}>
            {quantity}
          </T>
        ) : null}
      </View>

      {second || item.investedPaise !== null ? (
        <View style={styles.line}>
          <T weight="light" style={[styles.left, { fontSize: 14 }]} numberOfLines={1}>
            {second}
          </T>
          {item.investedPaise !== null ? (
            <T weight="light" style={{ fontSize: 14 }}>
              {investedText(item.type, item.investedPaise)}
            </T>
          ) : null}
        </View>
      ) : null}

      {pledged ? (
        <>
          <View style={styles.line}>
            <T weight="medium" style={[styles.left, { color: PLEDGE }]} numberOfLines={1}>
              {pledgeTitle(item)}
            </T>
            {item.loanPaise !== null ? (
              <T weight="medium" style={{ color: PLEDGE }}>
                {rupeesText(item.loanPaise)}
              </T>
            ) : null}
          </View>
          {details.length > 0 ? (
            <T weight="light" style={styles.small} numberOfLines={2}>
              {details.join(" · ")}
            </T>
          ) : null}
          {item.pledgeNote ? (
            <T weight="light" style={styles.small} numberOfLines={2}>
              {item.pledgeNote}
            </T>
          ) : null}
        </>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { backgroundColor: "#fff", padding: 8 },
  line: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, minHeight: 24 },
  left: { flex: 1 },
  small: { fontSize: 13, color: colors.grayText },
});
