import { cloudBackupUrl } from "../settings/cloudBackup";
import { loadSavingsMail } from "../settings/savingsMail";
import { importSavingsBytes, importSipText } from "./savingsImport";
import { collectMail, type MailPull } from "./savingsMailCollect";

export type { MailPull };

// Collects the statement PDFs that have arrived by email at the owner's savings inbox (server/src/mail.ts) and imports them the same way a PDF picked on the
// Savings page is imported (the work is in savingsMailCollect.ts). One collection runs at a time.
let running: Promise<MailPull> | null = null;

export function pullSavingsMail(onProgress: (message: string) => void = () => {}): Promise<MailPull> {
  running ??= (async () => {
    const [mail, baseUrl] = [await loadSavingsMail(), cloudBackupUrl()];
    if (!mail || !baseUrl) return { configured: false, found: 0, reports: [], errors: [] };
    return collectMail({ baseUrl, token: mail.token }, { pdf: importSavingsBytes, text: importSipText }, onProgress);
  })().finally(() => {
    running = null;
  });
  return running;
}
