import { useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { deleteAsset, getAsset, getAssetByGift, saveAsset } from "../db/assets";
import { listAssetOptions } from "../db/assetOptions";
import { getExchange, type ExchangeRecord } from "../db/assetExchanges";
import { getGift } from "../db/gifts";
import {
  ASSET_TYPES,
  ASSET_UNITS,
  GOLD_PURITIES,
  canAddToAssets,
  defaultUnit,
  draftFromGift,
  isGivenInExchange,
  isPledged,
  loanInputText,
  quantityInputText,
  readAssetForm,
  unitsFor,
  type AssetType,
  type AssetUnit,
} from "../domain/assets";
import { formatLongDate, toISODate } from "../domain/format";
import { rupeesInputText } from "../domain/gifts";
import { confirmAction } from "../platform/dialogs";
import { AppHeader, HeaderTextButton } from "../ui/Header";
import { T } from "../ui/Text";
import { Button, ChoiceField, DateField, OutlinedInput, useSnackbar } from "../ui/forms";
import { OptionField } from "../ui/OptionField";
import { colors, shadow } from "../ui/theme";

const STATUSES: { value: "ACTIVE" | "SOLD"; label: string }[] = [
  { value: "ACTIVE", label: "Holding" },
  { value: "SOLD", label: "Sold" },
];

const PLEDGED: { value: "no" | "yes"; label: string }[] = [
  { value: "no", label: "No, with me" },
  { value: "yes", label: "Yes, pledged" },
];

const NO_PURITY = "none";
const PURITIES = [{ value: NO_PURITY, label: "Not set" }, ...GOLD_PURITIES.map((k) => ({ value: String(k), label: `${k}K` }))];

const isType = (v: unknown): v is AssetType => ASSET_TYPES.some((t) => t.value === v);

// What the second dropdown is called: for gold it is the kind of jewellery. (Not "Type": that already means gold, land or fund.)
const itemLabel = (type: AssetType): string => (type === "gold" ? "Item (ring, earring, chain...)" : type === "land" ? "Item (plot, house...)" : type === "mutual_fund" ? "Item (fund)" : "Item");

// A piece is named by two dropdowns, For (whom) and Item (what it is), each with "+ Add new"; there is no typed name. ?exchange= adds a piece
// bought in that exchange with a shop (the Exchange pages open the form this way). Add an asset, or edit/delete one when ?id= is given.
// ?type= starts the form on that kind. ?fromGift= starts it from a gold gift
// (the piece, grams and giver are filled in); if that gift already has an asset, that asset is opened instead. Gold has a Pledged
// dropdown: Yes asks for the lender (required) and the optional ticket, dates, loan and note, and the whole piece counts as pledged.
export default function AssetForm() {
  const { id, type: typeParam, fromGift, exchange } = useLocalSearchParams<{ id?: string; type?: string; fromGift?: string; exchange?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const snackbar = useSnackbar();
  const editing = typeof id === "string" && id !== "";
  const giftId = typeof fromGift === "string" && fromGift !== "" ? fromGift : undefined;
  const exchangeParam = typeof exchange === "string" && exchange !== "" ? exchange : undefined;

  const [loaded, setLoaded] = useState(false);
  const [type, setType] = useState<AssetType>(isType(typeParam) ? typeParam : "gold");
  const [forName, setForName] = useState("");
  const [item, setItem] = useState("");
  const [forOptions, setForOptions] = useState<string[]>([]);
  const [itemOptions, setItemOptions] = useState<string[]>([]);
  const [exchangeId, setExchangeId] = useState<string | null>(null);
  const [exchangeInfo, setExchangeInfo] = useState<ExchangeRecord | null>(null);
  const [status, setStatus] = useState<"ACTIVE" | "SOLD">("ACTIVE");
  const [quantityText, setQuantityText] = useState("");
  const [unit, setUnit] = useState<AssetUnit | null>(defaultUnit(type));
  const [purity, setPurity] = useState(NO_PURITY);
  const [investedText, setInvestedText] = useState("");
  const [acquiredDate, setAcquiredDate] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [pledged, setPledged] = useState(false);
  const [lender, setLender] = useState("");
  const [ticketNo, setTicketNo] = useState("");
  const [pledgedDate, setPledgedDate] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [loanText, setLoanText] = useState("");
  const [pledgeNote, setPledgeNote] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      // The lists are read first, so the dropdowns know every name before a value is put in them.
      const [fors, items] = await Promise.all([listAssetOptions("for"), listAssetOptions("item")]);
      if (!alive) return;
      setForOptions(fors);
      setItemOptions(items);
      if (editing) {
        const a = await getAsset(id);
        if (!alive) return;
        if (!a) {
          router.back();
          return;
        }
        setType(a.type);
        setForName(a.forName ?? "");
        setItem(a.item ?? a.name);
        setExchangeId(a.exchangeId);
        if (a.exchangeId) setExchangeInfo(await getExchange(a.exchangeId));
        setStatus(a.status);
        setQuantityText(a.quantity === null ? "" : quantityInputText(a.quantity));
        setUnit(a.unit);
        setPurity(a.purityK === null ? NO_PURITY : String(a.purityK));
        setInvestedText(a.investedPaise === null ? "" : rupeesInputText(a.investedPaise));
        setAcquiredDate(a.acquiredDate);
        setDescription(a.description ?? "");
        setPledged(isPledged(a));
        setLender(a.lender ?? "");
        setTicketNo(a.ticketNo ?? "");
        setPledgedDate(a.pledgedDate);
        setDueDate(a.dueDate);
        setLoanText(a.loanPaise === null ? "" : loanInputText(a.loanPaise));
        setPledgeNote(a.pledgeNote ?? "");
      } else if (giftId) {
        // A gift that already has an asset opens that asset, so it cannot be added twice.
        const existing = await getAssetByGift(giftId);
        if (!alive) return;
        if (existing) {
          router.replace({ pathname: "/asset", params: { id: existing.id } });
          return;
        }
        const g = await getGift(giftId);
        if (!alive) return;
        if (!g || !canAddToAssets(g)) {
          router.back();
          return;
        }
        const draft = draftFromGift(g);
        setType("gold");
        setUnit("g");
        setItem(draft.item);
        setQuantityText(draft.quantity === null ? "" : quantityInputText(draft.quantity));
        setDescription(draft.description);
        setAcquiredDate(draft.acquiredDate);
      } else if (exchangeParam) {
        // A piece bought in an exchange: gold, bought on the day of the exchange.
        const x = await getExchange(exchangeParam);
        if (!alive) return;
        if (x) {
          setExchangeId(x.id);
          setExchangeInfo(x);
          setType("gold");
          setUnit("g");
          setAcquiredDate(x.exchangeDate);
        }
      }
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, giftId, exchangeParam]);

  const units = unitsFor(type);
  const gold = type === "gold";

  const chooseType = (next: AssetType) => {
    setType(next);
    setUnit(defaultUnit(next));
    if (next !== "gold") {
      setPurity(NO_PURITY);
      setPledged(false);
    }
  };

  const choosePledged = (yes: boolean) => {
    setPledged(yes);
    // A new pledge starts today; it can be cleared or changed.
    if (yes && pledgedDate === null) setPledgedDate(toISODate(new Date()));
  };

  const result = useMemo(
    () =>
      readAssetForm({
        type,
        forName,
        item,
        exchangeId,
        status,
        quantityText,
        unit,
        purityK: purity === NO_PURITY ? null : Number(purity),
        investedText,
        acquiredDate,
        description,
        pledged,
        lender,
        ticketNo,
        pledgedDate,
        dueDate,
        loanText,
        pledgeNote,
      }),
    [type, forName, item, exchangeId, status, quantityText, unit, purity, investedText, acquiredDate, description, pledged, lender, ticketNo, pledgedDate, dueDate, loanText, pledgeNote],
  );
  const canSave = loaded && !busy && result.ok;
  // The Item being empty is obvious from the disabled Save; any other problem is spelled out.
  const problem = !result.ok && item.trim() !== "" ? result.error : null;
  const given = editing && isGivenInExchange({ status, exchangeId });

  const submit = async (next: boolean) => {
    // The ref closes the gap before `busy` is drawn: a fast second tap must not save the asset twice.
    if (!canSave || !result.ok || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      await saveAsset(result.fields, editing ? id : undefined, editing ? undefined : giftId);
      if (!next || editing || giftId) {
        router.back();
        return;
      }
      // Save & next: stay on the same kind and the same For (the next piece is often for the same person), clear the rest.
      setItem("");
      setStatus("ACTIVE");
      setQuantityText("");
      setPurity(NO_PURITY);
      setInvestedText("");
      setAcquiredDate(null);
      setDescription("");
      setPledged(false);
      setLender("");
      setTicketNo("");
      setPledgedDate(null);
      setDueDate(null);
      setLoanText("");
      setPledgeNote("");
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
    await deleteAsset(id!);
    router.back();
  };

  const quantityLabel = gold ? "Weight (grams)" : type === "mutual_fund" ? "Units held" : "Area";

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <AppHeader
        title={editing ? "Update Asset" : "Add Asset"}
        onBack={() => router.back()}
        right={canSave ? <HeaderTextButton label="Done" onPress={() => submit(false)} /> : undefined}
      />

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
        {exchangeInfo ? (
          <T style={styles.exchangeNote}>
            {given ? "Given to the shop in the exchange" : "Bought in the exchange"}
            {exchangeInfo.shop ? ` with ${exchangeInfo.shop}` : ""} on {formatLongDate(exchangeInfo.exchangeDate)}.
          </T>
        ) : null}
        <ChoiceField label="Type" options={ASSET_TYPES} value={type} onChange={chooseType} />
        <OptionField label="For" value={forName} options={forOptions} onChange={setForName} emptyLabel="Not set" />
        <OptionField label={itemLabel(type)} value={item} options={itemOptions} onChange={setItem} />

        {units.length > 0 ? (
          <>
            <OutlinedInput label={quantityLabel} value={quantityText} onChangeText={setQuantityText} keyboardType="decimal-pad" />
            {units.length > 1 ? (
              <ChoiceField
                label="Area counted in"
                options={ASSET_UNITS.filter((u) => units.includes(u.value))}
                value={unit ?? units[0]}
                onChange={setUnit}
              />
            ) : null}
          </>
        ) : null}
        {gold ? <ChoiceField label="Purity" options={PURITIES} value={purity} onChange={setPurity} /> : null}

        <OutlinedInput
          label={gold || type === "land" ? "Amount paid (₹, optional)" : "Amount invested (₹, optional)"}
          value={investedText}
          onChangeText={setInvestedText}
          keyboardType="decimal-pad"
        />
        <DateField
          label={gold ? "Bought or received on" : "Acquired on"}
          value={acquiredDate}
          onChange={setAcquiredDate}
          onClear={() => setAcquiredDate(null)}
          placeholder="Not set"
        />
        <OutlinedInput label="Description (optional)" value={description} onChangeText={setDescription} />
        {editing && !given ? <ChoiceField label="Status" options={STATUSES} value={status} onChange={setStatus} /> : null}
        {given ? <T style={styles.note}>This piece was given to the shop, so it is no longer held. To change that, undo the exchange on the Exchanges page.</T> : null}

        {gold ? (
          <>
            <ChoiceField label="Pledged (adagu)" options={PLEDGED} value={pledged ? "yes" : "no"} onChange={(v) => choosePledged(v === "yes")} />
            {pledged ? (
              <View style={styles.pledge}>
                <OutlinedInput label="Pledged to (lender)" value={lender} onChangeText={setLender} autoCapitalize="words" />
                <OutlinedInput label="Ticket number (optional)" value={ticketNo} onChangeText={setTicketNo} />
                <DateField label="Pledged on" value={pledgedDate} onChange={setPledgedDate} onClear={() => setPledgedDate(null)} placeholder="Not set" />
                <DateField label="Due on" value={dueDate} onChange={setDueDate} onClear={() => setDueDate(null)} placeholder="Not set" />
                <OutlinedInput label="Loan amount (₹, optional)" value={loanText} onChangeText={setLoanText} keyboardType="decimal-pad" />
                <OutlinedInput label="Purpose or note (optional)" value={pledgeNote} onChangeText={setPledgeNote} />
                <T style={styles.note}>The whole piece counts as pledged. When you take it back, set Pledged to No.</T>
              </View>
            ) : null}
          </>
        ) : null}

        {problem ? <T style={styles.error}>{problem}</T> : null}
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
            {giftId ? null : <Button label="Save & next" color={colors.importAction} onPress={() => submit(true)} disabled={!canSave} style={{ flex: 1 }} />}
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  form: { padding: 8, paddingTop: 16, gap: 12 },
  pledge: { gap: 12, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: "#e0a030", backgroundColor: "#fff4e5" },
  error: { color: colors.error, fontSize: 14, paddingHorizontal: 4 },
  note: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, paddingHorizontal: 4 },
  exchangeNote: { color: colors.primary, fontSize: 14, paddingHorizontal: 4 },
  actions: { flexDirection: "row", gap: 4, paddingTop: 8, paddingHorizontal: 8, backgroundColor: "#fff", ...shadow.high },
});
