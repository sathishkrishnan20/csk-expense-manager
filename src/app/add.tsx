import { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { loadCategories, loadPaymentMethods } from "../db/config";
import { listGroupsWithBalances } from "../db/groups";
import { addEntries, addTransaction, deleteTransaction, getTransaction, updateTransaction } from "../db/transactions";
import { ADDED_PHRASE, parseCreatedAt } from "../domain/transactionSource";
import { parseAmountInput, toISODate } from "../domain/format";
import { heldOpening, incomeClassFor, openingIncomeFor, suggestGroup, validateNewGroups, type GroupPlan } from "../domain/entryGroup";
import { MAIN_GROUP_ID, flattenTree, isMainGroup, type GroupWithBalance } from "../domain/groups";
import {
  FALLBACK,
  INCOME_CATEGORY,
  RECATEGORISE,
  isIncomeCategory,
  isRecategorise,
  sortOthersLast,
  type CategoryDef,
} from "../domain/masterData";
import { PENDING_AI, type Direction } from "../domain/taxonomy";
import { confirmAction } from "../platform/dialogs";
import { resolveHomeGroupId } from "../db/homeGroup";
import { AppHeader, HeaderTextButton } from "../ui/Header";
import { T } from "../ui/Text";
import { Button, CheckOption, DateField, OutlinedInput, RadioOption, SelectField, useSnackbar } from "../ui/forms";
import { colors, shadow } from "../ui/theme";

// Add a transaction by hand (meant for cash), or edit/delete an existing one when ?id= is given.
// ?group= adds it to that group instead of Main; an edit keeps the row in its own group.
export default function AddTransaction() {
  const { type, id, group } = useLocalSearchParams<{ type?: string; id?: string; group?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const snackbar = useSnackbar();

  const editing = typeof id === "string" && id !== "";
  const [addedLine, setAddedLine] = useState<string | null>(null); // how an existing entry first came in
  const [groupId, setGroupId] = useState(group || MAIN_GROUP_ID);
  const [groups, setGroups] = useState<GroupWithBalance[]>([]);
  const groupName = groups.find((g) => g.id === groupId)?.name ?? "";
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

  // "Create a group for this entry": a new entry in Main can also create a group. Its name and dates are prefilled from the
  // entry (until the owner edits them) and the entry stays in Main.
  const [createGroup, setCreateGroup] = useState(false);
  const [openingIncome, setOpeningIncome] = useState(true);
  const [groupEdits, setGroupEdits] = useState<{ name?: string; startDate?: string | null; endDate?: string | null }>({});
  const groupNames = groups.map((g) => g.name);

  const [categories, setCategories] = useState<CategoryDef[]>([]);
  const [methods, setMethods] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [cats, pms] = await Promise.all([loadCategories(), loadPaymentMethods()]);
      if (!alive) return;
      setCategories(cats);
      setMethods(pms);

      const all = await listGroupsWithBalances();
      if (!alive) return;
      setGroups(all);

      let owner = group || MAIN_GROUP_ID;
      // Added from the Home tabs (no group in the address): the home group, the one the app opens on.
      if (!editing && !group) owner = await resolveHomeGroupId();
      // The form can be reused for another group, so the group follows the parameter instead of being fixed when it first opened.
      if (!editing) setGroupId(owner);
      if (editing) {
        const record = await getTransaction(id);
        if (!alive) return;
        if (!record) {
          router.back();
          return;
        }
        owner = record.groupId;
        setGroupId(owner);
        const added = parseCreatedAt(record.createdAt);
        setAddedLine(`${ADDED_PHRASE[record.source]}${added ? ` on ${added.toLocaleString()}` : ""}`);
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
  }, [id, group]);

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
    // An entry being updated (expense or credit) can be handed back to the AI.
    if (editing && category === FALLBACK.category) subs.push(RECATEGORISE.subcategory);
    return subcategory && !subs.includes(subcategory) ? [...subs, subcategory] : subs;
  }, [categories, category, subcategory, editing]);
  const recategorise = editing && isRecategorise(category, subcategory);

  const changeDirection = (next: Direction) => {
    setDirection(next);
    setCategory(next === "credit" ? INCOME_CATEGORY : "");
    setSubcategory("");
  };

  const changeCategory = (next: string) => {
    setCategory(next);
    setSubcategory("");
  };

  // A new entry in any group (Main too) can create a group; the new group sits under the group the entry is in.
  // The groups a new entry can go into: open ones, as a tree (a dash for each level down).
  const groupChoices = flattenTree(groups.filter((g) => g.status === "ACTIVE")).map(({ group: g, depth }) => ({
    id: g.id,
    label: `${"– ".repeat(depth)}${g.name}`,
  }));
  const groupLabelOf = (id: string) => groupChoices.find((c) => c.id === id)?.label ?? "";
  const canCreateGroup = !editing;
  const fromName = groupName || "Main";
  const suggestion = useMemo(
    () =>
      suggestGroup({
        category: categoriseLater ? "" : category,
        subcategory: categoriseLater ? "" : subcategory,
        description: description.trim() || null,
        payee: payee.trim() || null,
        txnDate: date,
      }),
    [categoriseLater, category, subcategory, description, payee, date],
  );
  const plan: GroupPlan = {
    name: groupEdits.name ?? suggestion.name,
    startDate: groupEdits.startDate !== undefined ? groupEdits.startDate : suggestion.startDate,
    endDate: groupEdits.endDate !== undefined ? groupEdits.endDate : suggestion.endDate,
  };
  const makingGroup = createGroup && canCreateGroup;
  const groupProblem = makingGroup ? validateNewGroups([plan], groupNames)[0] : null;
  // An empty name is not shown as an error until the owner has touched the field.
  const shownGroupProblem = groupProblem && (plan.name.trim() !== "" || groupEdits.name !== undefined) ? groupProblem : null;

  const canSave = !!amount && !!payee.trim() && (categoriseLater || (!!category && !!subcategory)) && !groupProblem;
  // Hand entries can be left for the AI; imported and already-categorised rows cannot.
  const canCategoriseLater = !editing || wasPending;

  const submit = async () => {
    const amountPaise = parseAmountInput(amount);
    if (amountPaise === null) {
      snackbar.show("Please enter the valid amount");
      return;
    }
    const input = {
      groupId,
      txnDate: date,
      direction,
      amountPaise,
      category: categoriseLater || recategorise ? "" : category,
      subcategory: categoriseLater || recategorise ? "" : subcategory,
      categoriseLater: categoriseLater || recategorise,
      recategorise,
      payee: payee.trim(),
      paymentMethod: method || null,
      description: description.trim() || null,
    };

    if (editing) {
      await updateTransaction(id, input);
      router.back();
      return;
    }
    if (makingGroup) {
      const name = plan.name.trim();
      await addEntries([
        {
          input,
          group: {
            name,
            startDate: plan.startDate,
            endDate: plan.endDate,
            parentId: groupId,
            opening: openingIncome ? openingIncomeFor(input, incomeClassFor(categories), fromName) : null,
            heldPaise: heldOpening(direction, amountPaise, openingIncome),
          },
        },
      ]);
      listGroupsWithBalances().then(setGroups);
      setCreateGroup(false);
      setGroupEdits({});
      snackbar.show(`Added, and group "${name}" created`, 3000);
    } else {
      await addTransaction(input);
      snackbar.show("Added Successfully");
    }
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
        title={
          editing
            ? "Update Transaction"
            : isMainGroup(groupId) || !groupName
              ? "Add Transactions"
              : `Add to ${groupName}`
        }
        onBack={() => router.back()}
        right={canSave ? <HeaderTextButton label="Done" onPress={submit} /> : undefined}
      />

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
        {editing && addedLine ? <T style={{ color: colors.textSecondary, fontSize: 13 }}>{addedLine}</T> : null}
        <View style={styles.radios}>
          <RadioOption label="Expense" selected={direction === "debit"} onPress={() => changeDirection("debit")} />
          <RadioOption label="Credit" selected={direction === "credit"} onPress={() => changeDirection("credit")} />
        </View>
        {!editing && groupChoices.length > 1 ? (
          <>
            <SelectField
              label="Group"
              value={groupLabelOf(groupId)}
              options={groupChoices.map((c) => c.label)}
              onChange={(label) => {
                const id = groupChoices.find((c) => c.label === label)?.id ?? MAIN_GROUP_ID;
                setGroupId(id); // for this entry only
              }}
            />
          </>
        ) : null}
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
          // A credit is under Income, unless it is still uncategorised and needs one chosen.
          disabled={(direction === "credit" && category === INCOME_CATEGORY) || categoriseLater}
        />
        <SelectField
          label="Sub Category"
          value={subcategory}
          options={subcategoryOptions}
          onChange={setSubcategory}
          disabled={categoriseLater}
        />
        {recategorise ? (
          <T style={styles.note}>
            The AI will try again the next time you run Re-classify, using your current categories. If it still cannot place this, it goes back to
            Others : Uncategorised.
          </T>
        ) : null}
        <OutlinedInput
          label={direction === "credit" ? "Payer" : "Payee"}
          value={payee}
          onChangeText={setPayee}
          autoCapitalize="words"
        />
        <SelectField label="Payment Method" value={method} options={methods} onChange={setMethod} />
        <OutlinedInput label="Description" value={description} onChangeText={setDescription} />
        {canCreateGroup ? (
          <>
            <CheckOption
              label="Create a group for this entry"
              hint={`Makes a group under ${fromName}, with its own entries. This entry stays in ${fromName}, and the new group's balance counts in ${fromName}'s. The name and dates are filled in from the entry; change them if you like.`}
              checked={createGroup}
              onPress={() => setCreateGroup(!createGroup)}
            />
            {createGroup ? (
              <>
                <OutlinedInput
                  label="Group name"
                  value={plan.name}
                  onChangeText={(name) => setGroupEdits({ ...groupEdits, name })}
                  autoCapitalize="words"
                />
                <DateField label="Group start date" value={plan.startDate} onChange={(startDate) => setGroupEdits({ ...groupEdits, startDate })} />
                <DateField label="Group end date" value={plan.endDate} onChange={(endDate) => setGroupEdits({ ...groupEdits, endDate })} />
                <CheckOption
                  label="Start the group with this amount as income"
                  hint={direction === "credit" ? `The group shows this amount to spend. ${fromName} still counts the money only once.` : undefined}
                  checked={openingIncome}
                  onPress={() => setOpeningIncome(!openingIncome)}
                />
                {shownGroupProblem ? <T style={styles.error}>{shownGroupProblem}</T> : null}
              </>
            ) : null}
          </>
        ) : null}
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
  error: { color: colors.error, fontSize: 14, paddingHorizontal: 4 },
  note: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, paddingHorizontal: 4 },
  radios: { flexDirection: "row", paddingVertical: 4, paddingLeft: 4 },
  actions: { flexDirection: "row", gap: 4, paddingTop: 8, paddingHorizontal: 8, backgroundColor: "#fff", ...shadow.high },
});
