import { applyClassifications, listReclassifyCandidates, restoreDeleted, sqliteStore } from "../db/transactions";
import { loadCategories } from "../db/config";
import { classifyBatch, type ClassifiableRow } from "../llm/classify";
import { createLlmCall, providerNeedsKey } from "../llm/providers";
import { loadSettings } from "../settings/settings";
import type { ParsedTransaction } from "../domain/statementParser";
import type { Classification, Direction } from "../domain/taxonomy";
import type { DocumentPickerAsset } from "expo-document-picker";
import { importStatement, type ImportSummary } from "./importStatement";
import { reclassify, type ReclassifyCandidate, type ReclassifySummary } from "./reclassify";
import { isExcelBinary, excelToCSV } from "../domain/excelReader";
import { readPickedBytes } from "../platform/files";

export class MissingApiKeyError extends Error {}

// Reads the user's current categories once per run, so edits made in Config
// apply to the next import or re-classify straight away.
async function createClassifier() {
  const { provider, apiKey, model, ollamaUrl } = await loadSettings();
  if (providerNeedsKey(provider) && !apiKey) throw new MissingApiKeyError("Add your AI API key in Config before importing.");

  const call = createLlmCall(provider, apiKey ?? "", { model, baseUrl: ollamaUrl });
  const categories = await loadCategories();
  return {
    // Stored on each row so you can see which model labelled it.
    label: model,
    classify: (rows: ClassifiableRow[], direction: Direction): Promise<Map<number, Classification>> =>
      classifyBatch(rows, direction, categories, call),
  };
}

export async function runImport(asset: DocumentPickerAsset, onProgress: (message: string) => void): Promise<ImportSummary> {
  const classifier = await createClassifier();

  onProgress("Reading file…");
  const bytes = await readPickedBytes(asset);
  const text = isExcelBinary(bytes) ? excelToCSV(bytes) : new TextDecoder().decode(bytes);

  return importStatement(text, {
    store: sqliteStore,
    classify: classifier.classify,
    classifierLabel: classifier.label,
    onProgress,
  });
}

export interface RestoreOutcome {
  restored: number;
  keptManual: number; // restored with the category the owner had chosen by hand
  summary: ReclassifySummary | null; // null when the AI step could not start
  error: string | null;
}

// "Add them back" on the import summary: re-activates the deleted bank rows that were in the
// file and categorises them again with the selected AI. A category the owner chose by hand is kept.
export async function restoreDeletedRows(
  rows: ParsedTransaction[],
  onProgress: (message: string) => void,
): Promise<RestoreOutcome> {
  const { restored, reclassifiable } = await restoreDeleted(rows.map((r) => r.dedupeKey));
  const outcome: RestoreOutcome = { restored, keptManual: restored - reclassifiable.size, summary: null, error: null };

  const candidates: ReclassifyCandidate[] = rows
    .filter((r) => reclassifiable.has(r.dedupeKey))
    .map((r) => ({
      id: r.dedupeKey, // imported rows use their bank key as id
      direction: r.direction,
      amountPaise: r.amountPaise,
      payee: r.payee,
      vpa: r.vpa,
      note: r.note,
      narration: r.narration,
    }));
  if (candidates.length === 0) return outcome;

  try {
    const classifier = await createClassifier();
    outcome.summary = await reclassify({
      list: async () => candidates,
      classify: classifier.classify,
      apply: (updates) => applyClassifications(updates, classifier.label),
      onProgress,
    });
  } catch (err) {
    outcome.error = err instanceof Error ? err.message : String(err);
  }
  return outcome;
}

export async function runReclassify(onProgress: (message: string) => void): Promise<ReclassifySummary> {
  const classifier = await createClassifier();
  return reclassify({
    list: listReclassifyCandidates,
    classify: classifier.classify,
    apply: (updates) => applyClassifications(updates, classifier.label),
    onProgress,
  });
}
