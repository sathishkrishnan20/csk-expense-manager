import { useCallback, useEffect, useState } from "react";
import { Linking, Platform, StyleSheet, View } from "react-native";
import { listGroupsWithBalances } from "../db/groups";
import { formatRupees } from "../domain/format";
import { MAIN_GROUP_ID } from "../domain/groups";
import { describeSmsProblem } from "../domain/smsProblem";
import { describeRunStatus, type SmsRunRow } from "../domain/smsRunLog";
import { mentionsUpi, parseBankSms } from "../domain/smsParser";
import { phoneInboxAvailable } from "../import/phoneInbox";
import { dismissUnreadSms, pullSms, type SmsPullResult } from "../import/smsCapture";
import { reportSmsProblem } from "../import/smsProblemStore";
import { loadRunRows, runLogAvailable } from "../import/smsRunLog";
import { loadSmsGroupId, loadSmsLast, saveSmsGroupId, type SmsLast } from "../settings/smsCapture";
import { T } from "./Text";
import { Button, OutlinedInput, SelectField, TextButton } from "./forms";
import { colors } from "./theme";

// Config > Bank SMS: the setup for adding a transaction by itself when a bank SMS arrives. iOS does not let an app read messages, so
// an iOS Shortcut ("When I get a message") hands each bank message to this app: the "Add bank SMS" action (app-intents/AddBankSmsIntent.swift)
// queues the text on the phone and the app collects it when it next opens (import/smsCapture.ts). The steps below are the app's own
// instructions for making the Shortcut.
const when = (iso: string) => new Date(iso).toLocaleString();

const STEPS = [
  "Tap Open Shortcuts below, then Automation at the bottom, then + (New Automation), then Message.",
  "Next to Message Contains, paste the first words of one of your bank's payment messages, such as  ICICI Bank Acct XX236  (copy them from the message). Leave Sender empty, tap Next, then Create New Shortcut. Leave out the word debited, or money you receive will not be picked up.",
  "Search for  Add bank SMS  at the bottom and tap it (listed under CSK Manager). Tap the Message field in that action, tap Select Variable above the keyboard, then tap Shortcut Input (the message that arrived). The Message field now shows Shortcut Input; tap the tick.",
  "Back on the automation choose Run Immediately, and turn Notify When Run off if you see it.",
];

