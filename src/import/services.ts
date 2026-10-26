import { applyClassifications, listReclassifyCandidates, restoreDeleted, sqliteStore } from "../db/transactions";
import { loadCategories } from "../db/config";
import { classifyBatch, type ClassifiableRow } from "../llm/classify";
import { createLlmCall, providerNeedsKey } from "../llm/providers";
import { loadSettings } from "../settings/settings";
import type { ParsedTransaction } from "../domain/statementParser";
import type { Classification, Direction } from "../domain/taxonomy";
import { importParsed, importStatement, type ImportSummary } from "./importStatement";
import { reclassify, type ReclassifyCandidate, type ReclassifySummary } from "./reclassify";
import { isExcelBinary, excelToCSV } from "../domain/excelReader";
import { readPickedBytes, type PickedFile } from "../platform/files";
import { PdfStatementError, parseStatementPdf } from "../domain/pdfStatement";
import { statementPasswordValues } from "../settings/statementPasswords";

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

export async function runImport(asset: PickedFile, onProgress: (message: string) => void): Promise<ImportSummary> {
  const classifier = await createClassifier();

  onProgress("Reading file…");
  const bytes = await readPickedBytes(asset);
  const deps = {
    store: sqliteStore,
    classify: classifier.classify,
    classifierLabel: classifier.label,
    onProgress,
  };

  if (isPdf(bytes)) {
    onProgress("Reading the PDF…");
    // Loaded only now, so the PDF reader costs nothing (and cannot get in the way) for CSV and Excel.
    const { readPdfPages } = await import("../pdf/readPdf");
    const pages = await readPdfPages(bytes, await statementPasswordValues());
    const statement = parseStatementPdf(pages);
    // The statement's own balances and totals must add up; if they do not, the numbers were misread
    // and nothing is saved.
    if (statement.warnings.length > 0) {
      throw new PdfStatementError(
        `This PDF could not be read reliably, so nothing was imported. ${statement.warnings.join(" ")} Try the CSV or Excel download from your bank instead.`,
      );
    }
    return importParsed({ rows: statement.rows, skippedLines: 0 }, deps);
  }

  const text = isExcelBinary(bytes) ? excelToCSV(bytes) : new TextDecoder().decode(bytes);
  return importStatement(text, deps);
}

// "%PDF" at the start of the file.
const isPdf = (bytes: Uint8Array): boolean =>
  bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;

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
