import type { Suggestion } from "../domain/masterData";

// Hand-over between a run of the AI (an import or Re-classify) and the AI suggestions screen: where the AI thinks each entry
// it could not place belongs, by entry id. Kept in memory only, nothing is written to the database: the entries stay in
// Others : Uncategorised until the owner approves, and a suggestion that was not answered is gone when the app closes (a
// later Re-classify asks the AI again).
const pending = new Map<string, Suggestion>();

// A new run replaces what the last one left.
export function startSuggestions(): void {
  pending.clear();
}

export function addSuggestions(items: { id: string; suggestion: Suggestion | undefined }[]): void {
  for (const { id, suggestion } of items) if (suggestion) pending.set(id, suggestion);
}

export function pendingSuggestions(): { id: string; suggestion: Suggestion }[] {
  return [...pending].map(([id, suggestion]) => ({ id, suggestion }));
}

export const suggestionCount = (): number => pending.size;

// Approved, rejected, or no longer waiting.
export function removeSuggestions(ids: readonly string[]): void {
  for (const id of ids) pending.delete(id);
}
