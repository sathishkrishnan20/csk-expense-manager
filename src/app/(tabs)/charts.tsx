import { useCallback, useState } from "react";
import { Alert, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { BarChart, PieChart } from "react-native-gifted-charts";
import { useFocusEffect } from "expo-router";
import {
  getExpensesBy,
  getTotals,
  type ExpenseGrouping,
  type GroupTotal,
  type Totals,
} from "../../db/transactions";
import { formatRupees, monthRange } from "../../domain/format";
import { AppHeader } from "../../ui/Header";
import { T } from "../../ui/Text";
import { DateField, InlineSelect } from "../../ui/forms";
import { colors, shadow } from "../../ui/theme";

const GROUPINGS: { value: ExpenseGrouping; label: string }[] = [
  { value: "category", label: "Category" },
  { value: "subcategory", label: "Sub Category" },
  { value: "payment_method", label: "Payment Method" },
  { value: "payee", label: "Payer" },
];

function rupeesShort(paise: number): string {
  const text = formatRupees(paise);
  return text.endsWith(".00") ? text.slice(0, -3) : text;
}

// Y-axis ticks: 1.5K, 2L, 1Cr.
function compact(rupees: number): string {
  const trim = (n: number) => String(Math.round(n * 10) / 10);
  if (rupees >= 10000000) return `${trim(rupees / 10000000)}Cr`;
  if (rupees >= 100000) return `${trim(rupees / 100000)}L`;
  if (rupees >= 1000) return `${trim(rupees / 1000)}K`;
  return String(Math.round(rupees));
}

export default function Charts() {
  const { width } = useWindowDimensions();
  const initial = monthRange(new Date());
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [grouping, setGrouping] = useState<ExpenseGrouping>("category");
  const [totals, setTotals] = useState<Totals | null>(null);
  const [groups, setGroups] = useState<GroupTotal[]>([]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      Promise.all([getTotals({ start, end }), getExpensesBy(grouping, { start, end })]).then(([t, g]) => {
        if (!alive) return;
        setTotals(t);
        setGroups(g);
      });
      return () => {
        alive = false;
      };
    }, [start, end, grouping]),
  );

  const empty = totals !== null && totals.incomePaise === 0 && totals.expensePaise === 0;

  const total = (totals?.incomePaise ?? 0) + (totals?.expensePaise ?? 0);
  const slice = (paise: number) => (total > 0 && (paise / total) * 360 >= 30 ? rupeesShort(paise) : "");
  const pieData = totals
    ? [
        { value: totals.incomePaise / 100, color: colors.income, text: slice(totals.incomePaise) },
        { value: totals.expensePaise / 100, color: colors.expense, text: slice(totals.expensePaise) },
      ]
    : [];

  const barData = groups.map((g) => ({
    value: g.totalPaise / 100,
    label: g.label,
    frontColor: colors.chart[0],
  }));

  return (
    <View style={styles.page}>
      <AppHeader title="Charts" />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.filters}>
          <View style={{ flex: 1 }}>
            <DateField
              label="Start Date"
              value={start}
              onChange={(v) => (v > end ? Alert.alert("Please select a start date before the end date") : setStart(v))}
            />
          </View>
          <View style={{ flex: 1 }}>
            <DateField
              label="End Date"
              value={end}
              onChange={(v) => (v < start ? Alert.alert("Please select the end date greater than start date") : setEnd(v))}
            />
          </View>
        </View>

        {empty ? (
          <T style={styles.empty}>Not Found</T>
        ) : totals ? (
          <>
            <View style={styles.paper}>
              <T weight="medium" style={styles.title}>
                INCOME AND EXPENSES
              </T>
              <View style={styles.pieRow}>
                <PieChart
                  data={pieData}
                  radius={95}
                  showText
                  textColor="#fff"
                  textSize={13}
                  fontWeight="bold"
                  isAnimated={false}
                />
                <View style={styles.legend}>
                  <LegendItem color={colors.income} label="Income" />
                  <LegendItem color={colors.expense} label="Expenses" />
                </View>
              </View>
            </View>

            {groups.length > 0 ? (
              <View style={[styles.paper, { marginTop: 8 }]}>
                <View style={styles.expensesHeader}>
                  <T weight="medium" style={styles.title}>
                    EXPENSES
                  </T>
                  <InlineSelect label="Group expenses by" value={grouping} options={GROUPINGS} onChange={setGrouping} />
                </View>
                <View style={{ paddingLeft: 4, paddingBottom: 16, overflow: "hidden" }}>
                  <BarChart
                    data={barData}
                    width={width - 96}
                    height={220}
                    barWidth={34}
                    spacing={22}
                    initialSpacing={12}
                    noOfSections={4}
                    yAxisThickness={0}
                    xAxisThickness={1}
                    xAxisColor={colors.outline}
                    rulesColor="#eeeeee"
                    yAxisTextStyle={styles.axisText}
                    xAxisLabelTextStyle={styles.axisText}
                    yAxisLabelWidth={44}
                    formatYLabel={(v) => compact(Number(v))}
                    rotateLabel={barData.length > 4}
                    labelsExtraHeight={barData.length > 4 ? 40 : 0}
                    isAnimated={false}
                    disableScroll={false}
                  />
                </View>
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <T style={{ fontSize: 14 }}>{label}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  filters: { flexDirection: "row", gap: 8, marginHorizontal: 8, marginBottom: 8, paddingTop: 20 },
  empty: { textAlign: "center", marginTop: 120 },
  paper: { backgroundColor: "#fff", ...shadow.low },
  title: { fontSize: 14, letterSpacing: 0.4, padding: 8 },
  pieRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingVertical: 16 },
  legend: { gap: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  swatch: { width: 12, height: 12, borderRadius: 2 },
  expensesHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingRight: 12 },
  axisText: { color: colors.textSecondary, fontSize: 10 },
});
