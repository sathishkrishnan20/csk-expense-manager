import { useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import type { ImportSummary } from "../import/importStatement";
import { MissingApiKeyError, runImport } from "../import/services";
import { AppHeader } from "../ui/Header";
import { T } from "../ui/Text";
import { Button } from "../ui/forms";
import { colors, shadow } from "../ui/theme";

export default function ImportStatement() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState(false);

  const pick = async () => {
    setError(null);
    setNeedsKey(false);
    setSummary(null);

    const picked = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
    if (picked.canceled) return;

    setBusy(true);
    try {
      setSummary(await runImport(picked.assets[0].uri, setProgress));
    } catch (err) {
      setNeedsKey(err instanceof MissingApiKeyError);
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
          Choose the CSV you downloaded from your bank. New transactions are categorised with AI from their UPI notes,
          using your own categories (anything that does not fit goes to Others : Uncategorised). Rows you have already
          imported are skipped.
        </T>

        <Button label={busy ? "Working…" : "Choose statement file"} onPress={pick} disabled={busy} />

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
  progress: { flexDirection: "row", alignItems: "center", gap: 10 },
  error: { color: colors.error, fontSize: 15, lineHeight: 22 },
  card: { backgroundColor: "#fff", padding: 16, borderRadius: 4, gap: 6, ...shadow.low },
});
