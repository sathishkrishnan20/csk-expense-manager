import * as SecureStore from "expo-secure-store";

// Secrets (the AI API key) live in the iOS Keychain, which needs no unlocking step.
export const secureStorage = {
  get: (key: string): Promise<string | null> => SecureStore.getItemAsync(key),
  set: (key: string, value: string): Promise<void> => SecureStore.setItemAsync(key, value),
  remove: (key: string): Promise<void> => SecureStore.deleteItemAsync(key),
  // Whether something is saved, without needing the secret itself.
  has: async (key: string): Promise<boolean> => (await SecureStore.getItemAsync(key)) !== null,
};

// Plain settings (not secret). Same store on iOS; the web build keeps them out of the encrypted part.
export const plainStorage = secureStorage;

export const secureStorageLabel = "the iOS Keychain on this phone";

// The web build locks the secrets behind a passkey. The Keychain never needs that, so these do nothing.
export const isSecureStorageLocked = (): boolean => false;
export const subscribeSecureLock = (_onChange: () => void): (() => void) => () => {};
export const unlockSecureStorage = async (): Promise<void> => {};
export const resetSecureStorage = async (): Promise<void> => {};
