import { importMfCas, importNpsStatement, importPfPassbook, importSipPurchases, type ImportReport } from "../db/savings";
import { readSipPdf, readSipText } from "../domain/fundMail";
import { isMfCas, parseMfCas } from "../domain/mfCas";
import { isNpsStatement, parseNpsStatement } from "../domain/npsStatement";
import { isPfPassbook, parsePfPassbook } from "../domain/pfPassbook";
import { pdfLines } from "../domain/pdfLines";
import { readPickedBytes, type PickedFile } from "../platform/files";
import { statementPasswordValues } from "../settings/statementPasswords";

// Savings statements are PDFs: the EPF passbook, the Protean NPS statement and the CDSL consolidated statement (CAS). The kind is recognised from the
// text, each is read by its own parser (which refuses a file whose own totals do not add up), and the result is stored by db/savingsSql.ts, so
// importing the same file again, or an overlapping one, never adds a month twice. The PDF passwords are the ones saved under Config > Statement
// passwords (each is tried in turn), the same as for a bank statement.
export class SavingsImportError extends Error {}

const isPdf = (bytes: Uint8Array): boolean => bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;

export async function importSavingsFile(file: PickedFile, onProgress: (message: string) => void): Promise<ImportReport> {
  onProgress("Reading file…");
  return importSavingsBytes(await readPickedBytes(file), onProgress);
}

// The same, for a PDF that is already in memory (one collected from the savings inbox).
export async function importSavingsBytes(bytes: Uint8Array, onProgress: (message: string) => void): Promise<ImportReport> {
  if (!isPdf(bytes)) throw new SavingsImportError("Choose the PDF statement: the EPF passbook, the NPS statement or the mutual fund CAS.");

  onProgress("Reading the PDF…");
  // Loaded only now, so the PDF reader costs nothing until a statement is imported.
  const { readPdfPages } = await import("../pdf/readPdf");
  const lines = pdfLines(await readPdfPages(bytes, await statementPasswordValues()));

  if (isPfPassbook(lines)) {
    onProgress("Saving the PF passbook…");
    return importPfPassbook(parsePfPassbook(lines));
  }
  if (isNpsStatement(lines)) {
    onProgress("Saving the NPS statement…");
    return importNpsStatement(parseNpsStatement(lines));
  }
  if (isMfCas(lines)) {
    onProgress("Saving the mutual fund statement…");
    return importMfCas(parseMfCas(lines));
  }
  // A fund house's account statement for one fund, sent after a SIP instalment (Axis, Mirae Asset, Nippon India, SBI).
  const purchases = readSipPdf(lines);
  if (purchases.length > 0) {
    onProgress("Saving the purchases…");
    return importSipPurchases(purchases, "Fund statement");
  }
  throw new SavingsImportError("This PDF is not one the app can read here: an EPF passbook, a Protean NPS transaction statement, a CDSL consolidated statement (CAS), or a fund house's account statement after a SIP.");
}

// The text of a purchase confirmation email (ICICI Prudential, Kotak) collected from the savings inbox.
export async function importSipText(mail: { subject: string; text: string }): Promise<ImportReport> {
  const purchase = readSipText(mail.subject, mail.text);
  if (!purchase) throw new SavingsImportError("This email is not a purchase confirmation the app can read.");
  return importSipPurchases([purchase], "Purchase email");
}
