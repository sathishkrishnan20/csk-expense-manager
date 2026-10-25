import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { addPaymentMethod, loadPaymentMethods, removePaymentMethod } from "../../db/config";
import { countReclassifyCandidates } from "../../db/transactions";
import { runReclassify } from "../../import/services";
import { MODELS, type Provider } from "../../llm/providers";
import { loadApiKey, loadSettings, saveApiKey, saveProvider } from "../../settings/settings";
import { CategoriesSection } from "../../ui/CategoriesSection";
import { DataBackupSection } from "../../ui/DataBackupSection";
import { AppHeader } from "../../ui/Header";
import { T } from "../../ui/Text";
import { Button, OutlinedInput } from "../../ui/forms";
import { colors } from "../../ui/theme";

type Section = "payments" | "category" | "ai" | "backup" | "reclassify" | "";

export default function Config() {
  const [expanded, setExpanded] = useState<Section>("payments");
  const toggle = (section: Section) => setExpanded(expanded === section ? "" : section);

  return (
    <View style={styles.page}>
      <AppHeader title="Config" />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
        <Accordion title="Payment Modes" open={expanded === "payments"} onToggle={() => toggle("payments")}>
          <PaymentModes />
        </Accordion>
        <Accordion title="Categories" open={expanded === "category"} onToggle={() => toggle("category")}>
          <CategoriesSection />
        </Accordion>
        <Accordion title="AI" open={expanded === "ai"} onToggle={() => toggle("ai")}>
          <AiSection />
        </Accordion>
        <Accordion title="Export and Import" open={expanded === "backup"} onToggle={() => toggle("backup")}>
          <DataBackupSection />
        </Accordion>
        <Accordion
          title="Re-classify Uncategorised"
          open={expanded === "reclassify"}
          onToggle={() => toggle("reclassify")}
        >
          <ReclassifySection />
        </Accordion>
      </ScrollView>
    </View>
  );
}

function Accordion({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <View style={styles.accordion}>
      <Pressable style={styles.summary} onPress={onToggle}>
        <T>{title}</T>
        <MaterialIcons
          name="arrow-downward"
          size={24}
          color={colors.textSecondary}
          style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}
        />
      </Pressable>
      {open ? <View style={styles.details}>{children}</View> : null}
    </View>
  );
}

function PaymentModes() {
  const [methods, setMethods] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => loadPaymentMethods().then(setMethods), []);
  useEffect(() => {
    reload();
  }, [reload]);

  const add = async () => {
    try {
      await addPaymentMethod(name);
      setName("");
      setError(null);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const remove = (method: string) =>
    Alert.alert(`Remove "${method}"?`, "Existing transactions keep it.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => removePaymentMethod(method).then(reload) },
    ]);

  return (
    <View>
      {methods.map((m) => (
        <View key={m} style={styles.listRow}>
          <T style={{ flex: 1 }}>{m}</T>
          <Pressable hitSlop={10} onPress={() => remove(m)} accessibilityLabel={`Remove ${m}`}>
            <MaterialIcons name="highlight-off" size={24} color={colors.error} />
          </Pressable>
        </View>
      ))}
      <View style={styles.addPayment}>
        <View style={{ flex: 1 }}>
          <OutlinedInput label="New payment mode" value={name} onChangeText={setName} />
        </View>
        <Button label="Add" onPress={add} disabled={name.trim() === ""} />
      </View>
      {error ? <T style={styles.error}>{error}</T> : null}
    </View>
  );
}

const PROVIDER_LABEL: Record<Provider, string> = { gemini: "Gemini", anthropic: "Claude" };

function AiSection() {
  const [provider, setProvider] = useState<Provider>("gemini");
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    loadSettings().then((s) => {
      setProvider(s.provider);
      setApiKey(s.apiKey ?? "");
    });
  }, []);

  const choose = async (next: Provider) => {
    setProvider(next);
    setStatus("");
    await saveProvider(next);
    setApiKey((await loadApiKey(next)) ?? "");
  };

  const save = async () => {
    await saveApiKey(provider, apiKey);
    setStatus(apiKey.trim() ? "Saved to the iOS Keychain." : "Key removed.");
  };

  return (
    <View style={{ gap: 12 }}>
      <View style={styles.segment}>
        {(Object.keys(PROVIDER_LABEL) as Provider[]).map((p) => (
          <Pressable key={p} style={[styles.segmentOption, provider === p && styles.segmentActive]} onPress={() => choose(p)}>
            <T weight="medium" style={{ color: provider === p ? "#fff" : colors.primary, fontSize: 15 }}>
              {PROVIDER_LABEL[p]}
            </T>
          </Pressable>
        ))}
      </View>
      <T style={styles.muted}>Model: {MODELS[provider]}</T>

      <OutlinedInput
        label={`${PROVIDER_LABEL[provider]} API key`}
        value={apiKey}
        onChangeText={setApiKey}
        secureTextEntry
        autoCapitalize="none"
      />
      <Button label="Save key" onPress={save} />
      {status ? <T style={styles.muted}>{status}</T> : null}

      <T style={styles.note}>
        Gemini keys come from Google AI Studio and have a free tier. Claude keys come from the Anthropic Console and are
        billed per use, separately from any claude.ai subscription. The key stays in the iOS Keychain on this phone.
      </T>
      <T style={styles.note}>
        When you import, each new transaction's payee, UPI note, narration and amount is sent to the provider you choose
        so it can be categorised. Nothing else leaves your phone.
      </T>

    </View>
  );
}

function ReclassifySection() {
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<{ text: string; isError: boolean } | null>(null);

  useFocusEffect(
    useCallback(() => {
      countReclassifyCandidates().then(setPending);
    }, []),
  );

  const reclassify = async () => {
    setBusy(true);
    setResult(null);
    try {
      const s = await runReclassify(setProgress);
      const parts = [`${s.moved} moved to a category`, `${s.stillUncategorised} still uncategorised`];
      if (s.notProcessed > 0) parts.push(`${s.notProcessed} not processed`);
      setResult({
        text: s.error ? `${parts.join(", ")}. Stopped: ${s.error}` : `${parts.join(", ")}.`,
        isError: s.error !== null,
      });
    } catch (err) {
      setResult({ text: err instanceof Error ? err.message : String(err), isError: true });
    } finally {
      setBusy(false);
      setProgress("");
      countReclassifyCandidates().then(setPending);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      <T style={styles.note}>
        After adding categories, re-run the AI on imported transactions that ended up in Others : Uncategorised. Anything
        you categorised by hand is left alone. Needs internet and your AI key (see AI).
      </T>
      <Button
        label={busy ? "Working…" : `Re-classify uncategorised (${pending})`}
        onPress={reclassify}
        disabled={busy || pending === 0}
      />
      {busy && progress ? <T style={styles.muted}>{progress}</T> : null}
      {result ? <T style={result.isError ? styles.error : styles.muted}>{result.text}</T> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  accordion: { backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e0e0e0" },
  summary: {
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  details: { paddingHorizontal: 16, paddingBottom: 16 },
  listRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingLeft: 8 },
  addPayment: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  error: { color: colors.error, fontSize: 14, marginTop: 4 },
  muted: { color: colors.textSecondary, fontSize: 14 },
  note: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  divider: { height: 1, backgroundColor: "#e0e0e0", marginVertical: 4 },
  segment: { flexDirection: "row", borderRadius: 4, borderWidth: 1, borderColor: colors.primary, overflow: "hidden" },
  segmentOption: { flex: 1, paddingVertical: 10, alignItems: "center" },
  segmentActive: { backgroundColor: colors.primary },
});
