import { useMemo } from "react";
import { INCOME_CATEGORY, isIncomeCategory, sortOthersLast, type CategoryDef } from "../domain/masterData";
import type { Direction } from "../domain/taxonomy";
import { SelectField } from "./forms";

// Category and Sub Category of a template entry, from the owner's own lists (never an invented one): an income is under Income, an expense under any other category.
export function TemplateCategoryFields({
  direction,
  category,
  subcategory,
  categories,
  onChange,
}: {
  direction: Direction;
  category: string;
  subcategory: string;
  categories: CategoryDef[];
  onChange: (category: string, subcategory: string) => void;
}) {
  const categoryOptions = useMemo(() => {
    const base = direction === "credit" ? [INCOME_CATEGORY] : categories.filter((c) => !isIncomeCategory(c.category)).map((c) => c.category);
    return category && !base.includes(category) ? [...base, category] : base;
  }, [categories, direction, category]);
  const subcategoryOptions = useMemo(() => {
    const subs = sortOthersLast(categories.find((c) => c.category === category)?.subcategories ?? []);
    return subcategory && !subs.includes(subcategory) ? [...subs, subcategory] : subs;
  }, [categories, category, subcategory]);
  return (
    <>
      <SelectField label="Category" value={category} options={categoryOptions} onChange={(next) => onChange(next, "")} />
      <SelectField label="Sub Category" value={subcategory} options={subcategoryOptions} onChange={(next) => onChange(category, next)} />
    </>
  );
}
