import { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { loadCategories, loadPaymentMethods } from "../db/config";
import { addTransaction, deleteTransaction, getTransaction, updateTransaction } from "../db/transactions";
import { parseAmountInput, toISODate } from "../domain/format";
import { INCOME_CATEGORY, isIncomeCategory, sortOthersLast, type CategoryDef } from "../domain/masterData";
import { PENDING_AI, type Direction } from "../domain/taxonomy";
import { confirmAction } from "../platform/dialogs";
import { AppHeader, HeaderTextButton } from "../ui/Header";
import { Button, CheckOption, DateField, OutlinedInput, RadioOption, SelectField, useSnackbar } from "../ui/forms";
import { colors, shadow } from "../ui/theme";

// Add a transaction by hand (meant for cash), or edit/delete an existing one when ?id= is given.
export default function AddTransaction() {
  const { type, id } = useLocalSearchParams<{ type?: string; id?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const snackbar = useSnackbar();

  const editing = typeof id === "string" && id !== "";
  const [direction, setDirection] = useState<Direction>(type === "CREDIT" ? "credit" : "debit");
  const [date, setDate] = useState(toISODate(new Date()));
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(type === "CREDIT" ? INCOME_CATEGORY : "");
  const [subcategory, setSubcategory] = useState("");
  const [payee, setPayee] = useState("");
  const [method, setMethod] = useState("");
  const [description, setDescription] = useState("");
  // Leave the category for "Re-classify Uncategorised" to fill in with AI.
  const [categoriseLater, setCategoriseLater] = useState(false);
  const [wasPending, setWasPending] = useState(false);

  const [categories, setCategories] = useState<CategoryDef[]>([]);
  const [methods, setMethods] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [cats, pms] = await Promise.all([loadCategories(), loadPaymentMethods()]);
      if (!alive) return;
      setCategories(cats);
      setMethods(pms);

      if (editing) {
        const record = await getTransaction(id);
        if (!alive) return;
        if (!record) {
          router.back();
          return;
        }
        setDirection(record.direction);
        setDate(record.txnDate);
        setAmount(String(record.amountPaise / 100));
        const pending = record.classifiedBy === PENDING_AI;
        setWasPending(pending);
        setCategoriseLater(pending);
        setCategory(pending ? "" : record.category);
        setSubcategory(pending ? "" : record.subcategory);
        setPayee(record.payee ?? "");
        setMethod(record.paymentMethod ?? "");
        setDescription(record.description ?? "");
      } else {
        // Hand entries are meant for cash, so start there.
        setMethod(pms.includes("Cash") ? "Cash" : "");
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const categoryOptions = useMemo(() => {
    const base =
      direction === "credit"
        ? [INCOME_CATEGORY]
        : categories.filter((c) => !isIncomeCategory(c.category)).map((c) => c.category);
    // Keep the current value selectable if its category was renamed or removed since.
    return category && !base.includes(category) ? [...base, category] : base;
  }, [categories, direction, category]);

  const subcategoryOptions = useMemo(() => {
    const subs = sortOthersLast(categories.find((c) => c.category === category)?.subcategories ?? []);
    return subcategory && !subs.includes(subcategory) ? [...subs, subcategory] : subs;
  }, [categories, category, subcategory]);

  const changeDirection = (next: Direction) => {
    setDirection(next);
    setCategory(next === "credit" ? INCOME_CATEGORY : "");
    setSubcategory("");
  };

  const changeCategory = (next: string) => {
    setCategory(next);
    setSubcategory("");
  };

  const canSave = !!amount && !!payee.trim() && (categoriseLater || (!!category && !!subcategory));
  // Hand entries can be left for the AI; imported and already-categorised rows cannot.
  const canCategoriseLater = !editing || wasPending;

  const submit = async () => {
    const amountPaise = parseAmountInput(amount);
    if (amountPaise === null) {
      snackbar.show("Please enter the valid amount");
      return;
    }
    const input = {
      txnDate: date,
      direction,
      amountPaise,
      category: categoriseLater ? "" : category,
      subcategory: categoriseLater ? "" : subcategory,
      categoriseLater,
      payee: payee.trim(),
      paymentMethod: method || null,
      description: description.trim() || null,
    };

    if (editing) {
      await updateTransaction(id, input);
      router.back();
      return;
    }
    await addTransaction(input);
    snackbar.show("Added Successfully");
    setCategory(direction === "credit" ? INCOME_CATEGORY : "");
    setSubcategory("");
    setAmount("");
    setPayee("");
    setDescription("");
    setMethod(methods.includes("Cash") ? "Cash" : "");
  };

  const confirmDelete = async () => {
    if (!(await confirmAction({ title: "Are you sure want to delete?", confirmLabel: "Delete" }))) return;
    await deleteTransaction(id!);
    router.back();
  };

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <AppHeader
        title={editing ? "Update Transaction" : "Add Transactions"}
        onBack={() => router.back()}
        right={canSave ? <HeaderTextButton label="Done" onPress={submit} /> : undefined}
      />

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
        <View style={styles.radios}>
          <RadioOption label="Expense" selected={direction === "debit"} onPress={() => changeDirection("debit")} />
          <RadioOption label="Credit" selected={direction === "credit"} onPress={() => changeDirection("credit")} />
        </View>
        <DateField label="Date" value={date} onChange={setDate} />
        <OutlinedInput label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
        {canCategoriseLater ? (
          <CheckOption
            label="Categorise later with AI"
            hint="Saved as uncategorised until you run Re-classify in Config, which sends many entries to the AI in one go."
            checked={categoriseLater}
            onPress={() => setCategoriseLater(!categoriseLater)}
          />
        ) : null}
        <SelectField
          label="Category"
          value={category}
          options={categoryOptions}
          onChange={changeCategory}
          disabled={direction === "credit" || categoriseLater}
        />
        <SelectField
          label="Sub Category"
          value={subcategory}
          options={subcategoryOptions}
          onChange={setSubcategory}
          disabled={categoriseLater}
        />
        <OutlinedInput
          label={direction === "credit" ? "Payer" : "Payee"}
          value={payee}
          onChangeText={setPayee}
          autoCapitalize="words"
        />
        <SelectField label="Payment Method" value={method} options={methods} onChange={setMethod} />
        <OutlinedInput label="Description" value={description} onChangeText={setDescription} />
        <View style={{ height: 80 }} />
      </ScrollView>

      {snackbar.node}

      <View style={[styles.actions, { paddingBottom: insets.bottom + 8 }]}>
        {editing ? <Button label="Delete" color={colors.error} onPress={confirmDelete} style={{ flex: 1 }} /> : null}
        <Button label={editing ? "Update" : "Add"} onPress={submit} disabled={!canSave} style={{ flex: 1 }} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  form: { padding: 8, gap: 12 },
  radios: { flexDirection: "row", paddingVertical: 4, paddingLeft: 4 },
  actions: { flexDirection: "row", gap: 4, paddingTop: 8, paddingHorizontal: 8, backgroundColor: "#fff", ...shadow.high },
});
