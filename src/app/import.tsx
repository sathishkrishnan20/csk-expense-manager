import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { ImportSummary } from "../import/importStatement";
import { formatLongDate, formatRupees } from "../domain/format";
import { MissingApiKeyError, restoreDeletedRows, runImport } from "../import/services";
import type { PickedFile } from "../platform/files";
import { PdfPasswordError } from "../pdf/errors";
import { ActiveAiLine } from "../ui/ActiveAi";
import { AppHeader } from "../ui/Header";
import { T } from "../ui/Text";
import { Button } from "../ui/forms";
import { UnlockGate } from "../ui/UnlockGate";
import { colors, shadow } from "../ui/theme";

export default function ImportStatement() {
  const router = useRouter();
  // Set when a statement was shared to the app from Mail or Files (see +native-intent.tsx).
  const { file: sharedFile } = useLocalSearchParams<{ file?: string }>();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState(false);
  const [restoreNote, setRestoreNote] = useState<string | null>(null);

  const start = async (file: PickedFile) => {
    setBusy(true);
    try {
      setSummary(await runImport(file, setProgress));
    } catch (err) {
      setNeedsKey(err instanceof MissingApiKeyError || err instanceof PdfPasswordError);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  const reset = () => {
    setError(null);
    setNeedsKey(false);
    setSummary(null);
    setRestoreNote(null);
  };

  const pick = async () => {
    reset();
    const picked = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
    if (picked.canceled) return;
    await start(picked.assets[0]);
  };

  // A statement shared to the app starts importing straight away, once per shared file.
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!sharedFile || handled.current === sharedFile) return;
    handled.current = sharedFile;
    reset();
    void start({ uri: sharedFile });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedFile]);

  const restore = async () => {
    if (!summary) return;
    setError(null);
    setBusy(true);
    try {
      const r = await restoreDeletedRows(summary.deletedEarlier, setProgress);
      const parts = [`${r.restored} deleted transaction${r.restored === 1 ? "" : "s"} added back`];
      if (r.summary) {
        parts.push(`${r.summary.moved} categorised, ${r.summary.stillUncategorised} still uncategorised`);
        if (r.summary.notProcessed > 0) parts.push(`${r.summary.notProcessed} not processed`);
      }
      if (r.keptManual > 0) parts.push(`${r.keptManual} kept the category you chose`);
      const problem = r.error ?? r.summary?.error;
      setRestoreNote(`${parts.join(", ")}.${problem ? ` The AI step stopped: ${problem}. They keep the categories they had.` : ""}`);
      setSummary({ ...summary, deletedEarlier: [] });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  return (
    <View style={styles.page}>
      <AppHeader title="Import Statement" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.body}>
        <T style={styles.text}>
          {
            "Choose the CSV, Excel (.xls, .xlsx) or PDF statement from your bank, or share it to this app from Mail or Files. For a locked PDF, save its password first under Config > Statement passwords. New transactions are categorised with AI from their UPI notes, using your own categories (anything that does not fit goes to Others : Uncategorised). Rows you have already imported are skipped."
          }
        </T>

        <ActiveAiLine />
        <UnlockGate>
          <Button label={busy ? "Working…" : "Choose statement file"} onPress={pick} disabled={busy} />
        </UnlockGate>

        {busy ? (
          <View style={styles.progress}>
            <ActivityIndicator color={colors.primary} />
            <T style={styles.text}>{progress}</T>
          </View>
        ) : null}

        {error ? <T style={styles.error}>{error}</T> : null}
        {needsKey ? <Button label="Open Config" onPress={() => router.navigate("/config")} /> : null}

        {summary ? (
          <View style={styles.card}>
            <T weight="bold">{summary.error ? "Import stopped" : "Import finished"}</T>
            <T style={styles.text}>New transactions saved: {summary.imported}</T>
            <T style={styles.text}>Already imported (skipped): {summary.alreadyStored}</T>
            {summary.deletedEarlier.length > 0 ? (
              <View style={styles.deleted}>
                <T weight="medium" style={styles.text}>
                  {summary.deletedEarlier.length} transaction{summary.deletedEarlier.length === 1 ? " in this file was" : "s in this file were"}{" "}
                  deleted by you earlier, so {summary.deletedEarlier.length === 1 ? "it was" : "they were"} not added again:
                </T>
                {summary.deletedEarlier.slice(0, 5).map((r) => (
                  <T key={r.dedupeKey} style={styles.small} numberOfLines={1}>
                    {formatLongDate(r.txnDate)} · {r.payee ?? "—"} · {formatRupees(r.amountPaise)}
                  </T>
                ))}
                {summary.deletedEarlier.length > 5 ? (
                  <T style={styles.small}>and {summary.deletedEarlier.length - 5} more</T>
                ) : null}
                <Button
                  label={`Add ${summary.deletedEarlier.length === 1 ? "it" : "them"} back and categorise`}
                  onPress={restore}
                  disabled={busy}
                />
                <T style={styles.small}>
                  Uses your selected AI to categorise afresh. A category you chose by hand is kept.
                </T>
              </View>
            ) : null}
            {restoreNote ? <T style={styles.text}>{restoreNote}</T> : null}
            {summary.duplicatesInFile > 0 ? (
              <T style={styles.text}>Repeated within the file (skipped): {summary.duplicatesInFile}</T>
            ) : null}
            {summary.skippedLines > 0 ? (
              <T style={styles.text}>Lines that were not transactions: {summary.skippedLines}</T>
            ) : null}
            {summary.notSaved > 0 ? (
              <T style={styles.error}>
                Not saved: {summary.notSaved}
                {summary.error ? ` — ${summary.error}` : ""}. Fix the cause and upload the same file again; saved rows
                will be skipped.
              </T>
            ) : null}
            <View style={styles.cardAction}>
              <Button label="Continue to Home" onPress={() => router.navigate("/")} />
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { padding: 16, gap: 16 },
  text: { fontSize: 15, lineHeight: 22, color: colors.text },
  small: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  deleted: { gap: 6, padding: 12, borderRadius: 8, backgroundColor: colors.primaryTint },
  progress: { flexDirection: "row", alignItems: "center", gap: 10 },
  error: { color: colors.error, fontSize: 15, lineHeight: 22 },
  cardAction: { marginTop: 10 },
  card: { backgroundColor: "#fff", padding: 16, borderRadius: 4, gap: 6, ...shadow.low },
});
