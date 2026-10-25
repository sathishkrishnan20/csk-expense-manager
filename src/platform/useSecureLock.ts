import { useCallback, useState, useSyncExternalStore } from "react";
import { confirmAction } from "./dialogs";
import {
  isSecureStorageLocked,
  resetSecureStorage,
  subscribeSecureLock,
  unlockSecureStorage,
} from "./secureStorage";

// Whether the saved API key is still locked behind the passkey (web only; never on iOS).
export function useSecureLock() {
  const locked = useSyncExternalStore(subscribeSecureLock, isSecureStorageLocked, () => false);
  const [error, setError] = useState<string | null>(null);

  const unlock = useCallback(async () => {
    setError(null);
    try {
      await unlockSecureStorage();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const reset = useCallback(async () => {
    const confirmed = await confirmAction({
      title: "Forget the saved key?",
      message: "This deletes the saved API key from this browser. You can enter it again afterwards.",
      confirmLabel: "Forget",
    });
    if (confirmed) {
      await resetSecureStorage();
      setError(null);
    }
  }, []);

  return { locked, error, unlock, reset };
}
