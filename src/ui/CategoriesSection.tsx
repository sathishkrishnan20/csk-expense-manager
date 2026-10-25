import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { deleteCategory, loadCategories, saveCategory } from "../db/config";
import { validateCategoryEdit, type CategoryEdit } from "../domain/categoryEdit";
import { isProtectedCategory, isProtectedSubcategory, type CategoryDef } from "../domain/masterData";
import { T } from "./Text";
import { Button, OutlinedInput, TextButton } from "./forms";
import { colors } from "./theme";

interface EditRow {
  key: number;
  original: string | null;
  name: string;
}

interface Editing {
  original: string | null;
  name: string;
  rows: EditRow[];
  nextKey: number;
}

export function CategoriesSection() {
  const [categories, setCategories] = useState<CategoryDef[]>([]);
  const [expanded, setExpanded] = useState("");
  const [edit, setEdit] = useState<Editing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => loadCategories().then(setCategories), []);
  useEffect(() => {
    reload();
  }, [reload]);

  const startEdit = (def: CategoryDef) => {
    setError(null);
    setEdit({
      original: def.category,
      name: def.category,
      rows: def.subcategories.map((s, i) => ({ key: i, original: s, name: s })),
      nextKey: def.subcategories.length,
    });
  };

  const startNew = () => {
    setError(null);
    setEdit({ original: null, name: "", rows: [{ key: 0, original: null, name: "" }], nextKey: 1 });
  };

  const save = async () => {
    if (!edit) return;
    const payload: CategoryEdit = {
      original: edit.original,
      name: edit.name,
      subs: edit.rows.map(({ original, name }) => ({ original, name })),
    };
    const problem = validateCategoryEdit(categories, payload);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    try {
      await saveCategory(payload);
      await reload();
      setEdit(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = () => {
    if (!edit?.original) return;
    const name = edit.original;
    Alert.alert(
      "Are you sure want to delete?",
      "This removes the category and its subcategories from the list. Existing transactions keep their labels.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteCategory(name);
              await reload();
              setEdit(null);
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            }
          },
        },
      ],
    );
  };

  if (edit) {
    const protectedName = edit.original !== null && isProtectedCategory(edit.original);
    return (
      <View style={styles.editor}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <OutlinedInput
              label="Category"
              value={edit.name}
              editable={!protectedName}
              onChangeText={(name) => setEdit({ ...edit, name })}
            />
          </View>
          <Button
            label="Add"
            onPress={() =>
              setEdit({ ...edit, rows: [...edit.rows, { key: edit.nextKey, original: null, name: "" }], nextKey: edit.nextKey + 1 })
            }
          />
        </View>

        {edit.rows.map((row, index) => {
          const locked = row.original !== null && edit.original !== null && isProtectedSubcategory(edit.original, row.original);
          return (
            <View key={row.key} style={[styles.row, { marginLeft: 24 }]}>
              <View style={{ flex: 1 }}>
                <OutlinedInput
                  label={`Sub Category ${index + 1}`}
                  value={row.name}
                  editable={!locked}
                  onChangeText={(name) =>
                    setEdit({ ...edit, rows: edit.rows.map((r) => (r.key === row.key ? { ...r, name } : r)) })
                  }
                />
              </View>
              {locked ? (
                <View style={styles.removeSlot} />
              ) : (
                <Pressable
                  hitSlop={8}
                  style={styles.removeSlot}
                  onPress={() => setEdit({ ...edit, rows: edit.rows.filter((r) => r.key !== row.key) })}
                  accessibilityLabel="Remove subcategory"
                >
                  <MaterialIcons name="highlight-off" size={26} color={colors.error} />
                </Pressable>
              )}
            </View>
          );
        })}

        {error ? <T style={styles.error}>{error}</T> : null}

        <View style={[styles.row, { marginTop: 8 }]}>
          {edit.original !== null && !protectedName ? (
            <Button label="Delete" color={colors.error} onPress={confirmDelete} disabled={busy} style={{ flex: 1 }} />
          ) : null}
          <TextButton label="Cancel" onPress={() => setEdit(null)} />
          <Button label="Save" onPress={save} disabled={busy} style={{ flex: 1 }} />
        </View>
      </View>
    );
  }

  return (
    <View>
      {categories.map((c) => {
        const open = expanded === c.category;
        return (
          <View key={c.category}>
            <Pressable style={styles.categoryRow} onPress={() => setExpanded(open ? "" : c.category)}>
              <T style={{ flex: 1 }}>{c.category}</T>
              <Pressable hitSlop={10} onPress={() => startEdit(c)} accessibilityLabel={`Edit ${c.category}`}>
                <MaterialIcons name="edit" size={22} color={colors.textSecondary} />
              </Pressable>
              <MaterialIcons name={open ? "expand-less" : "expand-more"} size={26} color={colors.textSecondary} style={{ marginLeft: 12 }} />
            </Pressable>
            {open
              ? c.subcategories.map((s) => (
                  <View key={s}>
                    <View style={styles.subRow}>
                      <T>{s}</T>
                    </View>
                    <View style={styles.subDivider} />
                  </View>
                ))
              : null}
          </View>
        );
      })}
      <View style={styles.addRow}>
        <Pressable style={styles.addButton} onPress={startNew}>
          <MaterialIcons name="add" size={20} color="#fff" />
          <T weight="medium" style={styles.addLabel}>
            ADD NEW CATEGORY
          </T>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  editor: { gap: 12, paddingTop: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  removeSlot: { width: 32, alignItems: "center" },
  error: { color: colors.error, fontSize: 14 },
  categoryRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12 },
  subRow: { paddingLeft: 32, paddingRight: 16, paddingVertical: 12 },
  subDivider: { height: 1, backgroundColor: "#e0e0e0", marginHorizontal: 32 },
  addRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 12, marginRight: 8 },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    height: 36,
    borderRadius: 4,
  },
  addLabel: { color: "#fff", fontSize: 14, letterSpacing: 1.25 },
});
