import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  addSuggestions,
  addUnsuggested,
  pendingSuggestions,
  pendingUnsuggested,
  removeSuggestions,
  removeUnsuggested,
  startSuggestions,
  suggestionCount,
  unsuggestedCount,
} from "../../src/import/suggestionStore";

beforeEach(() => startSuggestions());

const carrom = { category: "Entertainment", subcategory: "Carrom" };
const vet = { category: "Pets", subcategory: "Vet" };

test("starts empty", () => {
  assert.equal(suggestionCount(), 0);
  assert.deepEqual(pendingSuggestions(), []);
});

test("keeps a suggestion per entry id, and ignores entries without one", () => {
  addSuggestions([
    { id: "a", suggestion: carrom },
    { id: "b", suggestion: undefined },
    { id: "c", suggestion: vet },
  ]);
  assert.equal(suggestionCount(), 2);
  assert.deepEqual(pendingSuggestions(), [
    { id: "a", suggestion: carrom },
    { id: "c", suggestion: vet },
  ]);
});

test("a newer suggestion for the same entry replaces the older one; an answer without one keeps it", () => {
  addSuggestions([{ id: "a", suggestion: carrom }]);
  addSuggestions([{ id: "a", suggestion: vet }]);
  assert.deepEqual(pendingSuggestions(), [{ id: "a", suggestion: vet }]);
  addSuggestions([{ id: "a", suggestion: undefined }]);
  assert.equal(suggestionCount(), 1);
});

test("approved or rejected entries are removed, others stay", () => {
  addSuggestions([
    { id: "a", suggestion: carrom },
    { id: "b", suggestion: carrom },
    { id: "c", suggestion: vet },
  ]);
  removeSuggestions(["a", "c", "unknown"]);
  assert.deepEqual(pendingSuggestions(), [{ id: "b", suggestion: carrom }]);
});

test("a new run forgets the last run's suggestions", () => {
  addSuggestions([{ id: "a", suggestion: carrom }]);
  startSuggestions();
  assert.equal(suggestionCount(), 0);
});

test("entries the AI had no idea for are kept apart from the suggestions", () => {
  addSuggestions([{ id: "a", suggestion: carrom }]);
  addUnsuggested(["b", "c"]);
  assert.equal(suggestionCount(), 1);
  assert.equal(unsuggestedCount(), 2);
  assert.deepEqual(pendingUnsuggested(), ["b", "c"]);
});

test("an entry that has a suggestion is not also listed as having none, and a later suggestion takes it off the list", () => {
  addSuggestions([{ id: "a", suggestion: carrom }]);
  addUnsuggested(["a", "b"]);
  assert.deepEqual(pendingUnsuggested(), ["b"]);
  addSuggestions([{ id: "b", suggestion: vet }]);
  assert.deepEqual(pendingUnsuggested(), []);
});

test("entries categorised since are removed from the no-suggestion list, and a new run clears it", () => {
  addUnsuggested(["a", "b", "c"]);
  removeUnsuggested(["a", "unknown"]);
  assert.deepEqual(pendingUnsuggested(), ["b", "c"]);
  startSuggestions();
  assert.equal(unsuggestedCount(), 0);
});
