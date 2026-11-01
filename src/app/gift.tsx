import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getAssetByGift } from "../db/assets";
import { deleteGift, getGift, listOccasions, saveGift, type OccasionSummary } from "../db/gifts";
import { canAddToAssets } from "../domain/assets";
import { formatLongDate, toISODate } from "../domain/format";
import {
  GIFT_DIRECTIONS,
  GIFT_TYPES,
  gramsInputText,
  normalizeUnit,
  occasionKey,
  readGiftAmounts,
  rupeesInputText,
  validateOccasionTitle,
  type GiftDirection,
  type GiftType,
  type GiftUnit,
} from "../domain/gifts";
import { confirmAction } from "../platform/dialogs";
import { AppHeader, HeaderTextButton } from "../ui/Header";
import { T } from "../ui/Text";
import { Button, ChoiceField, DateField, OutlinedInput, SelectField, TextButton, useSnackbar } from "../ui/forms";
import { colors, shadow } from "../ui/theme";

const NEW_OCCASION = "+ New occasion…";

const UNITS: { value: GiftUnit; label: string }[] = [
  { value: "g", label: "Grams" },
  { value: "INR", label: "Rupees worth" },
];

// Add a gift, or edit/delete one when ?id= is given. ?occasion= starts the form on that occasion. The occasion field lists the
// occasions already there; "+ New occasion…" makes one from the name typed, with the date entered here as its date. An existing
// occasion's date is shown but locked; unlocking it and changing it moves the whole occasion.
export default function GiftForm() {
  const { id, occasion } = useLocalSearchParams<{ id?: string; occasion?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const snackbar = useSnackbar();
  const editing = typeof id === "string" && id !== "";

  const [occasions, setOccasions] = useState<OccasionSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [occasionId, setOccasionId] = useState<string | null>(null); // null: a new occasion
  const [newTitle, setNewTitle] = useState("");
  const [date, setDate] = useState(toISODate(new Date()));
  const [dateUnlocked, setDateUnlocked] = useState(false);

  const [name, setName] = useState("");
  const [direction, setDirection] = useState<GiftDirection>("received");
  const [type, setType] = useState<GiftType>("cash");
  const [unit, setUnit] = useState<GiftUnit>("g");
  const [valueText, setValueText] = useState("");
  const [rateText, setRateText] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  // Gold received in grams can be added to Assets from here; once it has been, the gift shows the asset instead of the button.
  const [addable, setAddable] = useState(false);
  const [assetId, setAssetId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!editing) return;
      let alive = true;
      getAssetByGift(id).then((a) => {
        if (alive) setAssetId(a?.id ?? null);
      });
      return () => {
        alive = false;
      };
    }, [editing, id]),
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      const list = await listOccasions();
      if (!alive) return;
      setOccasions(list);

      if (editing) {
        const g = await getGift(id);
        if (!alive) return;
        if (!g) {
          router.back();
          return;
        }
        setOccasionId(g.occasionId);
        setDate(g.occasionDate);
        setName(g.name);
        setDirection(g.direction);
        setType(g.type);
        setUnit(g.unit);
        setValueText(g.value === null ? "" : g.unit === "g" ? gramsInputText(g.value) : rupeesInputText(g.value));
        setRateText(g.ratePaise === null ? "" : rupeesInputText(g.ratePaise));
        setNote(g.note ?? "");
        setAddable(canAddToAssets(g));
      } else {
        // With no occasions yet the first gift makes one; otherwise start on the one asked for, or the newest.
        const start = list.find((o) => o.id === occasion) ?? list[0] ?? null;
        if (start) {
          setOccasionId(start.id);
          setDate(start.date);
          setDirection(start.lastDirection);
        }
      }
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, occasion]);

  const current = occasions.find((o) => o.id === occasionId) ?? null;
  const effectiveUnit = normalizeUnit(type, unit);
  const metal = type === "gold" || type === "silver";

  const chooseOccasion = (title: string) => {
    if (title === NEW_OCCASION) {
      setOccasionId(null);
      setNewTitle("");
      setDate(toISODate(new Date()));
      setDateUnlocked(false);
      return;
    }
    const o = occasions.find((x) => x.title === title);
    if (!o) return;
    setOccasionId(o.id);
    setDate(o.date);
    setDateUnlocked(false);
    if (!editing) setDirection(o.lastDirection);
  };

  // A new name that matches an occasion already there adds to that one, and its date stays.
  const sameAsExisting = occasionId === null ? occasions.find((o) => occasionKey(o.title) === occasionKey(newTitle)) : undefined;
  const titleProblem = occasionId === null ? validateOccasionTitle(newTitle) : null;
  const amounts = useMemo(() => readGiftAmounts(type, unit, valueText, rateText), [type, unit, valueText, rateText]);
  const canSave = loaded && !busy && name.trim() !== "" && !titleProblem && amounts.ok;
  const amountError = !amounts.ok && (valueText.trim() !== "" || rateText.trim() !== "") ? amounts.error : null;

  const valueLabel =
    type === "cash" ? "Amount (₹)" : metal ? (effectiveUnit === "g" ? "Weight (grams)" : "Worth (₹)") : "Value (₹, optional)";

  const submit = async (next: boolean) => {
    // The ref closes the gap before `busy` is drawn: a fast second tap must not save the gift twice.
    if (!canSave || !amounts.ok || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      const changeDate = dateUnlocked && current !== null && current.date !== date;
      const savedOccasion = await saveGift(
        {
          name,
          direction,
          type,
          value: amounts.value,
          unit: amounts.unit,
          ratePaise: amounts.ratePaise,
          note: note.trim() || null,
          occasionId,
          occasionTitle: newTitle,
          occasionDate: date,
          changeOccasionDate: changeDate,
        },
        editing ? id : undefined,
      );
      if (!next || editing) {
        router.back();
        return;
      }
      // Save & next: stay on the same occasion (now existing), keep the direction and type, clear the person and the gift.
      const list = await listOccasions();
      const saved = list.find((o) => o.id === savedOccasion);
      setOccasions(list);
      setOccasionId(savedOccasion);
      if (saved) setDate(saved.date);
      setDateUnlocked(false);
      setName("");
      setValueText("");
      setRateText("");
      setNote("");
      snackbar.show("Added");
      submitting.current = false;
    } catch (err) {
      submitting.current = false;
      snackbar.show(err instanceof Error ? err.message : String(err), 3000);
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!(await confirmAction({ title: "Are you sure want to delete?", confirmLabel: "Delete" }))) return;
    await deleteGift(id!);
    router.back();
  };

  const locked = (occasionId !== null && !dateUnlocked) || !!sameAsExisting;

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <AppHeader
        title={editing ? "Update Gift" : "Add Gift"}
        onBack={() => router.back()}
        right={canSave ? <HeaderTextButton label="Done" onPress={() => submit(false)} /> : undefined}
      />

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
        <SelectField
          label="Occasion"
          value={occasionId === null ? (occasions.length === 0 ? "" : NEW_OCCASION) : (current?.title ?? "")}
          options={[...occasions.map((o) => o.title), NEW_OCCASION]}
          onChange={chooseOccasion}
        />
        {occasionId === null ? (
          <>
            <OutlinedInput label="Occasion name" value={newTitle} onChangeText={setNewTitle} autoCapitalize="words" />
            {sameAsExisting ? (
              <T style={styles.note}>
                "{sameAsExisting.title}" is already there ({formatLongDate(sameAsExisting.date)}). This gift is added to it and its date stays.
              </T>
            ) : null}
          </>
        ) : null}

        {/* The date belongs to the occasion. A new occasion takes the date typed here; an existing one shows its own, locked. */}
        <View pointerEvents={locked ? "none" : "auto"} style={locked ? { opacity: 0.55 } : undefined}>
          <DateField label="Occasion date" value={sameAsExisting ? sameAsExisting.date : date} onChange={setDate} />
        </View>
        {occasionId !== null && !dateUnlocked ? <TextButton label="Change the occasion date" onPress={() => setDateUnlocked(true)} /> : null}
        {occasionId !== null && dateUnlocked && current ? (
          <T style={styles.note}>
            Changing the date moves all {current.count} {current.count === 1 ? "gift" : "gifts"} in {current.title}.
          </T>
        ) : null}

        <OutlinedInput label="Name" value={name} onChangeText={setName} autoCapitalize="words" />
        <ChoiceField label="Received or given" options={GIFT_DIRECTIONS} value={direction} onChange={setDirection} />
        <ChoiceField label="Type" options={GIFT_TYPES} value={type} onChange={setType} />

        {metal ? <ChoiceField label="Counted in" options={UNITS} value={effectiveUnit} onChange={setUnit} /> : null}
        <OutlinedInput label={valueLabel} value={valueText} onChangeText={setValueText} keyboardType="decimal-pad" />
        {metal && effectiveUnit === "g" ? (
          <OutlinedInput label="Price per gram that day (₹, optional)" value={rateText} onChangeText={setRateText} keyboardType="decimal-pad" />
        ) : null}
        {amountError ? <T style={styles.error}>{amountError}</T> : null}

        <OutlinedInput label={type === "other" ? "What was it" : "Note"} value={note} onChangeText={setNote} />

        {editing && addable ? (
          assetId ? (
            <TextButton label="In your assets - open" onPress={() => router.push({ pathname: "/asset", params: { id: assetId } })} />
          ) : (
            <TextButton label="Add to assets" onPress={() => router.push({ pathname: "/asset", params: { fromGift: id } })} />
          )
        ) : null}
        <View style={{ height: 80 }} />
      </ScrollView>

      {snackbar.node}

      <View style={[styles.actions, { paddingBottom: insets.bottom + 8 }]}>
        {editing ? (
          <>
            <Button label="Delete" color={colors.error} onPress={confirmDelete} style={{ flex: 1 }} />
            <Button label="Update" onPress={() => submit(false)} disabled={!canSave} style={{ flex: 1 }} />
          </>
        ) : (
          <>
            <Button label="Save" onPress={() => submit(false)} disabled={!canSave} style={{ flex: 1 }} />
            <Button label="Save & next" color={colors.importAction} onPress={() => submit(true)} disabled={!canSave} style={{ flex: 1 }} />
          </>
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
  actions: { flexDirection: "row", gap: 4, paddingTop: 8, paddingHorizontal: 8, backgroundColor: "#fff", ...shadow.high },
});
