import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { PROVIDER_LABEL, providerNeedsKey, type Provider } from "../llm/providers";
import { hasApiKey, loadModel, loadProvider } from "../settings/settings";
import { T } from "./Text";
import { colors } from "./theme";

// Which AI will categorise, and whether it is ready; shared by Config > AI, Import and Re-classify.
export function AiStatus({ provider, model, keySaved }: { provider: Provider; model: string; keySaved: boolean }) {
  const ready = !providerNeedsKey(provider) || keySaved;
  return (
    <View style={[styles.box, { backgroundColor: ready ? colors.primaryTint : "#fdecea" }]}>
      <MaterialIcons
        name={ready ? "check-circle" : "error-outline"}
        size={22}
        color={ready ? colors.primary : colors.error}
      />
      <View style={{ flex: 1 }}>
        <T weight="medium" style={{ fontSize: 14 }}>
          AI in use: {PROVIDER_LABEL[provider]} ({model})
        </T>
        <T style={styles.sub}>
          {!providerNeedsKey(provider) ? "No key needed." : keySaved ? "API key saved." : "No API key yet. Add one in Config > AI."}
        </T>
      </View>
    </View>
  );
}

// Reads the saved choice each time the screen is shown.
export function ActiveAiLine() {
  const [state, setState] = useState<{ provider: Provider; model: string; keySaved: boolean } | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const provider = await loadProvider();
        const [model, keySaved] = await Promise.all([loadModel(provider), hasApiKey(provider)]);
        if (alive) setState({ provider, model, keySaved });
      })();
      return () => {
        alive = false;
      };
    }, []),
  );

  return state ? <AiStatus {...state} /> : null;
}

const styles = StyleSheet.create({
  box: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 8 },
  sub: { fontSize: 13, color: colors.textSecondary },
});
