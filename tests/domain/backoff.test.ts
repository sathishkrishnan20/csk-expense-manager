import { test } from "node:test";
import assert from "node:assert/strict";
import { withBackoff } from "../../src/domain/backoff";

const recorder = () => {
  const waits: number[] = [];
  return { waits, sleep: async (ms: number) => void waits.push(ms) };
};

test("a first try that works is not repeated or delayed", async () => {
  const { waits, sleep } = recorder();
  let calls = 0;
  assert.equal(await withBackoff(async () => (++calls, "ok"), { attempts: 4, baseDelayMs: 2000, sleep }), "ok");
  assert.equal(calls, 1);
  assert.deepEqual(waits, []);
});

test("each retry waits twice as long as the one before, and the first success ends it", async () => {
  const { waits, sleep } = recorder();
  let calls = 0;
  const value = await withBackoff(
    async () => {
      if (++calls < 4) throw new Error("down");
      return calls;
    },
    { attempts: 4, baseDelayMs: 2000, sleep },
  );
  assert.equal(value, 4);
  assert.deepEqual(waits, [2000, 4000, 8000]);
});

test("when every try fails the last error is thrown after the tries are used up", async () => {
  const { waits, sleep } = recorder();
  let calls = 0;
  await assert.rejects(
    withBackoff(async () => Promise.reject(new Error(`fail ${++calls}`)), { attempts: 3, baseDelayMs: 1000, sleep }),
    /fail 3/,
  );
  assert.equal(calls, 3);
  assert.deepEqual(waits, [1000, 2000]);
});

test("an error that waiting cannot fix is thrown at once", async () => {
  const { waits, sleep } = recorder();
  let calls = 0;
  await assert.rejects(
    withBackoff(async () => Promise.reject(new Error("wrong link")), { attempts: 4, baseDelayMs: 2000, retryIf: () => (++calls, false), sleep }),
    /wrong link/,
  );
  assert.equal(calls, 1);
  assert.deepEqual(waits, []);
});

test("one try means no retry at all", async () => {
  const { waits, sleep } = recorder();
  await assert.rejects(withBackoff(async () => Promise.reject(new Error("x")), { attempts: 1, baseDelayMs: 2000, sleep }), /x/);
  assert.deepEqual(waits, []);
});
