import { useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { formatLongDate, formatRupeeAmount, formatShortDate } from "../domain/format";
import {
  currentRate,
  formatChange,
  historyRows,
  isToday,
  type Change,
  type HistoryDay,
  type RateCell,
  type Session,
  type SessionRates,
} from "../domain/metalRates";
import type { GoldHistoryTableRow } from "../domain/goldHistory";
import { Segmented } from "./forms";
import { T } from "./Text";
import { colors, shadow } from "./theme";

const MISSING = "—";

// One way of quoting a rate: its label ("per gram") and how a value is written. The first line of a card is its headline.
export interface RateLine {
  label: string;
  format: (value: number) => string;
}

// A metal's rate as a narrow card, three to a row (CardRow): the current rate (PM once it is out, otherwise AM, and the pill says which)
// large, with the second unit under it. Amounts shrink to fit the card rather than wrap. The day's AM and PM figures are in the "Last few
// days" table.
export function RateCard({ title, rate, lines }: { title: string; rate: SessionRates; lines: [RateLine, RateLine] }) {
  const current = currentRate(rate);
  return (
    <View style={styles.tripleCard}>
      <T weight="medium" numberOfLines={1} style={styles.tripleTitle}>
        {title}
      </T>
      {current ? <T style={[styles.session, styles.sessionSmall]}>{current.session} rate</T> : null}
      <T weight="bold" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={styles.tripleHeadline}>
        {current ? lines[0].format(current.value) : MISSING}
      </T>
      <T style={styles.tripleUnit}>{lines[0].label}</T>
      <T numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={styles.tripleSecondary}>
        {current ? lines[1].format(current.value) : "Not published"}
      </T>
      {current ? <T style={styles.tripleUnit}>{lines[1].label}</T> : null}
    </View>
  );
}

// Cards side by side, sharing the width.
export function CardRow({ children }: { children: ReactNode }) {
  return <View style={styles.cardRow}>{children}</View>;
}

// "Rates for November 03, 2026", marked when that is not today (a weekend, a holiday, or today's rates not out yet).
export function RateDate({ date, now, label = "Rates" }: { date: string; now: Date; label?: string }) {
  return (
    <View style={styles.dateRow}>
      <T style={styles.dateText}>
        {label} for {formatLongDate(date)}
      </T>
      {isToday(date, now) ? null : (
        <T weight="medium" style={styles.previous}>
          Previous day's rate
        </T>
      )}
    </View>
  );
}

function ChangeText({ change, decimals }: { change: Change | null; decimals: number }) {
  if (!change) return null;
  const color = change.direction === "up" ? colors.income : change.direction === "down" ? colors.expense : colors.textSecondary;
  return <T style={[styles.change, { color }]}>{formatChange(change, decimals)}</T>;
}

function Cell({ cell, decimals }: { cell: RateCell; decimals: number }) {
  return (
    <View style={styles.tableCell}>
      <T weight="medium" style={styles.cellValue}>
        {cell.value === null ? MISSING : formatRupeeAmount(cell.value, { max: decimals })}
      </T>
      <ChangeText change={cell.change} decimals={decimals} />
    </View>
  );
}

// The last few days side by side, newest first, with how each moved from the day before. AM or PM at a time.
export function HistoryTable({ days }: { days: HistoryDay[] }) {
  const [session, setSession] = useState<Session>("PM");
  const rows = historyRows(days, session);
  return (
    <View>
      <View style={styles.sessionPick}>
        <Segmented
          options={[
            { value: "AM" as Session, label: "AM" },
            { value: "PM" as Session, label: "PM" },
          ]}
          value={session}
          onChange={setSession}
        />
      </View>

      <View style={styles.tableRow}>
        <T weight="medium" style={styles.dateCell}>
          Date
        </T>
        <T weight="medium" style={styles.headCell}>
          24K (999) per g
        </T>
        <T weight="medium" style={styles.headCell}>
          22K (916) per g
        </T>
        <T weight="medium" style={styles.headCell}>
          Silver per kg
        </T>
      </View>
      {rows.length === 0 ? (
        <T style={styles.empty}>No earlier days available yet.</T>
      ) : (
        rows.map((row) => (
          <View key={row.date} style={[styles.tableRow, styles.bodyRow]}>
            <T style={styles.dateCell}>{formatShortDate(row.date)}</T>
            <Cell cell={row.gold999} decimals={1} />
            <Cell cell={row.gold916} decimals={1} />
            <Cell cell={row.silver} decimals={0} />
          </View>
        ))
      )}
    </View>
  );
}

// A single price per gram with no AM/PM (the Nagercoil rates): per gram large, per 8 grams under it. Narrow enough to sit two to a row
// (PerGramRow).
function PerGramCard({ title, perGram }: { title: string; perGram: number }) {
  return (
    <View style={[styles.card, styles.halfCard]}>
      <T weight="medium" style={styles.cardTitle}>
        {title}
      </T>
      <T weight="bold" style={styles.halfHeadline}>
        {formatRupeeAmount(perGram)}
      </T>
      <T style={styles.unit}>per gram</T>
      <T style={styles.secondary}>{formatRupeeAmount(perGram * 8)} per 8 g</T>
    </View>
  );
}

// The 22K and 24K cards side by side.
export function PerGramRow({ price22k, price24k }: { price22k: number; price24k: number }) {
  return (
    <CardRow>
      <PerGramCard title="22K" perGram={price22k} />
      <PerGramCard title="24K" perGram={price24k} />
    </CardRow>
  );
}

// The Nagercoil 22K and 24K rates for the last days, newest first, with how each moved from the day before.
export function NagercoilTable({ rows }: { rows: GoldHistoryTableRow[] }) {
  return (
    <View style={{ marginTop: 8 }}>
      <View style={styles.tableRow}>
        <T weight="medium" style={styles.dateCell}>
          Date
        </T>
        <T weight="medium" style={styles.headCell}>
          22K per g
        </T>
        <T weight="medium" style={styles.headCell}>
          24K per g
        </T>
      </View>
      {rows.map((row) => (
        <View key={row.date} style={[styles.tableRow, styles.bodyRow]}>
          <T style={styles.dateCell}>{formatShortDate(row.date)}</T>
          <Cell cell={row.price22k} decimals={0} />
          <Cell cell={row.price24k} decimals={0} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.outline, borderRadius: 8, padding: 16, marginTop: 12, backgroundColor: colors.surface, ...shadow.low },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { fontSize: 16 },
  session: { fontSize: 12, color: colors.primary, backgroundColor: colors.primaryTint, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, overflow: "hidden" },
  headline: { fontSize: 28, marginTop: 8 },
  halfHeadline: { fontSize: 26, marginTop: 8 },
  cardRow: { flexDirection: "row", gap: 8 },
  tripleCard: { flex: 1, minWidth: 0, borderWidth: 1, borderColor: colors.outline, borderRadius: 8, padding: 10, marginTop: 12, backgroundColor: colors.surface, ...shadow.low },
  tripleTitle: { fontSize: 13 },
  tripleHeadline: { fontSize: 19, marginTop: 6 },
  tripleUnit: { fontSize: 11, color: colors.textSecondary },
  tripleSecondary: { fontSize: 13, color: colors.textSecondary, marginTop: 6 },
  sessionSmall: { fontSize: 10, alignSelf: "flex-start", marginTop: 4, paddingHorizontal: 6 },
  halfCard: { flex: 1 },
  unit: { fontSize: 14, color: colors.textSecondary },
  secondary: { color: colors.textSecondary, fontSize: 14, marginTop: 2 },
  dateRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  dateText: { fontSize: 14, color: colors.textSecondary },
  previous: { fontSize: 12, color: "#8a5a00", backgroundColor: "#fff1d6", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, overflow: "hidden" },
  sessionPick: { marginTop: 8, marginBottom: 8, width: 140 },
  tableRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 8 },
  bodyRow: { borderTopWidth: 1, borderTopColor: colors.outline },
  dateCell: { width: 58, fontSize: 13, color: colors.textSecondary },
  headCell: { flex: 1, fontSize: 12, color: colors.textSecondary, textAlign: "right", paddingHorizontal: 2 },
  tableCell: { flex: 1, alignItems: "flex-end", paddingHorizontal: 2 },
  cellValue: { fontSize: 14 },
  change: { fontSize: 11, marginTop: 1, textAlign: "right" },
  empty: { color: colors.textSecondary, paddingVertical: 12 },
});
