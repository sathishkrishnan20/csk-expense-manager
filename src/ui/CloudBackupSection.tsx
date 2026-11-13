import { useCallback, useEffect, useState } from "react";
import { Pressable, Share, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  backUpToCloud,
  cloudStatus,
  deleteCloudBackup,
  ensureRecoveryCode,
  restoreFromCloud,
  showRecoveryCode,
  type CloudStatus,
} from "../cloud/cloudBackup";
import { syncTrainAlarms } from "../alarms/sync";
import { CloudBackupError } from "../domain/cloudBackup";
import { confirmAction } from "../platform/dialogs";
import { T } from "./Text";
import { Button, OutlinedInput, TextButton } from "./forms";
import { describeRestore } from "./restoreMessage";
import { colors } from "./theme";

// Config > Cloud backup and restore: an encrypted copy of everything on a free backup server (server/README.md). Nothing is scheduled:
// a backup is made when the owner presses the button. The only thing that identifies the owner is the recovery code made on
// this phone by the first backup; the server sees a hash of it and bytes it cannot read.
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : null);

export function CloudBackupSection() {
  const [status, setStatus] = useState<CloudStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [code, setCode] = useState<string | null>(null); // shown while the owner looks at it
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");

  const refresh = useCallback(() => cloudStatus().then(setStatus), []);
  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  const run = async (work: () => Promise<string | null>) => {
    setBusy(true);
    setMessage(null);
    try {
      const text = await work();
      if (text) setMessage({ text, isError: false });
    } catch (err) {
      const text = err instanceof CloudBackupError || err instanceof Error ? err.message : String(err);
      setMessage({ text, isError: true });
    } finally {
      await refresh().catch(() => {});
      setBusy(false);
    }
  };

  // The first backup on a phone makes the recovery code and shows it before anything is sent.
  const backUp = () =>
    run(async () => {
      const first = !status?.hasCode;
      if (first) setCode(await ensureRecoveryCode());
      const r = await backUpToCloud();
      if (r.kind === "unchanged") return `Nothing has changed since the last cloud backup (${when(r.at)}).`;
      return `Backed up ${r.transactions} transaction${r.transactions === 1 ? "" : "s"} to the cloud.${first ? " Write down your recovery code below." : ""}`;
    });

  const restore = () =>
    run(async () => {
      const r = await restoreFromCloud(typed);
      // Restored train journeys need their alarms set on this phone. A failure is not an error here: every launch rebuilds them.
      if (r.summary.journeysAdded > 0) await syncTrainAlarms({ ask: true }).catch(() => {});
      setTyping(false);
      setTyped("");
      const from = r.updatedAt ? ` (backed up ${when(r.updatedAt)})` : "";
      const own = status?.hasCode
        ? ""
        : " The copy you restored from is not changed. Your next backup makes a new recovery code for this phone.";
      return `Restored from the cloud${from}: ${describeRestore(r.summary)}${own}`;
    });

  const toggleCode = () =>
    run(async () => {
      setCode(code ? null : await showRecoveryCode());
      return null;
    });

  const shareCode = () =>
    run(async () => {
      if (code) await Share.share({ message: `CSK Manager recovery code: ${code}` });
      return null;
    });

  const deleteCopy = async () => {
    const yes = await confirmAction({
      title: "Delete the cloud copy?",
      message: "The backup on the server is removed. Your data on this phone stays, and you can back up again any time.",
      confirmLabel: "Delete",
    });
    if (yes) {
      await run(async () => {
        await deleteCloudBackup();
        return "The cloud copy was deleted.";
      });
    }
  };

  if (status === null) return null;

  return (
    <View style={styles.box}>
      <T style={styles.note}>
        Keeps an encrypted copy of your transactions, groups, gifts, assets, savings, upcoming train journeys, categories and payment modes on a free backup server, so you can get
        them back on a new phone. Backups are not automatic: press the button when you want one, and it replaces the earlier copy.
        The copy is encrypted on this phone before it is sent: the server cannot read it, and it holds no name, email or phone
        number, only a hash made from your recovery code. Your API key is not included.
      </T>

      {!status.configured ? (
        <T style={styles.error}>Cloud backup is not set up in this build. Set up the server in server/README.md and add its address to .env.</T>
      ) : (
        <>
          <View style={styles.lastRow}>
            <T style={[styles.note, { flex: 1 }]}>
              {status.hasCode
                ? status.lastBackupAt
                  ? `Last backed up ${when(status.lastBackupAt)}.`
                  : "Not backed up yet."
                : "The first backup makes your recovery code and shows it to you."}
            </T>
            {status.hasCode ? (
              <Pressable hitSlop={10} disabled={busy} onPress={deleteCopy} accessibilityLabel="Delete the cloud copy" style={{ opacity: busy ? 0.4 : 1 }}>
                <MaterialCommunityIcons name="cloud-remove-outline" size={26} color={colors.error} />
              </Pressable>
            ) : null}
          </View>
          <Button label={status.hasCode ? "Back up now" : "Back up to cloud"} onPress={backUp} disabled={busy} />
          <Button
            label={typing ? "Cancel restore" : "Restore from cloud"}
            onPress={() => setTyping(!typing)}
            disabled={busy}
            color={colors.importAction}
          />
          {typing ? (
            <>
              <OutlinedInput label="Recovery code" value={typed} onChangeText={setTyped} autoCapitalize="none" />
              <Button label="Restore" onPress={restore} disabled={busy || typed.trim() === ""} />
            </>
          ) : null}
          {status.hasCode ? <TextButton label={code ? "Hide recovery code" : "Show recovery code"} onPress={toggleCode} /> : null}
        </>
      )}

      {code ? (
        <View style={styles.codeBox}>
          <T weight="medium">Your recovery code</T>
          <T selectable weight="bold" style={styles.code}>
            {code}
          </T>
          <T style={styles.note}>
            Keep it somewhere safe, away from this phone (a password manager or paper). You need it to restore on a new phone, and
            nobody, including the person who runs the server, can recover your backup without it. Anyone who has it can read your backup.
          </T>
          <TextButton label="Share or copy code" onPress={shareCode} />
        </View>
      ) : null}

      {message ? <T style={message.isError ? styles.error : styles.note}>{message.text}</T> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 12 },
  lastRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  note: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  error: { color: colors.error, fontSize: 14 },
  codeBox: { backgroundColor: colors.primaryTint, borderRadius: 6, padding: 12, gap: 8 },
  code: { fontSize: 18, letterSpacing: 1, lineHeight: 28 },
});
