import type { DocumentPickerAsset } from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

export async function readPickedBytes(asset: DocumentPickerAsset): Promise<Uint8Array> {
  return new Uint8Array(await new File(asset.uri).arrayBuffer());
}

export async function readPickedText(asset: DocumentPickerAsset): Promise<string> {
  return new File(asset.uri).text();
}

// Writes the CSV to the cache folder and opens the share sheet (Save to Files, AirDrop...).
export async function saveCsvFile(fileName: string, csv: string, dialogTitle: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing is not available on this device.");
  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  file.write(csv);
  await Sharing.shareAsync(file.uri, { mimeType: "text/csv", UTI: "public.comma-separated-values-text", dialogTitle });
}
