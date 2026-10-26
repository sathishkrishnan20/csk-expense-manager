import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_AI_ATTEMPTS, aiAttemptOutcome } from "../../src/domain/classificationOutcome";

test("a placed transaction is never counted against the AI", () => {
  assert.deepEqual(aiAttemptOutcome(0, false), { attempts: 0, unresolved: false });
  assert.deepEqual(aiAttemptOutcome(2, false), { attempts: 2, unresolved: false });
});

test("each failed answer is an attempt, and the last one hands the transaction to the owner", () => {
  let attempts = 0;
  const seen: boolean[] = [];
  for (let i = 0; i < MAX_AI_ATTEMPTS; i++) {
    const r = aiAttemptOutcome(attempts, true);
    attempts = r.attempts;
    seen.push(r.unresolved);
  }
  assert.equal(attempts, MAX_AI_ATTEMPTS);
  assert.deepEqual(seen, [false, false, true]);
});
