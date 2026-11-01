import { test } from "node:test";
import assert from "node:assert/strict";
import { handle, MAX_BODY_CHARS, type Env, type KvLike } from "../../server/src/worker";
import { MAX_UPLOAD_CHARS } from "../../src/domain/cloudBackup";

function fakeKv(): KvLike & { data: Map<string, { value: string; metadata: unknown }> } {
  const data = new Map<string, { value: string; metadata: unknown }>();
  return {
    data,
    get: async (key) => data.get(key)?.value ?? null,
    getWithMetadata: async <M>(key: string) => {
      const entry = data.get(key);
      return { value: entry?.value ?? null, metadata: (entry?.metadata as M | undefined) ?? null };
    },
    put: async (key, value, options) => void data.set(key, { value, metadata: options?.metadata }),
    delete: async (key) => void data.delete(key),
  };
}

const ID = "a".repeat(64);
const BODY = "RU1CA" + "QUJD".repeat(20); // looks like a sealed backup
const call = (env: Env, method: string, path: string, body?: string) =>
  handle(new Request(`https://example.workers.dev${path}`, { method, body }), env);

test("the limit is the same in the app and the server", () => {
  assert.equal(MAX_BODY_CHARS, MAX_UPLOAD_CHARS);
});

test("save, read back, replace, delete", async () => {
  const env = { BACKUPS: fakeKv() };
  assert.equal((await call(env, "GET", `/backup/${ID}`)).status, 404);

  const put = await call(env, "PUT", `/backup/${ID}`, BODY);
  assert.equal(put.status, 200);

  const got = await call(env, "GET", `/backup/${ID}`);
  assert.equal(got.status, 200);
  assert.equal(await got.text(), BODY);
  assert.match(got.headers.get("x-updated-at") ?? "", /^\d{4}-\d\d-\d\dT/);

  const newer = BODY + "QUJD";
  await call(env, "PUT", `/backup/${ID}`, newer);
  assert.equal(await (await call(env, "GET", `/backup/${ID}`)).text(), newer);
  assert.equal(env.BACKUPS.data.size, 1, "a second backup replaces the first");

  assert.equal((await call(env, "DELETE", `/backup/${ID}`)).status, 200);
  assert.equal((await call(env, "GET", `/backup/${ID}`)).status, 404);
});

test("each id has its own backup", async () => {
  const env = { BACKUPS: fakeKv() };
  const other = "b".repeat(64);
  await call(env, "PUT", `/backup/${ID}`, BODY);
  await call(env, "PUT", `/backup/${other}`, BODY + "QUJD");
  assert.equal(await (await call(env, "GET", `/backup/${ID}`)).text(), BODY);
  await call(env, "DELETE", `/backup/${other}`);
  assert.equal((await call(env, "GET", `/backup/${ID}`)).status, 200);
});

test("ids that are not 64 lowercase hex characters are refused", async () => {
  const env = { BACKUPS: fakeKv() };
  for (const id of ["abc", "A".repeat(64), "g".repeat(64), "a".repeat(63), "a".repeat(65), "../" + "a".repeat(61)]) {
    assert.equal((await call(env, "PUT", `/backup/${id}`, BODY)).status, 404, id);
  }
  assert.equal(env.BACKUPS.data.size, 0);
});

test("bodies that are not a sealed backup are refused", async () => {
  const env = { BACKUPS: fakeKv() };
  for (const body of ["", "hello", "RU1CA", "<script>", "RU1CA not base64!", JSON.stringify({ a: 1 })]) {
    assert.equal((await call(env, "PUT", `/backup/${ID}`, body)).status, 400, body);
  }
  assert.equal(env.BACKUPS.data.size, 0);
});

test("a body over the limit is refused", async () => {
  const env = { BACKUPS: fakeKv() };
  const res = await call(env, "PUT", `/backup/${ID}`, "RU1CA" + "A".repeat(MAX_BODY_CHARS));
  assert.equal(res.status, 413);
  assert.equal(env.BACKUPS.data.size, 0);
});

test("other methods and unknown paths", async () => {
  const env = { BACKUPS: fakeKv() };
  assert.equal((await call(env, "POST", `/backup/${ID}`, BODY)).status, 405);
  assert.equal((await call(env, "GET", "/other")).status, 404);
  assert.equal((await call(env, "GET", "/backup")).status, 404);
  assert.equal((await call(env, "GET", "/")).status, 200);
});

test("browsers may call it (CORS), and nothing is cached", async () => {
  const env = { BACKUPS: fakeKv() };
  const pre = await call(env, "OPTIONS", `/backup/${ID}`);
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get("access-control-allow-origin"), "*");
  assert.match(pre.headers.get("access-control-allow-methods") ?? "", /PUT/);
  const res = await call(env, "GET", `/backup/${ID}`);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.match(res.headers.get("access-control-expose-headers") ?? "", /x-updated-at/);
});
