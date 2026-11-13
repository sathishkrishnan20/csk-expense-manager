import { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, StyleSheet, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { addDueEstimates, loadSavings, updatePfAutoAdd } from "../db/savings";
import { describeImport, monthLabel, monthLines, summarise, wholeRupees, type SavingsAccount, type SavingsOverview } from "../domain/savings";
import { importSavingsFile } from "../import/savingsImport";
import { pullSavingsMail } from "../import/savingsMail";
import { PdfPasswordError } from "../pdf/errors";
import { liveNavSupported, refreshLiveNavs } from "../rates/navRefresh";
import { AppHeader, HeaderTextButton } from "../ui/Header";
import { Card, HoldingRow, PfRow, SectionTitle, SummaryCard, TotalRow, shortDate } from "../ui/SavingsParts";
import { T } from "../ui/Text";
import { Button, TextButton } from "../ui/forms";
import { colors, shadow } from "../ui/theme";

const MONTHS_SHOWN = 12;
const dash = (paise: number): string => (paise === 0 ? "–" : wholeRupees(paise));
const lastDigits = (id: string): string => `…${id.slice(-4)}`;

// Savings: what has been put into mutual funds, NPS and PF, and what the holdings are worth. Information only (nothing here is a transaction or part of
// any balance). The figures come from statements imported here (the CDSL CAS, the Protean NPS statement, the EPF passbook); mutual fund and NPS values
// are the statement's units at today's NAV where the NAV can be looked up. A PF account's switch adds each month's usual contribution as an estimate
// until a passbook shows the real one.
export default function SavingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [overview, setOverview] = useState<SavingsOverview | null>(null);
  const [busy, setBusy] = useState("");
  const [messages, setMessages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [navNote, setNavNote] = useState("");
  const alive = useRef(true);

  const reload = useCallback(async () => {
    const next = await loadSavings();
    if (alive.current) setOverview(next);
  }, []);

  // Each time the page opens: add the PF estimates that are due, show what is stored, then look up today's NAV (at most every few hours) and show that.
  useFocusEffect(
    useCallback(() => {
      alive.current = true;
      (async () => {
        try {
          await addDueEstimates();
          await reload();
          // Statements that arrived by email (Config > Savings by email) are collected and imported each time the page opens.
          const mail = await pullSavingsMail();
          if (alive.current && (mail.reports.length > 0 || mail.errors.length > 0)) {
            setMessages([...mail.reports.flatMap(describeImport), ...mail.errors.map((e) => `Email: ${e}`)]);
            await addDueEstimates();
            await reload();
          }
          const outcome = await refreshLiveNavs({ force: mail.reports.length > 0 });
          if (outcome.status === "updated") await reload();
        } catch (err) {
          if (alive.current) setError(err instanceof Error ? err.message : String(err));
        }
      })();
      return () => {
        alive.current = false;
      };
    }, [reload]),
  );

  const summary = useMemo(() => (overview ? summarise(overview) : null), [overview]);
  const lines = useMemo(() => (overview ? monthLines(overview.months) : []), [overview]);
  const nothing = overview !== null && overview.months.length === 0 && overview.holdings.length === 0 && overview.accounts.length === 0;

  const run = async (label: string, work: () => Promise<void>) => {
    setError(null);
    setBusy(label);
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (alive.current) setBusy("");
    }
  };

  const importFile = () =>
    run("Importing…", async () => {
      const picked = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
      if (picked.canceled) return;
      setMessages([]);
      try {
        const report = await importSavingsFile(picked.assets[0], setBusy);
        setMessages(describeImport(report));
      } catch (err) {
        if (err instanceof PdfPasswordError) throw new Error(`${err.message}`);
        throw err;
      }
      await addDueEstimates();
      await reload();
      setBusy("Looking up today's NAV…");
      const outcome = await refreshLiveNavs({ force: true });
      if (outcome.status === "updated") await reload();
      else if (outcome.status === "failed") setNavNote("Today's NAV could not be looked up, so the values are as the statement printed them.");
    });

  const refresh = () =>
    run("Looking up today's NAV…", async () => {
      const outcome = await refreshLiveNavs({ force: true });
      setNavNote(
        outcome.status === "failed"
          ? "Today's NAV could not be looked up. Check your connection and try again."
          : outcome.status === "nothing"
            ? "Import a mutual fund or NPS statement first."
            : outcome.updated === 0
              ? "No newer NAV than the statement's was found."
              : `Updated ${outcome.updated} NAV${outcome.updated === 1 ? "" : "s"}.`,
      );
      await reload();
    });

  const toggle = (account: SavingsAccount, on: boolean) =>
    run("", async () => {
      await updatePfAutoAdd(account.account, on);
      await reload();
    });

  const shownLines = showAll ? lines : lines.slice(0, MONTHS_SHOWN);
  const mfHoldings = overview?.holdings.filter((h) => h.kind === "mf") ?? [];
  const npsHoldings = overview?.holdings.filter((h) => h.kind === "nps") ?? [];

  return (
    <View style={styles.page}>
      <AppHeader title="Savings" onBack={() => router.back()} right={liveNavSupported ? <HeaderTextButton label="Refresh" onPress={refresh} /> : undefined} />
      <ScrollView contentContainerStyle={{ paddingBottom: 96 + insets.bottom }} keyboardShouldPersistTaps="handled">
        {error ? <T style={styles.error}>{error}</T> : null}
        {messages.length > 0 ? (
          <View style={styles.notice}>
            {messages.map((m) => (
              <T key={m} style={styles.noticeText}>
                {m}
              </T>
            ))}
          </View>
        ) : null}
        {overview === null && !error ? <ActivityIndicator style={{ marginTop: 32 }} color={colors.primary} /> : null}

        {nothing ? (
          <T style={styles.empty}>
            Nothing here yet. Tap Import statement and choose a PDF: the mutual fund consolidated statement (CAS), the Protean NPS statement, or an EPF passbook.
            PDF passwords are taken from Config &gt; Statement passwords.
          </T>
        ) : null}

        {summary && !nothing ? (
          <>
            <SummaryCard summary={summary} funds={mfHoldings.length} schemes={npsHoldings.length} />

            {lines.length > 0 ? (
              <>
                <SectionTitle title="Contributed each month" />
                <Card>
                  <View style={styles.tr}>
                    <T style={[styles.th, styles.monthCol]}>Month</T>
                    <T style={[styles.th, styles.num]}>MF</T>
                    <T style={[styles.th, styles.num]}>NPS</T>
                    <T style={[styles.th, styles.num]}>PF</T>
                    <T style={[styles.th, styles.num]}>Total</T>
                  </View>
                  {shownLines.map((l) => (
                    <View key={l.month} style={[styles.tr, styles.rowLine]}>
                      <T style={[styles.td, styles.monthCol]}>{monthLabel(l.month)}</T>
                      <T style={[styles.td, styles.num]}>{dash(l.mfPaise)}</T>
                      <T style={[styles.td, styles.num]}>{dash(l.npsPaise)}</T>
                      <T style={[styles.td, styles.num]}>{dash(l.pfPaise)}</T>
                      <T weight="medium" style={[styles.td, styles.num]}>
                        {wholeRupees(l.totalPaise)}
                      </T>
                    </View>
                  ))}
                  {lines.length > MONTHS_SHOWN ? (
                    <TextButton label={showAll ? "Show the last 12 months" : `Show all ${lines.length} months`} onPress={() => setShowAll(!showAll)} />
                  ) : null}
                </Card>
                <T style={styles.hint}>
                  A dash means no figure yet: import an older statement to fill it. MF is the money put into your funds that month (for the latest month it comes
                  from your SIP emails until the next CAS replaces it); NPS and PF are for the month the contribution is for.
                </T>
              </>
            ) : null}

            {summary.mf ? (
              <>
                <SectionTitle title="Mutual funds" count={mfHoldings.length} right="Current (Invested)" />
                <T style={styles.asOf}>
                  {summary.mf.live && summary.mf.navDate ? `NAV of ${shortDate(summary.mf.navDate)} on the units of ${shortDate(summary.mf.asOf)}` : `As of the statement of ${shortDate(summary.mf.asOf)}`}
                </T>
                {mfHoldings.map((h, i) => (
                  <HoldingRow key={`${h.account}-${h.code}`} holding={h} first={i === 0} />
                ))}
                <TotalRow
                  label="Total"
                  valuePaise={summary.mf.valuePaise}
                  note={summary.mf.investedPaise !== null ? `Invested ${wholeRupees(summary.mf.investedPaise)}` : undefined}
                />
              </>
            ) : null}

            {summary.nps ? (
              <>
                <SectionTitle title="NPS" count={npsHoldings.length} />
                <T style={styles.asOf}>
                  {summary.nps.live && summary.nps.navDate ? `NAV of ${shortDate(summary.nps.navDate)} on the units of ${shortDate(summary.nps.asOf)}` : `As of the statement of ${shortDate(summary.nps.asOf)}`}
                </T>
                {npsHoldings.map((h, i) => (
                  <HoldingRow key={`${h.account}-${h.code}`} holding={h} first={i === 0} />
                ))}
                <TotalRow
                  label="Total"
                  valuePaise={summary.nps.valuePaise}
                  note={[summary.nps.contributedPaise !== null ? `Contributed ${wholeRupees(summary.nps.contributedPaise)}` : null, summary.nps.xirr ? `Return ${summary.nps.xirr}%` : null]
                    .filter(Boolean)
                    .join(" · ")}
                />
              </>
            ) : null}

            {summary.mf || summary.nps
              ? Platform.select({
                  ios: navNote ? <T style={styles.hint}>{navNote}</T> : null,
                  android: navNote ? <T style={styles.hint}>{navNote}</T> : null,
                  web: <T style={styles.hint}>Today's NAV is not looked up in the web build yet, so the values are as the statements printed them.</T>,
                  default: null,
                })
              : null}

            {summary.pf.length > 0 ? (
              <>
                <SectionTitle title="PF" count={summary.pf.length} />
                <T style={styles.asOf}>Employee plus employer; the pension share is kept apart</T>
                {summary.pf.map(({ account, balancePaise }, i) => (
                  <PfRow key={account.account} account={account} balancePaise={balancePaise} first={i === 0} onToggle={(on) => toggle(account, on)} />
                ))}
                {summary.pf.length > 1 ? <TotalRow label="Total" valuePaise={summary.pf.reduce((sum, p) => sum + p.balancePaise, 0)} /> : null}
              </>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      <View style={[styles.actions, { paddingBottom: insets.bottom + 8 }]}>
        {busy ? <T style={styles.busy}>{busy}</T> : null}
        <Button label="Import statement" onPress={importFile} disabled={busy !== ""} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  error: { color: colors.error, margin: 16 },
  notice: { backgroundColor: colors.primaryTint, margin: 16, marginBottom: 0, padding: 12, borderRadius: 8, gap: 4 },
  noticeText: { fontSize: 14 },
  empty: { textAlign: "center", color: colors.textSecondary, marginTop: 32, marginHorizontal: 32 },
  small: { fontSize: 12, color: colors.textSecondary },
  asOf: { fontSize: 12, color: colors.textSecondary, marginHorizontal: 16, marginBottom: 6 },
  tr: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#e4e4ea" },
  th: { fontSize: 12, color: colors.textSecondary },
  td: { fontSize: 13 },
  monthCol: { width: 72 },
  num: { flex: 1, textAlign: "right" },
  hint: { fontSize: 12, color: colors.textSecondary, marginHorizontal: 16, marginTop: 6 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 8, paddingHorizontal: 8, backgroundColor: "#fff", ...shadow.high },
  busy: { fontSize: 13, color: colors.textSecondary, marginHorizontal: 8 },
});
