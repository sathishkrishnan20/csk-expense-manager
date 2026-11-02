import { useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { describeSync, syncTrainAlarms } from "../alarms/sync";
import { deleteJourney, getJourney, saveJourney } from "../db/trainJourneys";
import { formatLongDate, toISODate } from "../domain/format";
import {
  DEFAULT_WAKE_LEAD,
  READY_LEAD,
  TATKAL_CLASSES,
  WAKE_LEAD_CHOICES,
  bookingOpenDate,
  describeStatus,
  formatClock,
  journeyStatus,
  planJourneyAlarms,
  tatkalOpenDate,
  tatkalOpensAt,
  validateAlarms,
  validateLabel,
  type PlannedAlarm,
  type TatkalClass,
} from "../domain/trainAlarms";
import { confirmAction, notify } from "../platform/dialogs";
import { AppHeader, HeaderTextButton } from "../ui/Header";
import { T } from "../ui/Text";
import { Button, CheckOption, ChoiceField, DateField, OutlinedInput } from "../ui/forms";
import { colors, shadow } from "../ui/theme";

const LEAD_CHOICES = WAKE_LEAD_CHOICES.map((m) => ({ value: String(m), label: `${m} minutes before` }));

const ALARM_NAME: Record<PlannedAlarm["kind"], string> = {
  evening: "Reminder",
  wake: "Wake-up alarm",
  ready: `Alarm ${READY_LEAD} minutes before`,
  tatkal: "Tatkal wake-up alarm",
};

// Add a journey, or edit/delete one when ?id= is given. Shows when booking opens and which alarms will be set as the date is picked.
// Saving sets the alarms on the phone (alarms/sync.ts); the first save asks iOS for permission.
export default function TrainJourneyForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const editing = typeof id === "string" && id !== "";

  const [loaded, setLoaded] = useState(false);
  const [label, setLabel] = useState("");
  // A new journey starts a little over 60 days ahead, the nearest date whose advance booking is still to come.
  const [date, setDate] = useState(() => toISODate(new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + 61)));
  const [advance, setAdvance] = useState(true);
  const [tatkal, setTatkal] = useState<TatkalClass>("none");
  const [lead, setLead] = useState(String(DEFAULT_WAKE_LEAD));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);

  useEffect(() => {
    if (!editing) {
      setLoaded(true);
      return;
    }
    let alive = true;
    (async () => {
      const j = await getJourney(id);
      if (!alive) return;
      if (!j) {
        router.back();
        return;
      }
      setLabel(j.label);
      setDate(j.journeyDate);
      setAdvance(j.advance);
      setTatkal(j.tatkal);
      setLead(String(j.wakeLeadMinutes));
      setNote(j.note ?? "");
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const wakeLeadMinutes = Number(lead);
  const preview = useMemo(() => {
    const now = new Date();
    const fields = { label: label.trim() || "Journey", journeyDate: date, advance, tatkal, wakeLeadMinutes };
    return { status: journeyStatus(fields, now), plans: planJourneyAlarms({ id: "preview", ...fields }, now) };
  }, [label, date, advance, tatkal, wakeLeadMinutes]);

  const tatkalAt = tatkalOpensAt(date, tatkal);
  const labelProblem = label.trim() === "" ? null : validateLabel(label);
  const alarmsProblem = validateAlarms({ advance, tatkal });
  const inPast = preview.status.phase === "past";
  const canSave = loaded && !busy && validateLabel(label) === null && alarmsProblem === null && !inPast;

  const submit = async () => {
    // The ref closes the gap before `busy` is drawn: a fast second tap must not save the journey twice.
    if (!canSave || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      await saveJourney({ label, journeyDate: date, advance, tatkal, wakeLeadMinutes, note: note.trim() || null }, editing ? id : undefined);
      const result = await syncTrainAlarms({ ask: true });
      notify(`Saved. ${describeSync(result)}`);
      router.back();
    } catch (err) {
      submitting.current = false;
      notify(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!(await confirmAction({ title: "Are you sure want to delete?", message: "Its alarms are cancelled.", confirmLabel: "Delete" }))) return;
    await deleteJourney(id!);
    await syncTrainAlarms();
    router.back();
  };

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <AppHeader
        title={editing ? "Update Journey" : "Add Journey"}
        onBack={() => router.back()}
        right={canSave ? <HeaderTextButton label="Done" onPress={submit} /> : undefined}
      />

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
        <OutlinedInput label="Journey (for example Chennai to Madurai)" value={label} onChangeText={setLabel} autoCapitalize="words" maxLength={80} />
        {labelProblem ? <T style={styles.error}>{labelProblem}</T> : null}
        <DateField label="Journey date" value={date} onChange={setDate} />
        <CheckOption
          label="Advance booking alarms"
          hint="Booking opens 60 days before the journey, at 8:00 AM."
          checked={advance}
          onPress={() => setAdvance(!advance)}
        />
        <ChoiceField
          label="Tatkal alarm (the day before the journey)"
          options={TATKAL_CLASSES.map((c) => ({ value: c.value, label: c.label }))}
          value={tatkal}
          onChange={setTatkal}
        />
        <ChoiceField label="Wake me" options={LEAD_CHOICES} value={lead} onChange={setLead} />
        <OutlinedInput label="Note (optional, for example train or class)" value={note} onChangeText={setNote} />
        {alarmsProblem ? <T style={styles.error}>{alarmsProblem}</T> : null}

        <View style={styles.preview}>
          {advance ? (
            <T weight="medium">
              Advance booking opens {formatLongDate(bookingOpenDate(date))}, 8:00 AM
            </T>
          ) : null}
          {tatkalAt ? (
            <T weight="medium">
              Tatkal opens {formatLongDate(tatkalOpenDate(date))}, {formatClock(tatkalAt)}
            </T>
          ) : null}
          <T style={styles.previewLine}>{describeStatus(preview.status)}</T>
          {inPast ? (
            <T style={styles.error}>That journey date has already passed.</T>
          ) : preview.plans.length === 0 ? (
            <T style={styles.note}>Booking has already opened for this date, so no alarm will be set.</T>
          ) : (
            <View style={{ gap: 2 }}>
              {preview.plans.map((p) => (
                <T key={p.kind} style={styles.previewLine}>
                  {ALARM_NAME[p.kind]}: {formatLongDate(toISODate(p.at))}, {formatClock(p.at)}
                </T>
              ))}
            </View>
          )}
        </View>
        <View style={{ height: 80 }} />
      </ScrollView>

      <View style={[styles.actions, { paddingBottom: insets.bottom + 8 }]}>
        {editing ? (
          <>
            <Button label="Delete" color={colors.error} onPress={confirmDelete} style={{ flex: 1 }} />
            <Button label="Update" onPress={submit} disabled={!canSave} style={{ flex: 1 }} />
          </>
        ) : (
          <Button label="Save" onPress={submit} disabled={!canSave} style={{ flex: 1 }} />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  form: { padding: 8, paddingTop: 16, gap: 12 },
  error: { color: colors.error, fontSize: 14, paddingHorizontal: 4 },
  note: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  preview: { backgroundColor: colors.primaryTint, borderRadius: 4, padding: 12, gap: 4 },
  previewLine: { fontSize: 14, color: colors.text },
  actions: { flexDirection: "row", gap: 4, paddingTop: 8, paddingHorizontal: 8, backgroundColor: "#fff", ...shadow.high },
});
