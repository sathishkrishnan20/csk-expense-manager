import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { addSuggestions, pendingSuggestions, removeSuggestions, startSuggestions, suggestionCount } from "../../src/import/suggestionStore";

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
