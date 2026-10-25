// Browsers have no keychain, so on web the secrets (the AI API key) are encrypted with AES-GCM
// before they go into localStorage. The encryption key is never stored: it is derived from the
// WebAuthn PRF extension, i.e. a secret that this device's authenticator (Touch ID, Windows
// Hello, an Android screen lock) only releases after the user verifies. The page asks for it
// once per page load ("unlock") and keeps the derived key in memory only.
//
// The passkey is used purely as a local key source: there is no server, so the usual WebAuthn
// challenge is random and never verified.
//
// What this protects: a copy of the browser profile or localStorage is useless without the
// device and the user's verification. What it cannot protect: malicious code running in this
// page, or on the computer, while it is unlocked.

const CREDENTIAL_ID = "secure_passkey_id";
const PRF_SALT = "secure_passkey_salt";
const SECRET_PREFIX = "secure:";
const PLAIN_PREFIX = "plain:";
const KEY_INFO = "expense-manager secrets v1";

export class LockedError extends Error {
  constructor() {
    super("Unlock with your passkey first.");
  }
}

let unlockedKey: CryptoKey | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

const toB64 = (bytes: ArrayBuffer | Uint8Array): string =>
  btoa(String.fromCharCode(...(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))));
const fromB64 = (text: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const utf8 = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);
const random = (length: number): Uint8Array<ArrayBuffer> => crypto.getRandomValues(new Uint8Array(length));

const storedSecretKeys = (): string[] =>
  Object.keys(localStorage).filter((k) => k.startsWith(SECRET_PREFIX));

// Locked = there is something encrypted to read and the key is not in memory yet.
export const isSecureStorageLocked = (): boolean => unlockedKey === null && storedSecretKeys().length > 0;

export function subscribeSecureLock(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

async function deriveKey(prfOutput: ArrayBuffer): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", prfOutput, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: utf8(KEY_INFO) },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function prfOf(credential: Credential | null) {
  return (credential as PublicKeyCredential | null)?.getClientExtensionResults().prf;
}

// Browsers only show the Touch ID / PIN prompt for a tap or click, so this (and anything that
// calls it) must run straight from a button handler.
export async function unlockSecureStorage(): Promise<void> {
  if (unlockedKey) return;
  const id = localStorage.getItem(CREDENTIAL_ID);
  const salt = localStorage.getItem(PRF_SALT);
  if (!id || !salt) return; // nothing was ever saved, so there is nothing to unlock

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: random(32),
      allowCredentials: [{ type: "public-key", id: fromB64(id) }],
      userVerification: "required",
      extensions: { prf: { eval: { first: fromB64(salt) } } },
    },
  });
  const secret = prfOf(assertion)?.results?.first;
  if (!secret) throw new Error("This passkey did not release an encryption secret. Use Forget saved key below and set the key up again.");
  unlockedKey = await deriveKey(secret as ArrayBuffer);
  changed();
}

// First save: make the passkey, then derive the key from it.
async function registerPasskey(): Promise<void> {
  const salt = random(32);
  const credential = await navigator.credentials.create({
    publicKey: {
      rp: { name: "Expense Manager" },
      user: { id: random(16), name: "expense-manager", displayName: "Expense Manager" },
      challenge: random(32),
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "preferred", userVerification: "required" },
      extensions: { prf: { eval: { first: salt } } },
    },
  });
  if (!credential) throw new Error("No passkey was created.");

  const prf = prfOf(credential);
  if (!prf?.enabled && !prf?.results) {
    throw new Error(
      "This browser or device cannot use a passkey to protect the key. Try a recent Safari or Chrome with Touch ID, Windows Hello or a screen lock.",
    );
  }
  localStorage.setItem(CREDENTIAL_ID, toB64((credential as PublicKeyCredential).rawId));
  localStorage.setItem(PRF_SALT, toB64(salt));
  // Some browsers only return the secret on the next (get) call.
  if (prf.results?.first) unlockedKey = await deriveKey(prf.results.first as ArrayBuffer);
}

// Called from Save: make sure the key exists, creating the passkey the first time.
async function keyForWriting(): Promise<CryptoKey> {
  if (unlockedKey) return unlockedKey;
  if (!localStorage.getItem(CREDENTIAL_ID)) await registerPasskey();
  if (!unlockedKey) {
    try {
      await unlockSecureStorage();
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        throw new Error("Passkey created. Press Save once more to finish.");
      }
      throw err;
    }
  }
  if (!unlockedKey) throw new Error("Could not get an encryption key from the passkey.");
  changed();
  return unlockedKey;
}

// Used when the passkey is gone (deleted from the device) and the saved key can no longer be read.
export async function resetSecureStorage(): Promise<void> {
  for (const k of storedSecretKeys()) localStorage.removeItem(k);
  localStorage.removeItem(CREDENTIAL_ID);
  localStorage.removeItem(PRF_SALT);
  unlockedKey = null;
  changed();
}

export const secureStorage = {
  async get(key: string): Promise<string | null> {
    const stored = localStorage.getItem(SECRET_PREFIX + key);
    if (stored === null) return null;
    if (!unlockedKey) throw new LockedError();
    const bytes = fromB64(stored);
    try {
      const plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: bytes.slice(0, 12), additionalData: utf8(key) },
        unlockedKey,
        bytes.slice(12),
      );
      return new TextDecoder().decode(plain);
    } catch {
      throw new Error("The saved key could not be decrypted with this passkey. Use Forget saved key and enter it again.");
    }
  },

  async set(key: string, value: string): Promise<void> {
    const cryptoKey = await keyForWriting();
    const iv = random(12);
    const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: utf8(key) }, cryptoKey, utf8(value));
    const packed = new Uint8Array(12 + cipher.byteLength);
    packed.set(iv);
    packed.set(new Uint8Array(cipher), 12);
    localStorage.setItem(SECRET_PREFIX + key, toB64(packed));
    changed();
  },

  // Works while locked: it only looks for the encrypted entry.
  async has(key: string): Promise<boolean> {
    return localStorage.getItem(SECRET_PREFIX + key) !== null;
  },

  async remove(key: string): Promise<void> {
    localStorage.removeItem(SECRET_PREFIX + key);
    changed();
  },
};

// Settings that are not secret (which AI provider is chosen) stay readable without unlocking.
export const plainStorage = {
  get: async (key: string): Promise<string | null> => localStorage.getItem(PLAIN_PREFIX + key),
  set: async (key: string, value: string): Promise<void> => localStorage.setItem(PLAIN_PREFIX + key, value),
  remove: async (key: string): Promise<void> => localStorage.removeItem(PLAIN_PREFIX + key),
};

export const secureStorageLabel = "this browser, encrypted with a passkey";
