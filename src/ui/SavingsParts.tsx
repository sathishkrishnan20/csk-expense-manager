import type { ReactNode } from "react";
import { StyleSheet, Switch, View } from "react-native";
import { formatShortDate } from "../domain/format";
import {
  fundDisplay,
  gainOf,
  gainText,
  formatNav,
  formatUnits,
  holdingInvested,
  holdingUnits,
  holdingValue,
  npsSchemeDisplay,
  wholeRupees,
  type SavingsAccount,
  type SavingsHolding,
  type SavingsSummary,
} from "../domain/savings";
import { T } from "./Text";
import { colors } from "./theme";

// The look of the Savings page: a rounded summary card (a small spaced label, the big total, a dashed divider and a few lines), then plain rows with a
// name, small tags, the value in green or red and what was put in in brackets beneath it. Presentation only; every figure is worked out in domain/savings.ts.
const LINE = "#e4e4ea";
const SOFT = "#6b6b76";
const GAIN = colors.income;
const LOSS = colors.expense;

export const shortDate = (iso: string | null): string => (iso ? `${formatShortDate(iso)} ${iso.slice(0, 4)}` : "");

export function DashedLine() {
  // A dashed border on a box taller than the strip shows only its top edge: the reliable way to draw a dashed hairline on iOS and Android.
  return (
    <View style={styles.dashedClip}>
      <View style={styles.dashed} />
    </View>
  );
}

export function Tag({ label, warm }: { label: string; warm?: boolean }) {
  return (
    <View style={[styles.tag, warm && styles.tagWarm]}>
      <T style={styles.tagText}>{label}</T>
    </View>
  );
}

// A card with the app's rounded outline.
export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function SectionTitle({ title, count, right }: { title: string; count?: number; right?: string }) {
  return (
    <View style={styles.sectionTitle}>
      <T weight="medium" style={styles.sectionText}>
        {title}
        {count !== undefined ? <T style={styles.sectionCount}> ({count})</T> : null}
      </T>
      {right ? <T style={styles.sectionRight}>{right}</T> : null}
    </View>
  );
}

const signColor = (paise: number | null): { color: string } | undefined => (paise === null ? undefined : { color: paise < 0 ? LOSS : GAIN });

function Line({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.line}>
      <T style={styles.lineLabel}>{label}</T>
      <T weight="medium" style={[styles.lineValue, color ? { color } : null]}>
        {value}
      </T>
    </View>
  );
}

