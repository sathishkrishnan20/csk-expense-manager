import { test } from "node:test";
import assert from "node:assert/strict";
import { createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { gunzipSync } from "node:zlib";
import {
  CloudBackupError,
  MAX_UPLOAD_CHARS,
  NONCE_BYTES,
  SECRET_BYTES,
  contentFingerprint,
  deriveKeys,
  encodeRecoveryCode,
  fromBase64,
  fromUploadBody,
  normalizeRecoveryCode,
  openBackup,
  parseRecoveryCode,
  sealBackup,
  toBase64,
  toUploadBody,
} from "../../src/domain/cloudBackup";

const bytes = (n: number) => new Uint8Array(randomBytes(n));
const secret = () => bytes(SECRET_BYTES);

test("a recovery code is 34 characters in groups of four, and reads back to the same secret", () => {
  const s = secret();
  const code = encodeRecoveryCode(s);
  assert.match(code, /^([0-9A-HJKMNP-TV-Z]{4}-){8}[0-9A-HJKMNP-TV-Z]{2}$/);
  assert.deepEqual(parseRecoveryCode(code), s);
});

test("many random secrets all survive a round trip", () => {
  for (let i = 0; i < 300; i++) {
    const s = secret();
    assert.deepEqual(parseRecoveryCode(encodeRecoveryCode(s)), s);
  }
});

test("a code can be typed in lower case, with spaces, without hyphens, and with O/I/L for 0/1", () => {
  const s = secret();
  const code = encodeRecoveryCode(s);
  assert.deepEqual(parseRecoveryCode(code.toLowerCase()), s);
  assert.deepEqual(parseRecoveryCode(code.replace(/-/g, " ")), s);
  assert.deepEqual(parseRecoveryCode(code.replace(/-/g, "")), s);
  assert.deepEqual(parseRecoveryCode(code.replace(/0/g, "O").replace(/1/g, "l")), s);
  assert.equal(normalizeRecoveryCode(code.toLowerCase().replace(/-/g, " ")), code);
});

test("a mistyped, short or long code is refused with a reason", () => {
  const code = encodeRecoveryCode(secret());
  const flipped = (code[0] === "A" ? "B" : "A") + code.slice(1);
  assert.throws(() => parseRecoveryCode(flipped), /typing mistake/);
  assert.throws(() => parseRecoveryCode(code.slice(0, 20)), /too short/);
  assert.throws(() => parseRecoveryCode(code + "AAAA"), /too long/);
  assert.throws(() => parseRecoveryCode(code.slice(0, 33) + "U"), CloudBackupError);
  assert.throws(() => parseRecoveryCode(""), /too short/);
});

test("any single changed character is caught", () => {
  const code = encodeRecoveryCode(secret()).replace(/-/g, "");
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let accepted = 0;
  for (let i = 0; i < code.length; i++) {
    for (const ch of alphabet) {
      if (ch === code[i]) continue;
      try {
        parseRecoveryCode(code.slice(0, i) + ch + code.slice(i + 1));
        accepted++;
      } catch {
        // refused, as wanted
      }
    }
  }
  // One check byte cannot catch everything (about 1 change in 256 can slip through), but nearly all must be caught.
  assert.ok(accepted <= 15, `${accepted} of ${code.length * 31} single-character changes were accepted`);
});

test("keys: a 64-character hex id and a 32-byte key, the same every time for one secret, different for another", () => {
  const s = secret();
  const a = deriveKeys(s);
  const b = deriveKeys(s);
  assert.match(a.id, /^[0-9a-f]{64}$/);
  assert.equal(a.key.length, 32);
  assert.equal(a.id, b.id);
  assert.deepEqual(a.key, b.key);

  const other = deriveKeys(secret());
  assert.notEqual(a.id, other.id);
  assert.notDeepEqual(a.key, other.key);
});

test("the id does not reveal the encryption key, and neither is the secret", () => {
  const s = secret();
  const { id, key } = deriveKeys(s);
  assert.notEqual(id, Buffer.from(key).toString("hex"));
  assert.ok(!id.includes(Buffer.from(s).toString("hex")));
});

test("a sealed backup opens with the same keys and returns the exact text", () => {
  const keys = deriveKeys(secret());
  const csv = 'Date,Amount,Description\n2026-10-23,1355.00,"Dikky poori, ₹ and ünïcode 🍽"\n'.repeat(200);
  const sealed = sealBackup(csv, keys, bytes(NONCE_BYTES));
  assert.equal(openBackup(sealed, keys), csv);
  assert.ok(sealed.length < csv.length / 4, "repetitive text should be compressed before it is encrypted");
});

test("an empty backup also round-trips", () => {
  const keys = deriveKeys(secret());
  assert.equal(openBackup(sealBackup("", keys, bytes(NONCE_BYTES)), keys), "");
});

test("the sealed bytes do not contain the plain text", () => {
  const keys = deriveKeys(secret());
  const sealed = Buffer.from(sealBackup("SATHISH KR paid 135500 to Dikky poori", keys, bytes(NONCE_BYTES)));
  assert.ok(!sealed.includes("SATHISH"));
  assert.ok(!sealed.includes("Dikky"));
});

test("the same backup sealed twice with different nonces gives different bytes", () => {
  const keys = deriveKeys(secret());
  const a = sealBackup("same", keys, bytes(NONCE_BYTES));
  const b = sealBackup("same", keys, bytes(NONCE_BYTES));
  assert.notDeepEqual(a, b);
});

test("a backup does not open with another secret's keys", () => {
  const sealed = sealBackup("private", deriveKeys(secret()), bytes(NONCE_BYTES));
  assert.throws(() => openBackup(sealed, deriveKeys(secret())), /could not be opened/);
});

test("a changed byte anywhere is detected, not silently decrypted", () => {
  const keys = deriveKeys(secret());
  const sealed = sealBackup("private ".repeat(50), keys, bytes(NONCE_BYTES));
  for (const at of [0, 3, 4, 10, 16, 17, 30, sealed.length - 1]) {
    const copy = sealed.slice();
    copy[at] ^= 1;
    assert.throws(() => openBackup(copy, keys), CloudBackupError, `byte ${at}`);
  }
  assert.throws(() => openBackup(sealed.slice(0, sealed.length - 1), keys), CloudBackupError);
  assert.throws(() => openBackup(new Uint8Array(5), keys), /not in a format/);
});

test("the nonce must be 12 bytes", () => {
  assert.throws(() => sealBackup("x", deriveKeys(secret()), bytes(8)), /nonce/);
});

test("base64 matches Node's for every length, and reads back", () => {
  for (let n = 0; n < 40; n++) {
    const data = bytes(n);
    const expected = Buffer.from(data).toString("base64");
    assert.equal(toBase64(data), expected, `length ${n}`);
    assert.deepEqual(fromBase64(expected), data, `length ${n}`);
  }
  const big = bytes(100_001);
  assert.deepEqual(fromBase64(toBase64(big)), big);
});

test("damaged base64 is refused", () => {
  assert.throws(() => fromBase64("abc"), CloudBackupError);
  assert.throws(() => fromBase64("ab!d"), CloudBackupError);
});

test("the upload body is text that starts the way the server expects, and opens again", () => {
  const keys = deriveKeys(secret());
  const body = toUploadBody("a,b\n1,2\n", keys, bytes(NONCE_BYTES));
  assert.match(body, /^RU1CA[A-Za-z0-9+/]+={0,2}$/);
  assert.equal(fromUploadBody(body, keys), "a,b\n1,2\n");
});

test("a backup too big for the server is refused before it is sent, with advice", () => {
  const keys = deriveKeys(secret());
  // Random text does not compress, so this stays above the limit after compression.
  const noise = Buffer.from(bytes(8_000_000)).toString("base64");
  assert.ok(noise.length > MAX_UPLOAD_CHARS);
  assert.throws(() => toUploadBody(noise, keys, bytes(NONCE_BYTES)), /too large for cloud backup.*Export data/);
});

test("the fingerprint changes with the content and the secret only", () => {
  const keys = deriveKeys(secret());
  assert.equal(contentFingerprint(keys, "same"), contentFingerprint(keys, "same"));
  assert.notEqual(contentFingerprint(keys, "same"), contentFingerprint(keys, "other"));
  assert.notEqual(contentFingerprint(keys, "same"), contentFingerprint(deriveKeys(secret()), "same"));
});

test("a known secret gives a fixed code, id and key, matching Node's own HKDF (guards against changing the derivation by accident)", () => {
  const s = Uint8Array.from({ length: SECRET_BYTES }, (_, i) => i + 1);
  assert.equal(encodeRecoveryCode(s), "0410-6105-0R3G-G28A-1C60-T3GF-208H-44RM-3R");
  const keys = deriveKeys(s);
  assert.equal(keys.id, "309a51f1d11748f2ddbea771bb2a15d838e22693668b8ea3296eacae48bcf25a");
  assert.equal(Buffer.from(keys.key).toString("hex"), "f6befdebb13ac13184162cbeddb569e5994a80d26efea7153c92ac9516304b94");

  const reference = (purpose: string) => Buffer.from(hkdfSync("sha256", s, Buffer.alloc(0), `expense-manager ${purpose} v1`, 32)).toString("hex");
  assert.equal(keys.id, reference("backup id"));
  assert.equal(Buffer.from(keys.key).toString("hex"), reference("backup key"));
});

test("the encryption is standard AES-256-GCM: Node can open what the app seals", () => {
  const keys = deriveKeys(secret());
  const sealed = Buffer.from(sealBackup("hello world", keys, bytes(NONCE_BYTES)));
  const header = sealed.subarray(0, 4);
  const decipher = createDecipheriv("aes-256-gcm", keys.key, sealed.subarray(4, 16));
  decipher.setAAD(header);
  decipher.setAuthTag(sealed.subarray(sealed.length - 16));
  const plain = Buffer.concat([decipher.update(sealed.subarray(16, sealed.length - 16)), decipher.final()]);
  assert.equal(gunzipSync(plain).toString("utf8"), "hello world");
});
