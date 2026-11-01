import type { Suggestion } from "../domain/masterData";

// Hand-over between a run of the AI (an import or Re-classify) and the AI suggestions screen: where the AI thinks each entry
// it could not place belongs, by entry id. Kept in memory only, nothing is written to the database: the entries stay in
// Others : Uncategorised until the owner approves, and a suggestion that was not answered is gone when the app closes (a
// later Re-classify asks the AI again).
const pending = new Map<string, Suggestion>();
// Entries the AI could not place and had no usable idea for either; the owner chooses their category by hand.
const unsuggested = new Set<string>();

// A new run replaces what the last one left.
export function startSuggestions(): void {
  pending.clear();
  unsuggested.clear();
}

export function addSuggestions(items: { id: string; suggestion: Suggestion | undefined }[]): void {
  for (const { id, suggestion } of items) {
    if (!suggestion) continue;
    pending.set(id, suggestion);
    unsuggested.delete(id);
  }
}

// Entries the AI left in Others : Uncategorised without any suggestion. One that has a suggestion from the same run stays a suggestion.
export function addUnsuggested(ids: readonly string[]): void {
  for (const id of ids) if (!pending.has(id)) unsuggested.add(id);
}

export const pendingUnsuggested = (): string[] => [...unsuggested];

export const unsuggestedCount = (): number => unsuggested.size;

// Categorised since, or deleted.
export function removeUnsuggested(ids: readonly string[]): void {
  for (const id of ids) unsuggested.delete(id);
}

export function pendingSuggestions(): { id: string; suggestion: Suggestion }[] {
  return [...pending].map(([id, suggestion]) => ({ id, suggestion }));
}

export const suggestionCount = (): number => pending.size;

// Approved, rejected, or no longer waiting.
export function removeSuggestions(ids: readonly string[]): void {
  for (const id of ids) pending.delete(id);
}
