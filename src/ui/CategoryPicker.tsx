import { useState } from "react";
import { View } from "react-native";
import { INCOME_CATEGORY, type CategoryDef } from "../domain/masterData";
import { expenseCategoryNames, subcategoryNames } from "../domain/suggestions";
import type { Direction } from "../domain/taxonomy";
import { OutlinedInput, SelectField } from "./forms";

const ADD_CATEGORY = "+ Add new category";
const ADD_SUBCATEGORY = "+ Add new subcategory";

export interface CategoryChoice {
  category: string;
  subcategory: string;
}

// A category and a subcategory chosen from the owner's list, as on the Add screen, with a "+ Add new" choice at the end of each
// dropdown that opens a box to type a name that is not in the list yet. A value that is not in the list (the AI's idea for a new
// category) starts in that typing mode, with the name filled in. A credit is always under Income. Choosing another category clears
// the subcategory. The parent holds the value; this only decides what to show.
export function CategoryPicker({
  master,
  direction,
  value,
  onChange,
  disabled,
}: {
  master: readonly CategoryDef[];
  direction: Direction;
  value: CategoryChoice;
  onChange: (value: CategoryChoice) => void;
  disabled?: boolean;
}) {
  const credit = direction === "credit";
  const categories = credit ? [INCOME_CATEGORY] : expenseCategoryNames(master);
  const subs = subcategoryNames(master, value.category);
  const [newCategory, setNewCategory] = useState(!credit && value.category !== "" && !categories.includes(value.category));
  const [newSub, setNewSub] = useState(value.subcategory !== "" && !subs.includes(value.subcategory));

  const category = credit ? INCOME_CATEGORY : value.category;
  const typingSub = newCategory || newSub;

  const pickCategory = (name: string) => {
    if (name === ADD_CATEGORY) {
      setNewCategory(true);
      onChange({ category: "", subcategory: "" });
      return;
    }
    setNewCategory(false);
    setNewSub(false);
    onChange({ category: name, subcategory: "" });
  };

  const pickSub = (name: string) => {
    if (name === ADD_SUBCATEGORY) {
      setNewSub(true);
      onChange({ category, subcategory: "" });
      return;
    }
    setNewSub(false);
    onChange({ category, subcategory: name });
  };

  return (
    <View style={{ gap: 10 }}>
      <SelectField
        label="Category"
        value={newCategory ? ADD_CATEGORY : category}
        options={credit ? categories : [...categories, ADD_CATEGORY]}
        onChange={pickCategory}
        disabled={disabled || credit}
      />
      {newCategory ? (
        <OutlinedInput
          label="New category"
          value={value.category}
          onChangeText={(text) => onChange({ category: text, subcategory: value.subcategory })}
          autoCapitalize="words"
        />
      ) : (
        <SelectField
          label="Sub Category"
          value={typingSub ? ADD_SUBCATEGORY : value.subcategory}
          options={[...subs, ADD_SUBCATEGORY]}
          onChange={pickSub}
          disabled={disabled || category === ""}
        />
      )}
      {typingSub ? (
        <OutlinedInput
          label="New subcategory"
          value={value.subcategory}
          onChangeText={(text) => onChange({ category, subcategory: text })}
          autoCapitalize="words"
        />
      ) : null}
    </View>
  );
}
