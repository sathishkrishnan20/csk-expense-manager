import { getRandomBytesAsync } from "expo-crypto";
import { exportBackup, restoreBackup, type RestoreSummary } from "../db/backup";
import { parseBackup, serializeBackup } from "../domain/backup";
import {
  CloudBackupError,
  NONCE_BYTES,
  SECRET_BYTES,
  contentFingerprint,
  deriveKeys,
  encodeRecoveryCode,
  fromUploadBody,
  normalizeRecoveryCode,
  parseRecoveryCode,
  toUploadBody,
} from "../domain/cloudBackup";
import {
  cloudBackupUrl,
  clearLastUpload,
  hasRecoveryCode,
  loadLastUpload,
  loadRecoveryCode,
  saveLastUpload,
  saveRecoveryCode,
} from "../settings/cloudBackup";
import { deleteBackup, downloadBackup, uploadBackup } from "./client";

// Cloud backup as the Config screen uses it. The recovery code is the only thing that identifies the owner: it is made on
// this phone, kept in the Keychain, and the server only ever sees a hash of it and encrypted bytes (domain/cloudBackup.ts).

export interface CloudStatus {
  configured: boolean; // the server address is set
  hasCode: boolean; // this phone has a recovery code
  lastBackupAt: string | null;
}

// Does not read the code itself, so it also works while the web build is locked.
export async function cloudStatus(): Promise<CloudStatus> {
  const [hasCode, last] = await Promise.all([hasRecoveryCode(), loadLastUpload()]);
  return { configured: cloudBackupUrl() !== null, hasCode, lastBackupAt: last?.at ?? null };
}

function serverUrl(): string {
  const url = cloudBackupUrl();
  if (!url) throw new CloudBackupError("Cloud backup is not set up in this build. Set EXPO_PUBLIC_BACKUP_URL (see server/README.md).");
  return url;
}

async function codeOnThisPhone(): Promise<string> {
  const code = await loadRecoveryCode();
  if (!code) throw new CloudBackupError("This phone has no recovery code yet. Back up to the cloud first.");
  return code;
}

// This phone's recovery code, to show to the owner.
export const showRecoveryCode = codeOnThisPhone;

// The first backup on a phone makes its recovery code; after that this returns the same code.
export async function ensureRecoveryCode(): Promise<string> {
  serverUrl();
  const existing = await loadRecoveryCode();
  if (existing) return existing;
  const code = encodeRecoveryCode(await getRandomBytesAsync(SECRET_BYTES));
  await saveRecoveryCode(code);
  return code;
}

export type BackUpResult = { kind: "uploaded"; at: string; transactions: number } | { kind: "unchanged"; at: string };

// Sends everything to the server, replacing the previous cloud backup. When nothing changed since the last upload nothing is
// sent (the free server allows a limited number of writes a day).
export async function backUpToCloud(): Promise<BackUpResult> {
  const url = serverUrl();
  const keys = deriveKeys(parseRecoveryCode(await codeOnThisPhone()));

  const backup = await exportBackup();
  const csv = serializeBackup(backup);
  const fingerprint = contentFingerprint(keys, csv);
  const last = await loadLastUpload();
  if (last && last.fingerprint === fingerprint) return { kind: "unchanged", at: last.at };

  const body = toUploadBody(csv, keys, await getRandomBytesAsync(NONCE_BYTES));
  await uploadBackup(url, keys.id, body);
  const at = new Date().toISOString();
  await saveLastUpload({ at, fingerprint });
  return { kind: "uploaded", at, transactions: backup.transactions.length };
}

export interface CloudRestoreResult {
  summary: RestoreSummary;
  updatedAt: string | null;
}

// Adds whatever is missing from the cloud copy to this phone (it never changes what is already here). The owner always types
// the recovery code. The typed code is only used to read that copy: it is not kept, and this phone's own recovery code (if it
// has one) is not changed. A phone with no code makes its own on its first backup, so the copy restored from stays exactly as
// it was and the two phones then back up independently.
export async function restoreFromCloud(typedCode: string): Promise<CloudRestoreResult> {
  const url = serverUrl();
  const code = normalizeRecoveryCode(typedCode);
  const keys = deriveKeys(parseRecoveryCode(code));

  const found = await downloadBackup(url, keys.id);
  if (!found) throw new CloudBackupError("No backup was found for that recovery code. Check the code, and that a backup was made with it.");
  const { backup, skipped } = parseBackup(fromUploadBody(found.body, keys));
  const summary = await restoreBackup(backup, skipped);

  return { summary, updatedAt: found.updatedAt };
}

// Removes the copy from the server. The recovery code stays on this phone, so the next backup starts a fresh copy.
export async function deleteCloudBackup(): Promise<void> {
  const url = serverUrl();
  const keys = deriveKeys(parseRecoveryCode(await codeOnThisPhone()));
  await deleteBackup(url, keys.id);
  await clearLastUpload();
}
