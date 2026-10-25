import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import type { CategoryDef } from "../domain/masterData";
import {
  NO_FILTERS,
  activeFilterCount,
  categoryOptions,
  isRangeValid,
  subcategoryOptions,
  withCategory,
  type DirectionFilter,
  type Filterable,
  type TransactionFilters,
  type UncategorisedMode,
} from "../domain/transactionFilters";
import { notify } from "../platform/dialogs";
import { T } from "./Text";
import { DateField, Segmented, SelectField, TextButton } from "./forms";
import { colors } from "./theme";

const ALL_CATEGORIES = "All categories";
const ALL_SUBCATEGORIES = "All subcategories";

const DIRECTIONS: { value: DirectionFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "debit", label: "Debit" },
  { value: "credit", label: "Credit" },
];

// "Categorised" hides the Others : Uncategorised rows; "Uncategorised" shows only those.
const UNCATEGORISED: { value: UncategorisedMode; label: string }[] = [
  { value: "all", label: "All" },
  { value: "categorised", label: "Categorised" },
  { value: "uncategorised", label: "Uncategorised" },
];

interface Props {
  filters: TransactionFilters;
  onChange: (filters: TransactionFilters) => void;
  categories: CategoryDef[];
  rows: Pick<Filterable, "category" | "subcategory">[];
  shown: number;
  total: number;
}

export function TransactionFiltersPanel({ filters, onChange, categories, rows, shown, total }: Props) {
  const [open, setOpen] = useState(false);
  const count = activeFilterCount(filters);

  const categoryChoices = useMemo(() => [ALL_CATEGORIES, ...categoryOptions(categories, rows)], [categories, rows]);
  const subcategoryChoices = useMemo(
    () => (filters.category ? [ALL_SUBCATEGORIES, ...subcategoryOptions(categories, rows, filters.category)] : []),
    [categories, rows, filters.category],
  );

  const setStart = (start: string | null) => {
    if (!isRangeValid(start, filters.end)) {
      notify("The start date must be on or before the end date.");
      return;
    }
    onChange({ ...filters, start });
  };
  const setEnd = (end: string | null) => {
    if (!isRangeValid(filters.start, end)) {
      notify("The end date must be on or after the start date.");
      return;
    }
    onChange({ ...filters, end });
  };

  return (
    <View style={styles.wrap}>
      <Pressable style={styles.bar} onPress={() => setOpen(!open)}>
        <MaterialIcons name="filter-list" size={22} color={colors.primary} />
        <T weight="medium" style={styles.barTitle}>
          Filters
        </T>
        {count > 0 ? (
          <View style={styles.badge}>
            <T weight="medium" style={styles.badgeText}>
              {count}
            </T>
          </View>
        ) : null}
        <T style={styles.result}>{count > 0 ? `${shown} of ${total}` : `${total} transactions`}</T>
        {count > 0 ? <TextButton label="Clear" onPress={() => onChange(NO_FILTERS)} /> : null}
        <MaterialIcons name={open ? "expand-less" : "expand-more"} size={24} color={colors.textSecondary} />
      </Pressable>

      {open ? (
        <View style={styles.panel}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <DateField
                label="From"
                value={filters.start}
                onChange={setStart}
                onClear={() => onChange({ ...filters, start: null })}
              />
            </View>
            <View style={{ flex: 1 }}>
              <DateField
                label="To"
                value={filters.end}
                onChange={setEnd}
                onClear={() => onChange({ ...filters, end: null })}
              />
            </View>
          </View>

          <View style={styles.group}>
            <T style={styles.groupLabel}>Type</T>
            <Segmented options={DIRECTIONS} value={filters.direction} onChange={(direction) => onChange({ ...filters, direction })} />
          </View>

          <SelectField
            label="Category"
            value={filters.category ?? ALL_CATEGORIES}
            options={categoryChoices}
            onChange={(v) => onChange(withCategory(filters, v === ALL_CATEGORIES ? null : v))}
          />
          <SelectField
            label="Sub Category"
            value={filters.category ? (filters.subcategory ?? ALL_SUBCATEGORIES) : ""}
            options={subcategoryChoices}
            disabled={!filters.category}
            onChange={(v) => onChange({ ...filters, subcategory: v === ALL_SUBCATEGORIES ? null : v })}
          />

          <View style={styles.group}>
            <T style={styles.groupLabel}>Uncategorised</T>
            <Segmented
              options={UNCATEGORISED}
              value={filters.uncategorised}
              onChange={(uncategorised) => onChange({ ...filters, uncategorised })}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e0e0e0" },
  bar: { flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 12, paddingRight: 4, minHeight: 48 },
  barTitle: { fontSize: 15 },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#fff", fontSize: 12 },
  result: { flex: 1, textAlign: "right", color: colors.textSecondary, fontSize: 13 },
  panel: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 16, gap: 12 },
  row: { flexDirection: "row", gap: 8 },
  group: { gap: 6 },
  groupLabel: { color: colors.textSecondary, fontSize: 13 },
});
