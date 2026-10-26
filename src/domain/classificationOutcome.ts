// How many times the AI may fail to place a transaction before the app stops asking and hands it to the owner.
export const MAX_AI_ATTEMPTS = 3;

// classified_by value of a transaction the AI could not place after MAX_AI_ATTEMPTS answers. It is shown
// in the "Couldn't categorise" list, is not sent to the AI again, and leaves the list when the owner picks a category.
export const UNRESOLVED = "unresolved";

// Called each time the AI answers for a transaction. `couldNotPlace` means the answer was the fallback
// ("Others : Uncategorised") for a debit. An import counts as the first attempt, then each Re-classify.
export function aiAttemptOutcome(previousAttempts: number, couldNotPlace: boolean): { attempts: number; unresolved: boolean } {
  if (!couldNotPlace) return { attempts: previousAttempts, unresolved: false };
  const attempts = previousAttempts + 1;
  return { attempts, unresolved: attempts >= MAX_AI_ATTEMPTS };
}
