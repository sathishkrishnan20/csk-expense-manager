import { useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import * as Updates from "expo-updates";
import { T } from "./Text";
import { Button } from "./forms";
import { colors } from "./theme";

// Config > App updates. The installed app (AltStore build) gets JavaScript-only changes over the air from EAS Update, so most changes
// need no reinstall. The app checks by itself at every launch and applies a downloaded update at the next one; this section does it
// now: check, download, then restart. Expo Go, a development build and the browser have no updates, and say so.
export function AppUpdateSection() {
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const enabled = Platform.OS !== "web" && Updates.isEnabled;

  const current = !enabled
    ? "Updates are not available here (Expo Go, a development build or the browser). They work in the installed app."
    : Updates.isEmbeddedLaunch
      ? "Running the version that came with the installed app."
      : `Running update ${Updates.updateId?.slice(0, 8) ?? ""}${Updates.createdAt ? `, published ${Updates.createdAt.toLocaleString()}` : ""}.`;

  const check = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const found = await Updates.checkForUpdateAsync();
      if (!found.isAvailable) {
        setMessage({ text: "You are up to date.", isError: false });
        return;
      }
      await Updates.fetchUpdateAsync();
      setReady(true);
      setMessage({ text: "Update downloaded. Restart to use it.", isError: false });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : String(err), isError: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.box}>
      <T style={styles.note}>{current}</T>
      {enabled ? (
        <>
          <T style={styles.note}>
            The app looks for an update every time it opens and uses a downloaded one the next time it opens. Changes that add or change
            native code still need a new install.
          </T>
          {ready ? (
            <Button label="Restart now" onPress={() => Updates.reloadAsync().catch(() => {})} />
          ) : (
            <Button label="Check for updates" onPress={check} disabled={busy} />
          )}
        </>
      ) : null}
      {message ? <T style={message.isError ? styles.error : styles.note}>{message.text}</T> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 12 },
  note: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  error: { color: colors.error, fontSize: 14 },
});
