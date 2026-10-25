import { applyClassifications, listReclassifyCandidates, sqliteStore } from "../db/transactions";
import { loadCategories } from "../db/config";
import { classifyBatch, type ClassifiableRow } from "../llm/classify";
import { createLlmCall, MODELS } from "../llm/providers";
import { loadSettings } from "../settings/settings";
import type { Classification, Direction } from "../domain/taxonomy";
import { File } from "expo-file-system";
import { importStatement, type ImportSummary } from "./importStatement";
import { reclassify, type ReclassifySummary } from "./reclassify";

export class MissingApiKeyError extends Error {}

// Reads the user's current categories once per run, so edits made in Config
// apply to the next import or re-classify straight away.
async function createClassifier() {
  const { provider, apiKey } = await loadSettings();
  if (!apiKey) throw new MissingApiKeyError("Add your AI API key in Config before importing.");

  const call = createLlmCall(provider, apiKey);
  const categories = await loadCategories();
  return {
    label: MODELS[provider],
    classify: (rows: ClassifiableRow[], direction: Direction): Promise<Map<number, Classification>> =>
      classifyBatch(rows, direction, categories, call),
  };
}

export async function runImport(fileUri: string, onProgress: (message: string) => void): Promise<ImportSummary> {
  const classifier = await createClassifier();

  onProgress("Reading file…");
  const text = await new File(fileUri).text();

  return importStatement(text, {
    store: sqliteStore,
    classify: classifier.classify,
    classifierLabel: classifier.label,
    onProgress,
  });
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
