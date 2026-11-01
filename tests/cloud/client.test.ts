import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { deleteBackup, downloadBackup, uploadBackup } from "../../src/cloud/client";
import { NONCE_BYTES, SECRET_BYTES, deriveKeys, fromUploadBody, toUploadBody } from "../../src/domain/cloudBackup";
import { handle, type KvLike } from "../../server/src/worker";

const BASE = "https://backup.example.workers.dev";

// A fetch that goes straight into the Worker code with an in-memory store, so the app side and server side are tested together.
function serverFetch() {
  const data = new Map<string, { value: string; metadata: unknown }>();
  const kv: KvLike = {
    get: async (k) => data.get(k)?.value ?? null,
    getWithMetadata: async <M>(k: string) => ({ value: data.get(k)?.value ?? null, metadata: (data.get(k)?.metadata as M | undefined) ?? null }),
    put: async (k, value, options) => void data.set(k, { value, metadata: options?.metadata }),
    delete: async (k) => void data.delete(k),
  };
  const fetchFn = ((url: string, init?: RequestInit) => handle(new Request(url, init), { BACKUPS: kv })) as typeof fetch;
  return { fetchFn, data };
}

const bytes = (n: number) => new Uint8Array(randomBytes(n));

test("back up, back up again (replaces), then restore with the same code on another phone", async () => {
  const { fetchFn, data } = serverFetch();
  const secret = bytes(SECRET_BYTES);
  const phoneA = deriveKeys(secret);

  await uploadBackup(BASE, phoneA.id, toUploadBody("first", phoneA, bytes(NONCE_BYTES)), fetchFn);
  await uploadBackup(BASE, phoneA.id, toUploadBody("second", phoneA, bytes(NONCE_BYTES)), fetchFn);
  assert.equal(data.size, 1, "the second backup found and replaced the first");
  assert.deepEqual([...data.keys()], [phoneA.id]);

  const phoneB = deriveKeys(secret); // another phone, only the code typed in
  const got = await downloadBackup(BASE, phoneB.id, fetchFn);
  assert.ok(got);
  assert.equal(fromUploadBody(got.body, phoneB), "second");
  assert.match(got.updatedAt ?? "", /^\d{4}-/);
});

test("the server never holds the plain text, the secret or the key", async () => {
  const { fetchFn, data } = serverFetch();
  const secret = bytes(SECRET_BYTES);
  const keys = deriveKeys(secret);
  await uploadBackup(BASE, keys.id, toUploadBody("Payee,Amount\nSATHISH KR,1355", keys, bytes(NONCE_BYTES)), fetchFn);

  const [[id, entry]] = [...data];
  const stored = Buffer.from(entry.value, "base64").toString("latin1");
  assert.ok(!stored.includes("SATHISH"));
  assert.ok(!entry.value.includes("SATHISH"));
  assert.ok(!id.includes(Buffer.from(secret).toString("hex")));
  assert.notEqual(id, Buffer.from(keys.key).toString("hex"));
});

test("someone else's code finds nothing", async () => {
  const { fetchFn } = serverFetch();
  const mine = deriveKeys(bytes(SECRET_BYTES));
  await uploadBackup(BASE, mine.id, toUploadBody("mine", mine, bytes(NONCE_BYTES)), fetchFn);
  assert.equal(await downloadBackup(BASE, deriveKeys(bytes(SECRET_BYTES)).id, fetchFn), null);
});

test("deleting removes the copy", async () => {
  const { fetchFn, data } = serverFetch();
  const keys = deriveKeys(bytes(SECRET_BYTES));
  await uploadBackup(BASE, keys.id, toUploadBody("x", keys, bytes(NONCE_BYTES)), fetchFn);
  await deleteBackup(BASE, keys.id, fetchFn);
  assert.equal(data.size, 0);
  assert.equal(await downloadBackup(BASE, keys.id, fetchFn), null);
});

test("errors from the server and the network become readable messages", async () => {
  const status = (code: number, text = "") => (async () => new Response(text, { status: code })) as unknown as typeof fetch;
  const id = "a".repeat(64);
  await assert.rejects(uploadBackup(BASE, id, "x", status(413)), /too large/);
  await assert.rejects(uploadBackup(BASE, id, "x", status(429)), /busy/);
  await assert.rejects(uploadBackup(BASE, id, "x", status(500, "boom")), /error \(500: boom\)/);
  await assert.rejects(downloadBackup(BASE, id, status(503)), /503/);
  await assert.rejects(deleteBackup(BASE, id, status(500)), /500/);
  const offline = (async () => {
    throw new TypeError("Network request failed");
  }) as unknown as typeof fetch;
  await assert.rejects(downloadBackup(BASE, id, offline), /Could not reach the backup server/);
});
