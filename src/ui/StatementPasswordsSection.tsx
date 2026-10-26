import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { confirmAction } from "../platform/dialogs";
import { useSecureLock } from "../platform/useSecureLock";
import {
  addStatementPassword,
  loadStatementPasswords,
  removeStatementPassword,
  type StatementPassword,
} from "../settings/statementPasswords";
import { T } from "./Text";
import { UnlockGate } from "./UnlockGate";
import { Button, OutlinedInput } from "./forms";
import { colors } from "./theme";

// Config > Statement passwords: the passwords of PDF statements, tried automatically on import.
export function StatementPasswordsSection() {
  const { locked } = useSecureLock();
  const [items, setItems] = useState<StatementPassword[]>([]);
  const [label, setLabel] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    loadStatementPasswords()
      .then(setItems)
      .catch(() => setItems([]));
  }, []);
  useEffect(() => {
    if (!locked) reload();
  }, [locked, reload]);

  const add = async () => {
    try {
      await addStatementPassword(label, password);
      setLabel("");
      setPassword("");
      setError(null);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const remove = async (item: StatementPassword) => {
    const ok = await confirmAction({ title: `Remove "${item.label}"?`, confirmLabel: "Remove" });
    if (ok) {
      await removeStatementPassword(item.id);
      reload();
    }
  };

  return (
    <View style={{ gap: 12 }}>
      <T style={styles.note}>
        Banks lock the PDF statements they email, often with a password built from your name and date of birth. Save the
        password here, and it is tried automatically when you import a PDF. You can save several (one per bank or
        account). Passwords are kept like your AI key and never leave this device.
      </T>
      <UnlockGate>
        {items.map((p) => (
          <View key={p.id} style={styles.row}>
            <T style={{ flex: 1 }}>{p.label}</T>
            <T style={styles.dots}>••••••••</T>
            <Pressable hitSlop={10} onPress={() => remove(p)} accessibilityLabel={`Remove ${p.label}`}>
              <MaterialIcons name="highlight-off" size={24} color={colors.error} />
            </Pressable>
          </View>
        ))}
        <OutlinedInput label="Name (for example ICICI)" value={label} onChangeText={setLabel} />
        <OutlinedInput label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />
        <Button label="Save password" onPress={add} disabled={password.trim() === ""} />
        {error ? <T style={styles.error}>{error}</T> : null}
      </UnlockGate>
    </View>
  );
}

const styles = StyleSheet.create({
  note: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 40 },
  dots: { color: colors.textSecondary, letterSpacing: 1 },
  error: { color: colors.error, fontSize: 14 },
});
