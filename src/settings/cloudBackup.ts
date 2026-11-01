import { plainStorage, secureStorage } from "../platform/secureStorage";

// The recovery code is the owner's whole cloud identity, so it lives in the iOS Keychain (encrypted with a passkey on web),
// never in the database or in a backup file. Where the last upload stands is not secret and is kept in plain storage.
const CODE_KEY = "cloud_backup_code";
const LAST_AT_KEY = "cloud_backup_last_at";
const LAST_FINGERPRINT_KEY = "cloud_backup_last_fingerprint";

// Where the backup server is, set in `.env` (see server/README.md). Expo puts EXPO_PUBLIC_ values into the app when it
// starts. Null when it is not set or is not a web address.
export function cloudBackupUrl(): string | null {
  const url = (process.env.EXPO_PUBLIC_BACKUP_URL ?? "").trim().replace(/\/+$/, "");
  return /^https?:\/\/\S+$/.test(url) ? url : null;
}

export const loadRecoveryCode = (): Promise<string | null> => secureStorage.get(CODE_KEY);
export const saveRecoveryCode = (code: string): Promise<void> => secureStorage.set(CODE_KEY, code);
export const hasRecoveryCode = (): Promise<boolean> => secureStorage.has(CODE_KEY);

export interface LastUpload {
  at: string; // ISO time
  fingerprint: string;
}

export async function loadLastUpload(): Promise<LastUpload | null> {
  const [at, fingerprint] = await Promise.all([plainStorage.get(LAST_AT_KEY), plainStorage.get(LAST_FINGERPRINT_KEY)]);
  return at && fingerprint ? { at, fingerprint } : null;
}

export async function saveLastUpload(upload: LastUpload): Promise<void> {
  await plainStorage.set(LAST_AT_KEY, upload.at);
  await plainStorage.set(LAST_FINGERPRINT_KEY, upload.fingerprint);
}

export async function clearLastUpload(): Promise<void> {
  await plainStorage.remove(LAST_AT_KEY);
  await plainStorage.remove(LAST_FINGERPRINT_KEY);
}
