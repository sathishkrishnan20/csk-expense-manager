import { useCallback, useEffect, useState } from "react";
import { Share, StyleSheet, View } from "react-native";
import { describeImport } from "../domain/savings";
import { existingAddress, fixedDomain } from "../domain/savingsMail";
import { confirmAction } from "../platform/dialogs";
import { pullSavingsMail } from "../import/savingsMail";
import { cloudBackupUrl } from "../settings/cloudBackup";
import { createSavingsMail, loadSavingsMail, removeSavingsMail, saveSavingsMail, type SavingsMail } from "../settings/savingsMail";
import { T } from "./Text";
import { Button, OutlinedInput, TextButton } from "./forms";
import { colors } from "./theme";

// Config > Savings by email: a private address on the owner's own domain. A Gmail filter forwards the monthly consolidated statement (CAS) to it; the backup
// server (server/src/mail.ts) keeps the PDF, and the Savings page collects and imports it when it opens (import/savingsMail.ts). The address is made here, on
// this phone; its secret part is the only thing that lets this phone collect the statements, and it is kept in the Keychain.
// When EXPO_PUBLIC_SAVINGS_MAIL_DOMAIN is set in .env, that domain is the only one the screen offers (shown read-only); without it the owner types one.
const FIXED_DOMAIN = fixedDomain(process.env.EXPO_PUBLIC_SAVINGS_MAIL_DOMAIN);

export function SavingsMailSection() {
  const [mail, setMail] = useState<SavingsMail | null | undefined>(undefined);
  const [domain, setDomain] = useState(FIXED_DOMAIN ?? "");
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const configured = cloudBackupUrl() !== null;

  const refresh = useCallback(() => loadSavingsMail().then(setMail), []);
  useEffect(() => {
    refresh().catch(() => setMail(null));
  }, [refresh]);

  const run = async (work: () => Promise<string | null>) => {
    setBusy(true);
    setMessage(null);
    try {
      const text = await work();
      if (text) setMessage({ text, isError: false });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : String(err), isError: true });
    } finally {
      await refresh().catch(() => undefined);
      setBusy(false);
    }
  };

  const create = () =>
    run(async () => {
      await createSavingsMail(FIXED_DOMAIN ?? domain);
      return "Your address is ready. Follow the steps below to make Gmail forward the statement to it.";
    });

  // After a reinstall: carry on with the address Gmail already forwards to, so Gmail and Cloudflare need no change.
  const useExisting = () =>
    run(async () => {
      const checked = existingAddress(pasted, FIXED_DOMAIN);
      if (!checked.ok) throw new Error(checked.problem);
      await saveSavingsMail(checked.settings);
      setPasted("");
      return "Your address is back. Tap Check for statements now to collect anything that is waiting.";
    });

  const checkNow = () =>
    run(async () => {
      const r = await pullSavingsMail();
      if (r.errors.length > 0) throw new Error(r.errors.join(" "));
      if (r.found === 0) return "Nothing is waiting. When a statement arrives by email, it is collected the next time you open Savings.";
      return r.reports.flatMap(describeImport).join(" ");
    });

  const share = () =>
    run(async () => {
      if (mail) await Share.share({ message: mail.address });
      return null;
    });

  const remove = async () => {
    const yes = await confirmAction({
      title: "Remove this address?",
      message: "This phone stops collecting statements from it. Statements already imported stay. Make a new address, and change the Gmail forwarding to it, to start again.",
      confirmLabel: "Remove",
    });
    if (yes) {
      await run(async () => {
        await removeSavingsMail();
        return "The address was removed from this phone.";
      });
    }
  };

  if (mail === undefined) return null;

  return (
    <View style={styles.box}>
      <T style={styles.note}>
        Gets your monthly mutual fund statement (CAS) into Savings without you doing anything. Gmail forwards the email to a private address on your own domain, a free
        server keeps the PDF, and Savings imports it when you open it. The PDF stays locked with your PAN and the password never leaves this phone, so the server cannot
        read it. A PDF is kept for 30 days at most and is deleted as soon as it is imported. Your PF passbook is not emailed, so it is still imported by hand.
      </T>

      {!configured ? <T style={styles.error}>The server is not set up in this build. Set up the server in server/README.md and add its address to .env (EXPO_PUBLIC_BACKUP_URL).</T> : null}

      {!mail ? (
        <>
          <OutlinedInput label={FIXED_DOMAIN ? "Your domain (set in this build)" : "Your domain on Cloudflare"} value={FIXED_DOMAIN ?? domain} onChangeText={setDomain} autoCapitalize="none" editable={!FIXED_DOMAIN} />
          <Button label="Create my address" onPress={create} disabled={busy || !configured || (FIXED_DOMAIN ?? domain).trim() === ""} />
          <T style={styles.note}>Already have an address, for example from before you reinstalled the app? Paste it here and keep using it. You will not need to change Gmail or Cloudflare. You can find it in Gmail under Settings, Filters and Blocked Addresses.</T>
          <OutlinedInput label="Your existing address" value={pasted} onChangeText={setPasted} autoCapitalize="none" />
          <Button label="Use this address" onPress={useExisting} disabled={busy || pasted.trim() === ""} color={colors.importAction} />
        </>
      ) : (
        <>
          <View style={styles.addressBox}>
            <T style={styles.small}>Your private address</T>
            <T selectable style={styles.address}>
              {mail.address}
            </T>
          </View>
          <Button label="Share the address" onPress={share} disabled={busy} />
          <Button label="Check for statements now" onPress={checkNow} disabled={busy || !configured} color={colors.importAction} />
          <T style={styles.note}>
            In Gmail: Settings, then Forwarding and POP/IMAP, then Add a forwarding address, and enter the address above. Gmail sends a confirmation code to it; you will receive that
            email in your own inbox. Then Settings, Filters and Blocked Addresses, Create a new filter, put the statement sender's address in From and tick Has attachment,
            choose Forward it to the address above, and save.
          </T>
          <TextButton label="Remove this address" onPress={remove} color={colors.error} />
        </>
      )}

      {message ? <T style={message.isError ? styles.error : styles.note}>{message.text}</T> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 12 },
  note: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  error: { color: colors.error, fontSize: 14 },
  small: { color: colors.textSecondary, fontSize: 12 },
  addressBox: { backgroundColor: colors.primaryTint, borderRadius: 6, padding: 12, gap: 4 },
  address: { fontSize: 14, lineHeight: 22 },
});
