import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { addPaymentMethod, loadPaymentMethods, removePaymentMethod } from "../../db/config";
import { countReclassifyCandidates } from "../../db/transactions";
import { runReclassify } from "../../import/services";
import { DEFAULT_OLLAMA_URL, PROVIDER_LABEL, providerNeedsKey, type Provider } from "../../llm/providers";
import { confirmAction } from "../../platform/dialogs";
import { secureStorageLabel } from "../../platform/secureStorage";
import { useSecureLock } from "../../platform/useSecureLock";
import {
  hasApiKey,
  loadApiKey,
  loadModel,
  loadOllamaUrl,
  loadProvider,
  saveApiKey,
  saveModel,
  saveOllamaUrl,
  saveProvider,
} from "../../settings/settings";
import { CategoriesSection } from "../../ui/CategoriesSection";
import { DataBackupSection } from "../../ui/DataBackupSection";
import { AiStatus, ActiveAiLine } from "../../ui/ActiveAi";
import { AppHeader } from "../../ui/Header";
import { T } from "../../ui/Text";
import { Button, OutlinedInput } from "../../ui/forms";
import { UnlockGate } from "../../ui/UnlockGate";
import { colors } from "../../ui/theme";

type Section = "payments" | "category" | "ai" | "backup" | "reclassify" | "";

export default function Config() {
  const router = useRouter();
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
        <Pressable style={[styles.accordion, styles.summary]} onPress={() => router.push("/help")} accessibilityRole="link">
          <T>How it works</T>
          <MaterialIcons name="chevron-right" size={24} color={colors.textSecondary} />
        </Pressable>
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

  const remove = async (method: string) => {
    const confirmed = await confirmAction({
      title: `Remove "${method}"?`,
      message: "Existing transactions keep it.",
      confirmLabel: "Remove",
    });
    if (confirmed) await removePaymentMethod(method).then(reload);
  };

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

const PROVIDER_NOTE: Record<Provider, string> = {
  gemini: "Gemini keys come from Google AI Studio and have a free tier.",
  anthropic:
    "Claude keys come from the Anthropic Console and are billed per use, separately from any claude.ai subscription.",
  openai:
    "ChatGPT here means the OpenAI API: keys come from platform.openai.com and are billed per use, separately from a ChatGPT subscription.",
  ollama:
    "Ollama runs open models on your own computer: free, and nothing leaves your network. Install it, run it, and pull the model (for example: ollama pull llama3.2). On an iPhone, use that computer's address on the same Wi-Fi (for example http://192.168.1.20:11434) and start Ollama with OLLAMA_HOST=0.0.0.0; in a browser, localhost works. Small models place transactions less accurately than the cloud ones.",
};

function AiSection() {
  const [provider, setProvider] = useState<Provider>("gemini");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [savedModel, setSavedModel] = useState(""); // what is actually used, not what is being typed
  const [keySaved, setKeySaved] = useState(false);
  const [ollamaUrl, setOllamaUrl] = useState(DEFAULT_OLLAMA_URL);
  const [status, setStatus] = useState("");
  const { locked } = useSecureLock();
  const needsKey = providerNeedsKey(provider);

  useEffect(() => {
    loadProvider().then(setProvider);
    loadOllamaUrl().then(setOllamaUrl);
  }, []);

  // Each provider keeps its own model and key; they are read again when the provider changes.
  useEffect(() => {
    loadModel(provider).then((m) => {
      setModel(m);
      setSavedModel(m);
    });
  }, [provider]);

  const refreshKeySaved = useCallback(() => hasApiKey(provider).then(setKeySaved), [provider]);
  useEffect(() => {
    refreshKeySaved();
  }, [refreshKeySaved]);

  // The key is also read again when the web build is unlocked.
  useEffect(() => {
    if (!needsKey || locked) {
      setApiKey("");
      return;
    }
    loadApiKey(provider)
      .then((key) => setApiKey(key ?? ""))
      .catch(() => setApiKey(""));
  }, [provider, needsKey, locked]);

  const choose = async (next: Provider) => {
    setProvider(next);
    setStatus("");
    await saveProvider(next);
  };

  const save = async () => {
    try {
      await saveModel(provider, model);
      const stored = await loadModel(provider);
      setModel(stored);
      setSavedModel(stored);
      if (provider === "ollama") {
        await saveOllamaUrl(ollamaUrl);
        setOllamaUrl(await loadOllamaUrl());
        setStatus("Saved.");
      } else {
        await saveApiKey(provider, apiKey);
        await refreshKeySaved();
        setStatus(apiKey.trim() ? `Saved. The key is in ${secureStorageLabel}.` : "Key removed.");
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
  };

  const fields = (
    <>
      <OutlinedInput label="Model" value={model} onChangeText={setModel} autoCapitalize="none" />
      {needsKey ? (
        <OutlinedInput
          label={`${PROVIDER_LABEL[provider]} API key`}
          value={apiKey}
          onChangeText={setApiKey}
          secureTextEntry
          autoCapitalize="none"
        />
      ) : (
        <OutlinedInput label="Ollama address" value={ollamaUrl} onChangeText={setOllamaUrl} autoCapitalize="none" keyboardType="url" />
      )}
      <Button label="Save" onPress={save} />
    </>
  );

  return (
    <View style={{ gap: 12 }}>
      <AiStatus provider={provider} model={savedModel} keySaved={keySaved} />
      <T style={styles.note}>
        Pick the AI that categorises your transactions. Your pick applies straight away; Save stores the model and key
        for the one selected. Only this one is used.
      </T>
      <View style={styles.segment}>
        {(Object.keys(PROVIDER_LABEL) as Provider[]).map((p) => (
          <Pressable key={p} style={[styles.segmentOption, provider === p && styles.segmentActive]} onPress={() => choose(p)}>
            {provider === p ? <MaterialIcons name="check" size={16} color="#fff" /> : null}
            <T weight="medium" numberOfLines={1} style={{ color: provider === p ? "#fff" : colors.primary, fontSize: 14 }}>
              {PROVIDER_LABEL[p]}
            </T>
          </Pressable>
        ))}
      </View>

      {needsKey ? <UnlockGate>{fields}</UnlockGate> : fields}
      {status ? <T style={styles.muted}>{status}</T> : null}

      <T style={styles.note}>
        {PROVIDER_NOTE[provider]}
        {needsKey ? ` The key stays in ${secureStorageLabel}.` : ""}
      </T>
      <T style={styles.note}>
        When you import or re-classify, each transaction's payee, UPI note, narration and amount is sent to the AI you
        choose so it can be categorised{needsKey ? "" : " (here, to your own Ollama server)"}. Nothing else leaves your
        device. Each provider keeps its own key and model, so switching does not delete the others.
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
        After adding categories, re-run the AI on imported transactions that ended up in Others : Uncategorised, and on
        entries you added by hand with "Categorise later". Anything you categorised by hand is left alone. Needs internet and your AI key (see AI).
      </T>
      <ActiveAiLine />
      <UnlockGate>
        <Button
          label={busy ? "Working…" : `Re-classify uncategorised (${pending})`}
          onPress={reclassify}
          disabled={busy || pending === 0}
        />
      </UnlockGate>
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
  segmentOption: { flex: 1, paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  segmentActive: { backgroundColor: colors.primary },
});
