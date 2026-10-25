import { useState } from "react";
import { StyleSheet, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { exportBackup, restoreBackup } from "../db/backup";
import { BackupError, backupFileName, parseBackup, serializeBackup } from "../domain/backup";
import { readPickedText, saveCsvFile } from "../platform/files";
import { T } from "./Text";
import { Button } from "./forms";
import { colors } from "./theme";

// Export / import of everything stored on the device, shown in Config > Export and Import.
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function DataBackupSection() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const run = async (work: () => Promise<string | null>) => {
    setBusy(true);
    setMessage(null);
    try {
      const text = await work();
      if (text) setMessage({ text, isError: false });
    } catch (err) {
      const text = err instanceof BackupError || err instanceof Error ? err.message : String(err);
      setMessage({ text, isError: true });
    } finally {
      setBusy(false);
    }
  };

  const exportData = () =>
    run(async () => {
      const backup = await exportBackup();
      await saveCsvFile(backupFileName(new Date()), serializeBackup(backup), "Export Expense Manager data");
      return `Exported ${count(backup.transactions.length, "transaction")}, ${count(backup.categories.length, "category row")} and ${count(backup.paymentMethods.length, "payment mode")}.`;
    });

  const importData = () =>
    run(async () => {
      const picked = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
      if (picked.canceled) return null;

      const text = await readPickedText(picked.assets[0]);
      const { backup, skipped } = parseBackup(text);
      const r = await restoreBackup(backup, skipped);

      const parts = [
        `${count(r.transactionsAdded, "transaction")} added`,
        `${r.transactionsAlreadyPresent} already on this device`,
        `${count(r.categoriesAdded, "category", "categories")} and ${count(r.paymentMethodsAdded, "payment mode")} added`,
      ];
      if (r.skipped > 0) parts.push(`${count(r.skipped, "damaged entry", "damaged entries")} skipped`);
      return `${parts.join(", ")}.`;
    });

  return (
    <View style={styles.box}>
      <T style={styles.note}>
        Export saves all your transactions, categories and payment modes as one CSV file you can open in Excel (on iPhone
        use Save to Files or AirDrop; in a browser it downloads). Transactions are on the left, then your category list,
        then your payment modes, each block separated by empty columns. Import adds whatever is missing from such a file
        and never changes what is already here; you can also add rows in Excel first, and leave the category empty to
        have the AI fill it in later. Your API key is not included.
      </T>
      <Button label="Export data" onPress={exportData} disabled={busy} />
      <Button label="Import data" onPress={importData} disabled={busy} />
      {message ? <T style={message.isError ? styles.error : styles.note}>{message.text}</T> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 12 },
  note: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  error: { color: colors.error, fontSize: 14 },
});
