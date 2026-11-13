import { deleteMail, downloadMail, listMail, readMailText, SavingsMailError, type MailText } from "../cloud/savingsMail";
import type { ImportReport } from "../db/savingsSql";

// Collects the statement PDFs waiting in the savings inbox and imports each with `importBytes`. Kept free of anything that needs a phone, so it is tested in
// Node against the Worker's own code (tests/cloud/savingsMail.test.ts). A PDF is deleted from the server only after it has been saved; one that could not be read
// stays (the server drops it after 30 days) so it can be tried again, and its name and reason are reported.
export interface MailPull {
  configured: boolean; // an address has been made on this phone and the server's address is set in this build
  found: number; // PDFs that were waiting
  reports: ImportReport[];
  errors: string[];
}

export interface MailImporters {
  pdf: (bytes: Uint8Array, onProgress: (message: string) => void) => Promise<ImportReport>;
  text: (mail: MailText) => Promise<ImportReport>;
}

export async function collectMail(
  where: { baseUrl: string; token: string },
  importers: MailImporters,
  onProgress: (message: string) => void = () => {},
  fetchFn: typeof fetch = fetch,
): Promise<MailPull> {
  const result: MailPull = { configured: true, found: 0, reports: [], errors: [] };
  try {
    onProgress("Looking for statements in your email…");
    const items = await listMail(where.baseUrl, where.token, fetchFn);
    result.found = items.length;
    for (const item of items) {
      try {
        onProgress(`Reading ${item.name}…`);
        const bytes = await downloadMail(where.baseUrl, where.token, item.id, fetchFn);
        if (!bytes) continue; // collected by another phone, or expired
        if (item.kind === "text") {
          const mail = readMailText(bytes);
          if (!mail) throw new Error("the saved email could not be read.");
          result.reports.push(await importers.text(mail));
        } else {
          result.reports.push(await importers.pdf(bytes, onProgress));
        }
        await deleteMail(where.baseUrl, where.token, item.id, fetchFn).catch(() => undefined);
      } catch (err) {
        result.errors.push(`${item.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (err) {
    result.errors.push(err instanceof SavingsMailError || err instanceof Error ? err.message : String(err));
  }
  return result;
}
