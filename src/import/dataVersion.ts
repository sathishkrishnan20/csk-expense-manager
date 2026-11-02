import { useSyncExternalStore } from "react";

// A counter that goes up when the app adds transactions on its own (a bank SMS arriving), so a page that is already on screen
// reloads its list. Pages load their data when they come into focus, which does not happen when the app returns from the background.
let version = 0;
const listeners = new Set<() => void>();

export function bumpDataVersion(): void {
  version++;
  listeners.forEach((l) => l());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useDataVersion = (): number => useSyncExternalStore(subscribe, () => version);