export function SmsCaptureSection() {
  const [loaded, setLoaded] = useState(false);
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [groupId, setGroupId] = useState(MAIN_GROUP_ID);
  const [last, setLast] = useState<SmsLast | null>(null);
  const [result, setResult] = useState<SmsPullResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [sample, setSample] = useState("");
  const [runs, setRuns] = useState<SmsRunRow[]>([]);

  const refresh = useCallback(async () => {
    const [saved, all, l, rows] = await Promise.all([loadSmsGroupId(), listGroupsWithBalances(), loadSmsLast(), loadRunRows().catch(() => [])]);
    const open = all.filter((g) => g.status === "ACTIVE");
    setGroups(open.map((g) => ({ id: g.id, name: g.name })));
    setGroupId(saved && open.some((g) => g.id === saved) ? saved : MAIN_GROUP_ID);
    setLast(l);
    setRuns(rows);
    setLoaded(true);
  }, []);
  useEffect(() => {
    refresh().catch(() => setLoaded(true));
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
      setBusy(false);
    }
  };

  const check = () =>
    run(async () => {
      const r = await pullSms();
      setResult(r);
      setLast(await loadSmsLast());
      setRuns(await loadRunRows().catch(() => []));
      const parts = [`${r.fetched} message${r.fetched === 1 ? "" : "s"} waiting`, `${r.added} added`];
      if (r.ignored > 0) parts.push(`${r.ignored} skipped (not UPI payments)`);
      if (r.alreadyHad > 0) parts.push(`${r.alreadyHad} already in the app`);
      if (r.waiting > 0) parts.push(`${r.waiting} could not be saved yet`);
      if (r.uncategorised > 0) parts.push(`${r.uncategorised} saved without a category`);
      if (r.unread.length > 0) parts.push(`${r.unread.length} could not be read`);
      if (r.error) throw new Error(`${parts.join(", ")}. Problem: ${r.error}`);
      return `${parts.join(", ")}.`;
    });

  // iOS opens the Shortcuts app from this link; it cannot go straight to a new automation. Only rendered on iOS (see below).
  const openShortcuts = () => {
    Linking.openURL("shortcuts://").catch(() => setMessage({ text: "Could not open the Shortcuts app.", isError: true }));
  };

  const chooseGroup = (name: string) => {
    const id = groups.find((g) => g.name === name)?.id ?? MAIN_GROUP_ID;
    setGroupId(id);
    saveSmsGroupId(id === MAIN_GROUP_ID ? null : id).catch(() => {});
  };

  const dismiss = (id: string) =>
    run(async () => {
      await dismissUnreadSms(id);
      const unread = (result?.unread ?? []).filter((m) => m.id !== id);
      setResult((r) => (r ? { ...r, unread } : r));
      reportSmsProblem(describeSmsProblem({ waiting: result?.waiting ?? 0, unreadCount: unread.length }));
      return null;
    });

  const preview = sample.trim() === "" ? null : parseBankSms(sample, new Date());

  // Everything below is the iOS way (a Shortcut hands the message to the app). Android is planned and will read the messages on the phone
  // itself, not through Shortcuts; the browser has no messages. Each platform is named here so none is treated as another by default.
  if (Platform.OS === "android") {
    return <T style={styles.note}>Automatic bank SMS is not available on Android yet. It will read your bank messages on the phone itself, without Shortcuts.</T>;
  }
  if (Platform.OS === "web") {
    return <T style={styles.note}>Automatic bank SMS works only in the iPhone app.</T>;
  }
  if (!loaded) return null;
  return (
    <View style={styles.box}>
      <T style={styles.note}>
        Adds a transaction by itself when your bank sends a UPI payment message, in addition to importing a statement. The payment is saved
        with the UPI number from the message, so the statement you import later does not add it twice: it fills in the full name, the UPI
        note and the balance. iOS does not let an app read messages, so a Shortcut on your iPhone hands each bank message to this app. The
        text stays on your phone, and the app adds the payment the next time you open it. Messages that are not UPI payments (card, ATM, OTP)
        are skipped.
      </T>

      {!phoneInboxAvailable() ? (
        <T style={styles.error}>
          This build does not have the Add bank SMS action (an older install or Expo Go). Install the newest build to use it.
        </T>
      ) : null}

      <SelectField label="Add these entries to" value={groups.find((g) => g.id === groupId)?.name ?? "Main"} options={groups.map((g) => g.name)} onChange={chooseGroup} disabled={busy} />

      <T weight="medium">Make the Shortcut (once)</T>
      <Button label="Open Shortcuts" onPress={openShortcuts} disabled={busy} />
      {STEPS.map((step, i) => (
        <T key={i} style={styles.step}>
          {i + 1}. {step}
        </T>
      ))}
      <T style={styles.note}>
        Then make a small UPI payment and open this app: the payment is added within a few seconds, and Check now shows what the app found. To pass
        only UPI messages, add an If action above Add bank SMS (Shortcut Input contains UPI) and put Add bank SMS inside it; the app already skips
        messages that are not UPI payments, so this is not needed.
      </T>
      <T style={styles.note}>The names of buttons can differ a little between iOS versions. If a step does not match what you see, tell me what you see.</T>

      <Button label={busy ? "Working…" : "Check now"} onPress={check} disabled={busy} />
      {last ? (
        <T style={styles.note}>
          Last checked {when(last.at)}: {last.added} added.{last.error ? ` Problem: ${last.error}` : ""}
        </T>
      ) : null}

      <T weight="medium">Recent runs</T>
      <T style={styles.note}>
        Every time iOS runs the Add bank SMS action it is listed here with what became of the message (the text itself is not kept). If three
        messages arrived and fewer than three rows are listed, iOS did not run the Shortcut for the others. A row with no result means the
        app did not save it. Tap Check now to refresh.
      </T>
      {!runLogAvailable() ? (
        <T style={styles.note}>This build does not record runs yet. Install the newest build to see them.</T>
      ) : runs.length === 0 ? (
        <T style={styles.note}>The action has not run yet.</T>
      ) : (
        runs.map((r) => (
          <View key={r.id} style={{ gap: 2 }}>
            <T style={styles.small}>
              {when(r.at)} · {r.length} characters
            </T>
            <T style={r.status === "no_trace" || r.status === "empty" || r.status === "waiting" ? styles.error : styles.note}>{describeRunStatus(r.status)}</T>
          </View>
        ))
      )}

      <T weight="medium">Try a message</T>
      <T style={styles.note}>Paste a bank message to see how the app reads it. Nothing is saved.</T>
      <OutlinedInput label="Bank message" value={sample} onChangeText={setSample} autoCapitalize="none" />
      {sample.trim() === "" ? null : preview ? (
        <T style={styles.note}>
          Read as a {preview.direction}: {formatRupees(preview.amountPaise)} on {preview.txnDate}, {preview.payee ?? "no name"}, UPI {preview.upiRef}
          {preview.account ? `, account ${preview.account}` : ""}.
        </T>
      ) : mentionsUpi(sample) ? (
        <T style={styles.error}>The app cannot read this message. Only UPI payment messages with an amount and a 12-digit UPI number are read.</T>
      ) : (
        <T style={styles.note}>This is not a UPI payment message, so the app skips it.</T>
      )}

      {result && result.unread.length > 0 ? (
        <View style={styles.unread}>
          <T weight="medium">Messages the app could not read</T>
          {result.unread.map((m) => (
            <View key={m.id} style={{ gap: 4 }}>
              <T selectable style={styles.small}>
                {m.text}
              </T>
              <TextButton label="Dismiss" onPress={() => dismiss(m.id)} />
            </View>
          ))}
          <T style={styles.note}>Send me one of these (hide the personal parts) and I will teach the app to read it.</T>
        </View>
      ) : null}

      {message ? <T style={message.isError ? styles.error : styles.note}>{message.text}</T> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 12 },
  note: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  small: { fontSize: 13, lineHeight: 19 },
  step: { fontSize: 14, lineHeight: 21 },
  error: { color: colors.error, fontSize: 14, lineHeight: 20 },
  unread: { backgroundColor: colors.primaryTint, borderRadius: 6, padding: 10, gap: 8 },
});
