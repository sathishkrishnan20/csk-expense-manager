import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { loadCategories, loadPaymentMethods } from "../db/config";
import { deleteTemplateEntry, loadMonthTemplate, saveTemplateEntry } from "../db/monthTemplate";
import { parseAmountInput } from "../domain/format";
import { INCOME_CATEGORY, type CategoryDef } from "../domain/masterData";
import { TEMPLATE_MAIN, emptyTemplate, validateTemplateEntry, type MonthTemplate } from "../domain/monthTemplate";
import type { Direction } from "../domain/taxonomy";
import { confirmAction } from "../platform/dialogs";
import { AppHeader, HeaderTextButton } from "../ui/Header";
import { TemplateCategoryFields } from "../ui/TemplateCategoryFields";
import { T } from "../ui/Text";
import { Button, CheckOption, OutlinedInput, RadioOption, SelectField } from "../ui/forms";
import { colors, shadow } from "../ui/theme";

// Add or edit an entry of the monthly template (?group= for the group it is made in, "main" for Main; ?id= to edit). It works like adding a transaction: the entry has a day of
// the month, and "Create a group for this entry" makes a group in the group the entry is in, with a name, whether it starts with the entry's amount as income, and the two switches.
export default function TemplateLineScreen() {
  const { group, id } = useLocalSearchParams<{ group?: string; id?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const editing = typeof id === "string" && id !== "";

  const [template, setTemplate] = useState<MonthTemplate>(emptyTemplate());
  const [groupId, setGroupId] = useState(typeof group === "string" && group !== "" ? group : TEMPLATE_MAIN);
  const [categories, setCategories] = useState<CategoryDef[]>([]);
  const [methods, setMethods] = useState<string[]>([]);
  const [direction, setDirection] = useState<Direction>("debit");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [payee, setPayee] = useState("");
  const [method, setMethod] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState("1");
  const [makeGroup, setMakeGroup] = useState(false);
  const [hadGroup, setHadGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [openingIncome, setOpeningIncome] = useState(true);
  const [fundsHere, setFundsHere] = useState(false);
  const [home, setHome] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [t, cats, pms] = await Promise.all([loadMonthTemplate(), loadCategories(), loadPaymentMethods()]);
      if (!alive) return;
      setTemplate(t);
      setCategories(cats);
      setMethods(pms);
      const l = editing ? t.lines.find((x) => x.id === id) : undefined;
      if (editing && !l) {
        router.back();
        return;
      }
      if (l) {
        setGroupId(l.groupId);
        setDirection(l.direction);
        setCategory(l.category);
        setSubcategory(l.subcategory);
        setPayee(l.payee);
        setMethod(l.paymentMethod ?? "");
        setDescription(l.description ?? "");
        setAmount(l.amountPaise === null ? "" : String(l.amountPaise / 100));
        setDay(String(l.day));
        const made = l.createsGroupId ? t.groups.find((g) => g.id === l.createsGroupId) : undefined;
        if (made) {
          setMakeGroup(true);
          setHadGroup(true);
          setGroupName(made.name);
          setOpeningIncome(made.openingIncome);
          setFundsHere(made.fundsHere);
          setHome(made.home);
        }
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const containerName = groupId === TEMPLATE_MAIN ? "Main" : template.groups.find((g) => g.id === groupId)?.name ?? "the group";
  const ownGroupId = editing ? template.lines.find((l) => l.id === id)?.createsGroupId ?? null : null;
  const otherNames = template.groups.filter((g) => g.id !== ownGroupId).map((g) => g.name);

  const changeDirection = (next: Direction) => {
    setDirection(next);
    setCategory(next === "credit" ? INCOME_CATEGORY : "");
    setSubcategory("");
  };

  const amountText = amount.trim();
  const amountPaise = amountText === "" ? null : parseAmountInput(amountText);
  const entry = { direction, category, subcategory, payee, paymentMethod: method || null, description: description.trim() || null, amountPaise: amountText !== "" && amountPaise === null ? -1 : amountPaise, day: Number(day) };
  const groupFields = { name: groupName, openingIncome, fundsHere, home };
  const invalid = validateTemplateEntry(entry, makeGroup ? groupFields : null, otherNames);

  const save = async () => {
    if (invalid) {
      setProblem(invalid);
      return;
    }
    if (hadGroup && !makeGroup && !(await confirmAction({ title: "Remove the group this entry creates, with its entries, from the template?", confirmLabel: "Remove" }))) return;
    try {
      await saveTemplateEntry({ ...entry, groupId, id: editing ? id : undefined }, makeGroup ? groupFields : null);
      router.back();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : String(err));
    }
  };

  const remove = async () => {
    const title = hadGroup ? "Delete this entry, the group it creates and that group's entries from the template?" : "Delete this entry from the template?";
    if (!(await confirmAction({ title, confirmLabel: "Delete" }))) return;
    await deleteTemplateEntry(id!);
    router.back();
  };

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <AppHeader title={editing ? "Template entry" : `New entry in ${containerName}`} onBack={() => router.back()} right={!invalid ? <HeaderTextButton label="Done" onPress={save} /> : undefined} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
        <View style={styles.radios}>
          <RadioOption label="Expense" selected={direction === "debit"} onPress={() => changeDirection("debit")} />
          <RadioOption label="Credit" selected={direction === "credit"} onPress={() => changeDirection("credit")} />
        </View>
        <TemplateCategoryFields direction={direction} category={category} subcategory={subcategory} categories={categories} onChange={(c, s) => (setCategory(c), setSubcategory(s))} />
        <OutlinedInput label={direction === "credit" ? "Payer" : "Payee"} value={payee} onChangeText={setPayee} autoCapitalize="words" />
        <OutlinedInput label="Amount (empty: asked each month)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
        <OutlinedInput label="Day of the month" value={day} onChangeText={setDay} keyboardType="number-pad" />
        <T style={styles.note}>On the 29th to 31st, a shorter month uses its last day.</T>
        <SelectField label="Payment Method" value={method} options={methods} onChange={setMethod} />
        <OutlinedInput label="Description" value={description} onChangeText={setDescription} />

        <CheckOption
          label="Create a group for this entry"
          hint={`Makes a group in ${containerName} each month, with its own entries. Its name has the month added; write {Month} {Year} where you want it.`}
          checked={makeGroup}
          onPress={() => setMakeGroup(!makeGroup)}
        />
        {makeGroup ? (
          <>
            <OutlinedInput label="Group name" value={groupName} onChangeText={setGroupName} autoCapitalize="words" />
            <CheckOption
              label="Start the group with this amount as income"
              hint={direction === "credit" ? `The group shows this amount to spend. ${containerName} still counts the money only once.` : undefined}
              checked={openingIncome}
              onPress={() => setOpeningIncome(!openingIncome)}
            />
            <CheckOption label="Mutual fund purchases go here" hint="Each purchase from a confirmation email is added to this group as a debit. Only one group can have this on." checked={fundsHere} onPress={() => setFundsHere(!fundsHere)} />
            <CheckOption label="Open the app on this group" hint="When the month is set up, Home switches to this group. Only one group can have this on." checked={home} onPress={() => setHome(!home)} />
          </>
        ) : null}
        {problem ? <T style={styles.error}>{problem}</T> : null}
        <View style={{ height: 80 }} />
      </ScrollView>
      <View style={[styles.actions, { paddingBottom: insets.bottom + 8 }]}>
        {editing ? <Button label="Delete" color={colors.error} onPress={remove} style={{ flex: 1 }} /> : null}
        <Button label={editing ? "Update" : "Add"} onPress={save} disabled={!!invalid} style={{ flex: 1 }} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  form: { padding: 8, gap: 12 },
  note: { color: colors.textSecondary, fontSize: 13, paddingHorizontal: 4 },
  error: { color: colors.error, fontSize: 14, paddingHorizontal: 4 },
  radios: { flexDirection: "row", paddingVertical: 4, paddingLeft: 4 },
  actions: { flexDirection: "row", gap: 4, paddingTop: 8, paddingHorizontal: 8, backgroundColor: "#fff", ...shadow.high },
});
