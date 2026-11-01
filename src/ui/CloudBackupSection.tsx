import { useCallback, useEffect, useState } from "react";
import { Share, StyleSheet, View } from "react-native";
import {
  backUpToCloud,
  cloudStatus,
  deleteCloudBackup,
  restoreFromCloud,
  showRecoveryCode,
  turnOffCloudBackup,
  turnOnCloudBackup,
  type CloudStatus,
} from "../cloud/cloudBackup";
import { CloudBackupError } from "../domain/cloudBackup";
import { confirmAction } from "../platform/dialogs";
import { T } from "./Text";
import { Button, OutlinedInput, TextButton } from "./forms";
import { describeRestore } from "./restoreMessage";
import { colors } from "./theme";

// Config > Cloud backup: an encrypted copy of everything on a free backup server (server/README.md). The only thing that
// identifies the owner is the recovery code made on this phone; the server sees a hash of it and bytes it cannot read.
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

  const turnOn = () =>
    run(async () => {
      setCode(await turnOnCloudBackup());
      return "Cloud backup is on. Write down or share the recovery code below, then press Back up now.";
    });

  const backUp = () =>
    run(async () => {
      const r = await backUpToCloud();
      return r.kind === "unchanged"
        ? `Nothing has changed since the last cloud backup (${when(r.at)}).`
        : `Backed up ${r.transactions} transaction${r.transactions === 1 ? "" : "s"} to the cloud.`;
    });

  const restore = (typedCode: string | null) =>
    run(async () => {
      const r = await restoreFromCloud(typedCode);
      if (typedCode !== null) {
        setTyping(false);
        setTyped("");
      }
      const from = r.updatedAt ? ` (backed up ${when(r.updatedAt)})` : "";
      return `Restored from the cloud${from}: ${describeRestore(r.summary)}`;
    });

  const toggleCode = () =>
    run(async () => {
      setCode(code ? null : await showRecoveryCode());
      return null;
    });

  const shareCode = () =>
    run(async () => {
      if (code) await Share.share({ message: `Expense Manager recovery code: ${code}` });
      return null;
    });

  const deleteCopy = async () => {
    const yes = await confirmAction({
      title: "Delete the cloud copy?",
      message: "The backup on the server is removed. Your data on this phone stays, and you can back up again any time.",
      confirmLabel: "Delete",
    });
    if (yes) await run(async () => (await deleteCloudBackup(), "The cloud copy was deleted."));
  };

  const turnOff = async () => {
    const yes = await confirmAction({
      title: "Turn off cloud backup on this phone?",
      message:
        "This phone forgets its recovery code. The copy on the server stays, but you can only get it back by typing the code, so make sure you have saved it.",
      confirmLabel: "Turn off",
    });
    if (yes) {
      await run(async () => (await turnOffCloudBackup(), setCode(null), "Cloud backup is off on this phone."));
    }
  };

  if (status === null) return null;

  return (
    <View style={styles.box}>
      <T style={styles.note}>
        Keeps an encrypted copy of your transactions, groups, categories and payment modes on a free backup server, so you can get
        them back on a new phone. It is encrypted on this phone before it is sent: the server cannot read it, and it holds no name,
        email or phone number, only a hash made from your recovery code. Backing up again replaces the earlier copy. Your API key is
        not included.
      </T>

      {!status.configured ? (
        <T style={styles.error}>Cloud backup is not set up in this build. Set up the server in server/README.md and add its address to .env.</T>
      ) : !status.enabled ? (
        <>
          <Button label="Turn on cloud backup" onPress={turnOn} disabled={busy} />
          <TextButton label={typing ? "Cancel" : "I already have a recovery code"} onPress={() => setTyping(!typing)} />
          {typing ? (
            <>
              <OutlinedInput label="Recovery code" value={typed} onChangeText={setTyped} autoCapitalize="none" />
              <Button label="Restore from the cloud" onPress={() => restore(typed)} disabled={busy || typed.trim() === ""} />
            </>
          ) : null}
        </>
      ) : (
        <>
          <T style={styles.note}>{status.lastBackupAt ? `Last backed up ${when(status.lastBackupAt)}.` : "Not backed up yet."}</T>
          <Button label="Back up now" onPress={backUp} disabled={busy} />
          <Button label="Restore from cloud" onPress={() => restore(null)} disabled={busy} color={colors.importAction} />
          <TextButton label={code ? "Hide recovery code" : "Show recovery code"} onPress={toggleCode} />
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

      {status.enabled ? (
        <>
          <TextButton label="Delete the cloud copy" onPress={deleteCopy} color={colors.error} />
          <TextButton label="Turn off on this phone" onPress={turnOff} color={colors.error} />
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
  codeBox: { backgroundColor: colors.primaryTint, borderRadius: 6, padding: 12, gap: 8 },
  code: { fontSize: 18, letterSpacing: 1, lineHeight: 28 },
});
