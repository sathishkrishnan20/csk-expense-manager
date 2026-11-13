import { getRandomBytesAsync } from "expo-crypto";
import { TOKEN_BYTES, addressFor, isDomain, isToken, tokenFromBytes, type SavingsMailSettings } from "../domain/savingsMail";
import { secureStorage } from "../platform/secureStorage";

// The owner's savings inbox: the secret token and the domain it is on. The token is what lets this phone collect the statements that arrive at the
// address, so it is kept like the cloud recovery code, in the Keychain, and never in the database or a backup file.
const KEY = "savings_mail";

export interface SavingsMail extends SavingsMailSettings {
  address: string;
}

export async function loadSavingsMail(): Promise<SavingsMail | null> {
  try {
    const raw = await secureStorage.get(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    const t = (parsed as { token?: unknown })?.token;
    const d = (parsed as { domain?: unknown })?.domain;
    return typeof t === "string" && typeof d === "string" && isToken(t) && isDomain(d) ? { token: t, domain: d, address: addressFor(t, d) } : null;
  } catch {
    return null;
  }
}

// Makes a new secret address on this domain and keeps it. Replaces any earlier one.
export async function createSavingsMail(domain: string): Promise<SavingsMail> {
  if (!isDomain(domain)) throw new Error("Enter the domain name only, like example.com.");
  const token = tokenFromBytes(await getRandomBytesAsync(TOKEN_BYTES));
  const clean = domain.trim().toLowerCase();
  await secureStorage.set(KEY, JSON.stringify({ token, domain: clean }));
  return { token, domain: clean, address: addressFor(token, clean) };
}

// Keeps an address that already exists (made earlier, perhaps on this phone before a reinstall) so the statements already waiting at it are collected.
export async function saveSavingsMail(settings: SavingsMailSettings): Promise<SavingsMail> {
  if (!isToken(settings.token) || !isDomain(settings.domain)) throw new Error("That address cannot be used.");
  await secureStorage.set(KEY, JSON.stringify({ token: settings.token, domain: settings.domain }));
  return { ...settings, address: addressFor(settings.token, settings.domain) };
}

export const removeSavingsMail = (): Promise<void> => secureStorage.remove(KEY);
