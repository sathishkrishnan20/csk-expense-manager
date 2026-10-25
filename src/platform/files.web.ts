import type { DocumentPickerAsset } from "expo-document-picker";

// On web the picker hands back the browser's File object.
function browserFile(asset: DocumentPickerAsset): Blob {
  if (!asset.file) throw new Error("Could not read the chosen file.");
  return asset.file;
}

export async function readPickedBytes(asset: DocumentPickerAsset): Promise<Uint8Array> {
  return new Uint8Array(await browserFile(asset).arrayBuffer());
}

export async function readPickedText(asset: DocumentPickerAsset): Promise<string> {
  return browserFile(asset).text();
}

// Downloads the CSV through the browser (it lands in the Downloads folder).
export async function saveCsvFile(fileName: string, csv: string, _dialogTitle: string): Promise<void> {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
