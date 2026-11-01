import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { clearAllTransactionData } from "../db/dev";
import { confirmAction } from "../platform/dialogs";
import { T } from "./Text";
import { Button } from "./forms";
import { colors } from "./theme";

// Config > Developer. Only rendered when `__DEV__` is true (Expo Go and the dev server), never in a release build.
export function DevToolsSection() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const clear = async () => {
    const yes = await confirmAction({
      title: "Delete all transactions and groups?",
      message: "Every transaction and every group (except Main) is removed for good. Categories, payment modes and settings stay. This cannot be undone.",
      confirmLabel: "Delete everything",
    });
    if (!yes) return;
    setBusy(true);
    setMessage(null);
    try {
      const r = await clearAllTransactionData();
      setMessage({ text: `Deleted ${r.transactions} transaction${r.transactions === 1 ? "" : "s"} and ${r.groups} group${r.groups === 1 ? "" : "s"}.`, isError: false });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : String(err), isError: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.box}>
      <T style={styles.note}>
        For testing only; this section is not in release builds. It removes every transaction and every group (Main stays), so you can start
        again from an empty app. Categories, payment modes and settings are kept. Export a backup first if you might want the data.
      </T>
      <Button label="Delete all transactions and groups" onPress={clear} disabled={busy} color={colors.error} />
      {message ? <T style={message.isError ? styles.error : styles.note}>{message.text}</T> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 12 },
  note: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  error: { color: colors.error, fontSize: 14 },
});
