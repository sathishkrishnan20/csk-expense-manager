import { useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { describeSync, syncTrainAlarms } from "../alarms/sync";
import { deleteJourney, getJourney, saveJourney } from "../db/trainJourneys";
import {
  BOOKINGS,
  DEFAULT_BOOKING,
  bookingInfo,
  describeSchedule,
  journeyStatus,
  validateLabel,
  validateTimes,
  type Booking,
} from "../domain/trainAlarms";
import { confirmAction, notify } from "../platform/dialogs";
import { AlarmTimesField } from "../ui/AlarmTimesField";
import { AppHeader, HeaderTextButton } from "../ui/Header";
import { T } from "../ui/Text";
import { Button, ChoiceField, DateField, OutlinedInput } from "../ui/forms";
import { colors, shadow } from "../ui/theme";

// Add a journey, or edit/delete one when ?id= is given. ?copy= starts a new journey from an existing one: everything is filled in
// except the journey date, which the owner picks. The journey date starts empty so it is clear what to fill in. Once it is picked, the
// bottom of the screen says in plain words when booking opens and when the alarms will wake the owner. Saving sets the alarms on the
// phone (alarms/sync.ts); the first save asks iOS for permission.
const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export default function TrainJourneyForm() {
  const { id, copy } = useLocalSearchParams<{ id?: string; copy?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const editing = typeof id === "string" && id !== "";
  const copyOf = !editing && typeof copy === "string" && copy !== "" ? copy : null;

  const [loaded, setLoaded] = useState(false);
  const [label, setLabel] = useState("");
  const [date, setDate] = useState<string | null>(null);
  const [booking, setBooking] = useState<Booking>(DEFAULT_BOOKING);
  const [times, setTimes] = useState<string[]>(bookingInfo(DEFAULT_BOOKING).defaultTimes);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const deleting = useRef(false);

  useEffect(() => {
    const sourceId = editing ? id : copyOf;
    if (sourceId === null) {
      setLoaded(true);
      return;
    }
    let alive = true;
    (async () => {
      const j = await getJourney(sourceId);
      if (!alive) return;
      if (!j) {
        router.back();
        return;
      }
      setLabel(j.label);
      // A copy keeps everything but the date, so the owner has to pick the new one.
      setDate(editing ? j.journeyDate : null);
      setBooking(j.booking);
      setTimes(j.alarmTimes);
      setNote(j.note ?? "");
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, copy]);

  // Each kind of booking opens at a different time, so choosing another one brings in that booking's usual alarm times.
  const chooseBooking = (next: Booking) => {
    setBooking(next);
    setTimes(bookingInfo(next).defaultTimes);
  };

  const fields = useMemo(
    () => (date === null ? null : { label: label.trim() || "Journey", journeyDate: date, booking, alarmTimes: times }),
    [label, date, booking, times],
  );
  const now = new Date();
  const inPast = fields !== null && journeyStatus(fields, now).phase === "past";
  const schedule = fields !== null && !inPast ? describeSchedule(fields, now) : null;

  const labelProblem = label.trim() === "" ? null : validateLabel(label);
  const timesProblem = validateTimes(times);
  const canSave = loaded && !busy && validateLabel(label) === null && date !== null && !inPast && timesProblem === null;

  const submit = async () => {
    // The ref closes the gap before `busy` is drawn: a fast second tap must not save the journey twice.
    if (!canSave || date === null || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      await saveJourney({ label, journeyDate: date, booking, alarmTimes: times, note: note.trim() || null }, editing ? id : undefined);
    } catch (err) {
      submitting.current = false;
      setBusy(false);
      notify(`The journey was not saved: ${message(err)}`);
      return;
    }
    // Saved. Setting the alarms is a separate step: if it fails the journey is still there, so say what went wrong and leave. Staying
    // on the form would let a second Save add the same journey again.
    let outcome: string;
    try {
      outcome = describeSync(await syncTrainAlarms({ ask: true }));
    } catch (err) {
      outcome = `The alarms could not be set: ${message(err)}. They are tried again each time the app opens.`;
    }
    notify(`Saved. ${outcome}`);
    router.back();
  };

  const confirmDelete = async () => {
    if (deleting.current) return;
    if (!(await confirmAction({ title: "Are you sure want to delete?", message: "Its alarms are cancelled.", confirmLabel: "Delete" }))) return;
    deleting.current = true;
    try {
      await deleteJourney(id!);
    } catch (err) {
      deleting.current = false;
      notify(`The journey was not deleted: ${message(err)}`);
      return;
    }
    try {
      await syncTrainAlarms();
    } catch (err) {
      notify(`Deleted. Its alarms could not be cancelled: ${message(err)}. They are cleared the next time the app opens.`);
    }
    router.back();
  };

  // Replaces this screen, so Back returns to the list rather than to the journey that was copied.
  const duplicate = () => router.replace({ pathname: "/train-journey", params: { copy: id! } });

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <AppHeader
        title={editing ? "Update Journey" : copyOf ? "Duplicate Journey" : "Add Journey"}
        onBack={() => router.back()}
        right={canSave ? <HeaderTextButton label="Done" onPress={submit} /> : undefined}
      />

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
        {copyOf && date === null ? <T style={styles.note}>Everything is copied from the earlier journey. Pick the new journey date.</T> : null}
        <OutlinedInput label="Journey (for example Chennai to Madurai)" value={label} onChangeText={setLabel} autoCapitalize="words" maxLength={80} />
        {labelProblem ? <T style={styles.error}>{labelProblem}</T> : null}
        <DateField label="Journey date" value={date} onChange={setDate} placeholder="Select the journey date" />
        <ChoiceField label="Booking" options={BOOKINGS.map((b) => ({ value: b.value, label: b.label }))} value={booking} onChange={chooseBooking} />
        <AlarmTimesField times={times} onChange={setTimes} />
        {timesProblem && times.length === 0 ? <T style={styles.error}>{timesProblem}</T> : null}
        <OutlinedInput label="Note (optional, for example train or class)" value={note} onChangeText={setNote} />

        <View style={styles.summary}>
          {date === null ? (
            <T style={styles.summaryLine}>Pick the journey date, and this box will tell you when booking opens and when you will be woken up.</T>
          ) : inPast ? (
            <T style={styles.error}>That journey date has already passed.</T>
          ) : schedule ? (
            <>
              <T weight="medium" style={styles.summaryLine}>
                {schedule.opens}
              </T>
              <T weight="medium" style={styles.summaryLine}>
                {schedule.wake}
              </T>
              {schedule.reminders ? <T style={styles.summaryLine}>{schedule.reminders}</T> : null}
            </>
          ) : null}
        </View>
        <View style={{ height: 80 }} />
      </ScrollView>

      <View style={[styles.actions, { paddingBottom: insets.bottom + 8 }]}>
        {editing ? (
          <>
            <Button label="Delete" color={colors.error} onPress={confirmDelete} style={{ flex: 1 }} />
            <Button label="Duplicate" color={colors.importAction} onPress={duplicate} style={{ flex: 1 }} />
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
  note: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, paddingHorizontal: 4 },
  summary: { backgroundColor: colors.primaryTint, borderRadius: 4, padding: 12, gap: 8 },
  summaryLine: { fontSize: 15, lineHeight: 22, color: colors.text },
  actions: { flexDirection: "row", gap: 4, paddingTop: 8, paddingHorizontal: 8, backgroundColor: "#fff", ...shadow.high },
});
