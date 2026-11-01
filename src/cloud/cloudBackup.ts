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
  forgetRecoveryCode,
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
  enabled: boolean; // this phone has a recovery code
  lastBackupAt: string | null;
}

// Does not read the code itself, so it also works while the web build is locked.
export async function cloudStatus(): Promise<CloudStatus> {
  const [enabled, last] = await Promise.all([hasRecoveryCode(), loadLastUpload()]);
  return { configured: cloudBackupUrl() !== null, enabled, lastBackupAt: last?.at ?? null };
}

function serverUrl(): string {
  const url = cloudBackupUrl();
  if (!url) throw new CloudBackupError("Cloud backup is not set up in this build. Set EXPO_PUBLIC_BACKUP_URL (see server/README.md).");
  return url;
}

async function codeOnThisPhone(): Promise<string> {
  const code = await loadRecoveryCode();
  if (!code) throw new CloudBackupError("Turn on cloud backup first.");
  return code;
}

// This phone's recovery code, to show to the owner.
export const showRecoveryCode = codeOnThisPhone;

// Makes this phone's recovery code the first time; returns the code either way.
export async function turnOnCloudBackup(): Promise<string> {
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

// Adds whatever is missing from the cloud copy to this phone (it never changes what is already here). `typedCode` is the
// recovery code from another phone; without it this phone's own code is used. A typed code is kept only after it has opened
// a backup, so later backups from this phone replace that same copy.
export async function restoreFromCloud(typedCode: string | null): Promise<CloudRestoreResult> {
  const url = serverUrl();
  const code = typedCode === null ? await codeOnThisPhone() : normalizeRecoveryCode(typedCode);
  const keys = deriveKeys(parseRecoveryCode(code));

  const found = await downloadBackup(url, keys.id);
  if (!found) {
    throw new CloudBackupError(
      typedCode === null
        ? "There is no cloud backup for this phone's recovery code yet. Back up first."
        : "No backup was found for that recovery code. Check the code, and that the other phone has backed up.",
    );
  }
  const { backup, skipped } = parseBackup(fromUploadBody(found.body, keys));
  const summary = await restoreBackup(backup, skipped);

  if (typedCode !== null && (await loadRecoveryCode()) !== code) {
    await saveRecoveryCode(code);
    await clearLastUpload();
  }
  return { summary, updatedAt: found.updatedAt };
}

// Removes the copy from the server. The recovery code stays on this phone, so the next backup starts a fresh copy.
export async function deleteCloudBackup(): Promise<void> {
  const url = serverUrl();
  const keys = deriveKeys(parseRecoveryCode(await codeOnThisPhone()));
  await deleteBackup(url, keys.id);
  await clearLastUpload();
}

// Cloud backup off for this phone: forgets the recovery code. The copy on the server stays and can be restored with the code.
export const turnOffCloudBackup = forgetRecoveryCode;
