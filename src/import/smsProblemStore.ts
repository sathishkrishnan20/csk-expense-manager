import { useSyncExternalStore } from "react";

// The problem line for the Home screen's bar (see domain/smsProblem.ts), kept in memory: it is worked out again at every check, so a
// check that goes well clears it. Dismissing hides that line until a different one comes up; it is shown again the next time the
// app starts, because the cause (a message the app cannot read, say) is still there.
let text: string | null = null;
let dismissed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function reportSmsProblem(next: string | null): void {
  if (next === text) return;
  text = next;
  dismissed = false;
  notify();
}

export function dismissSmsProblem(): void {
  if (text === null || dismissed) return;
  dismissed = true;
  notify();
}

// What the bar should show now: the line, or null when there is nothing (or it was dismissed).
export const currentSmsProblem = (): string | null => (dismissed ? null : text);

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useSmsProblem = (): string | null => useSyncExternalStore(subscribe, currentSmsProblem);