// The card at the top: the total, how it splits, and for mutual funds and for NPS, each on its own, what was put in and what it has earned on that.
export function SummaryCard({ summary, funds, schemes }: { summary: SavingsSummary; funds: number; schemes: number }) {
  const pfTotal = summary.pf.reduce((sum, p) => sum + p.balancePaise, 0);
  const mfGain = summary.mf && summary.mf.investedPaise !== null ? gainOf(summary.mf.valuePaise, summary.mf.investedPaise) : null;
  const npsGain = summary.nps && summary.nps.contributedPaise !== null ? gainOf(summary.nps.valuePaise, summary.nps.contributedPaise) : null;
  const counted = [funds > 0 ? `${funds} fund${funds === 1 ? "" : "s"}` : null, schemes > 0 ? `${schemes} NPS scheme${schemes === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ");
  return (
    <Card>
      <T style={styles.label}>TOTAL VALUE{counted ? ` · ${counted.toUpperCase()}` : ""}</T>
      <T weight="medium" style={styles.big}>
        {wholeRupees(summary.totalValuePaise)}
      </T>
      <DashedLine />
      {summary.mf ? <Line label="Mutual funds" value={wholeRupees(summary.mf.valuePaise)} /> : null}
      {summary.nps ? <Line label="NPS" value={wholeRupees(summary.nps.valuePaise)} /> : null}
      {summary.pf.length > 0 ? <Line label="PF" value={wholeRupees(pfTotal)} /> : null}
      {summary.mf && summary.mf.investedPaise !== null && mfGain ? (
        <>
          <DashedLine />
          <Line label="Mutual funds invested" value={wholeRupees(summary.mf.investedPaise)} />
          <Line label="Mutual funds returns" value={gainText(mfGain)} color={mfGain.paise < 0 ? LOSS : GAIN} />
        </>
      ) : null}
      {summary.nps && summary.nps.contributedPaise !== null && npsGain ? (
        <>
          <DashedLine />
          <Line label="NPS contributed" value={wholeRupees(summary.nps.contributedPaise)} />
          <Line label="NPS returns" value={gainText(npsGain)} color={npsGain.paise < 0 ? LOSS : GAIN} />
        </>
      ) : null}
    </Card>
  );
}

// One fund or NPS scheme: its name with plan tags, the value (green or red when what was invested is known) with that amount in brackets under it, and
// the units at the NAV used.
export function HoldingRow({ holding, first }: { holding: SavingsHolding; first?: boolean }) {
  const v = holdingValue(holding);
  const display = holding.kind === "mf" ? fundDisplay(holding.name) : npsSchemeDisplay(holding.name);
  const invested = holdingInvested(holding);
  const gain = invested !== null ? gainOf(v.valuePaise, invested) : null;
  return (
    <View style={[styles.item, !first && styles.itemLine]}>
      <View style={styles.itemTop}>
        <T style={styles.itemName} numberOfLines={2}>
          {display.title}
        </T>
        <T weight="medium" style={[styles.itemValue, signColor(gain ? gain.paise : null)]}>
          {wholeRupees(v.valuePaise)}
        </T>
      </View>
      <View style={styles.itemTop}>
        <View style={styles.tags}>
          {display.tags.map((t) => (
            <Tag key={t} label={t} warm={t === "Regular" || t === "Direct"} />
          ))}
        </View>
        {invested !== null ? <T style={styles.invested}>({wholeRupees(invested)})</T> : null}
      </View>
      <View style={styles.itemTop}>
        <T style={styles.itemSub}>
          {formatUnits(holdingUnits(holding), holding.kind === "mf" ? 3 : 4)} units × ₹{formatNav(v.navE4)}
        </T>
        {gain ? <T style={[styles.itemSub, { color: gain.paise < 0 ? LOSS : GAIN }]}>{gainText(gain)}</T> : null}
      </View>
    </View>
  );
}

// The end of a group: its total, with a line of what goes with it.
export function TotalRow({ label, valuePaise, note }: { label: string; valuePaise: number; note?: string }) {
  return (
    <View style={styles.total}>
      <View style={styles.itemTop}>
        <T weight="medium">{label}</T>
        <T weight="medium">{wholeRupees(valuePaise)}</T>
      </View>
      {note ? <T style={styles.itemSub}>{note}</T> : null}
    </View>
  );
}

// A PF account: its balance, the three shares, and the switch that adds each month's usual amount.
export function PfRow({
  account,
  balancePaise,
  first,
  onToggle,
}: {
  account: SavingsAccount;
  balancePaise: number;
  first?: boolean;
  onToggle: (on: boolean) => void;
}) {
  const last4 = `…${account.account.slice(-4)}`;
  const active = account.status === "ACTIVE";
  return (
    <View style={[styles.item, !first && styles.itemLine]}>
      <View style={styles.itemTop}>
        <T style={styles.itemName}>PF {last4}</T>
        <T weight="medium" style={styles.itemValue}>
          {wholeRupees(balancePaise)}
        </T>
      </View>
      <View style={styles.itemTop}>
        <View style={styles.tags}>
          <Tag label={active ? "Active" : "Closed"} warm={active} />
        </View>
        <T style={styles.invested}>Passbook {shortDate(account.asOf)}</T>
      </View>
      <View style={styles.shares}>
        <Share label="Employee" paise={account.ownPaise ?? 0} />
        <Share label="Employer" paise={account.employerPaise ?? 0} />
        <Share label="Pension" paise={account.pensionPaise ?? 0} />
      </View>
      {active ? (
        <View style={styles.autoLine}>
          <View style={{ flex: 1 }}>
            <T style={styles.autoTitle}>Auto-add monthly</T>
            <T style={styles.itemSub}>
              {account.autoAdd ? `Adds ${wholeRupees(account.estOwnPaise + account.estEmployerPaise + account.estPensionPaise)} a month until the passbook shows it` : "Off: months come only from a passbook"}
            </T>
          </View>
          <Switch value={account.autoAdd} onValueChange={onToggle} trackColor={{ true: colors.primary, false: undefined }} accessibilityLabel={`Add each month's contribution for PF ${last4}`} />
        </View>
      ) : null}
    </View>
  );
}

function Share({ label, paise }: { label: string; paise: number }) {
  return (
    <View style={styles.share}>
      <T style={styles.itemSub}>{label}</T>
      <T weight="medium" style={{ fontSize: 14 }}>
        {wholeRupees(paise)}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginTop: 16, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: LINE, backgroundColor: "#fff" },
  label: { fontSize: 11, letterSpacing: 1.6, color: SOFT },
  big: { fontSize: 32, marginTop: 6, marginBottom: 14 },
  dashedClip: { height: 1, overflow: "hidden", marginVertical: 10 },
  dashed: { height: 2, borderWidth: 1, borderStyle: "dashed", borderColor: "#cfcfd8", borderRadius: 1 },
  line: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 7 },
  lineLabel: { fontSize: 15, color: SOFT },
  lineValue: { fontSize: 15 },
  sectionTitle: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginHorizontal: 16, marginTop: 26, marginBottom: 2 },
  sectionText: { fontSize: 17 },
  sectionCount: { fontSize: 17, color: SOFT },
  sectionRight: { fontSize: 13, color: colors.text, textDecorationLine: "underline", textDecorationStyle: "dotted" },
  item: { paddingHorizontal: 16, paddingVertical: 14, gap: 6 },
  itemLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: LINE },
  itemTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  itemName: { fontSize: 16, flex: 1, flexShrink: 1 },
  itemValue: { fontSize: 16 },
  itemSub: { fontSize: 12, color: SOFT, flexShrink: 1 },
  invested: { fontSize: 13, color: SOFT },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, flex: 1 },
  tag: { backgroundColor: "#f1f1f4", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  tagWarm: { backgroundColor: "#fdf4dc" },
  tagText: { fontSize: 12, color: "#3f3f48" },
  total: { paddingHorizontal: 16, paddingVertical: 14, gap: 4, backgroundColor: "#faf8ff", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: LINE, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: LINE },
  shares: { flexDirection: "row", gap: 8, marginTop: 2 },
  share: { flex: 1, gap: 1 },
  autoLine: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  autoTitle: { fontSize: 14 },
});
