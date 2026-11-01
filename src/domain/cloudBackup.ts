// Cloud backup, the parts that need no phone or network: the recovery code, the keys derived from it, and the
// sealed (compressed + encrypted) backup that is sent to the server.
//
// One random secret per owner is the whole identity. It is shown as a "recovery code" (nothing in it says who the
// owner is). Two things are derived from it and they cannot be turned back into the secret:
//   - the backup id: the name the server files the backup under, so a later backup finds and replaces the same one;
//   - the key that encrypts the backup on the phone, so the server only ever holds bytes it cannot read.
// Nobody who sees the server (or the backup id) can tell whose backup it is, and anyone without the code cannot read it.

import { gcm } from "@noble/ciphers/aes.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, concatBytes } from "@noble/hashes/utils.js";
import { gunzipSync, gzipSync, strFromU8, strToU8 } from "fflate";

export class CloudBackupError extends Error {}

// Random bytes are always passed in (from expo-crypto's getRandomBytesAsync on the phone; its synchronous version falls back
// to Math.random in development builds), so this file needs no platform and also runs under Node tests.
export const SECRET_BYTES = 20; // 160 bits: cannot be guessed
export const NONCE_BYTES = 12;
const CHECK_BYTES = 1;

// The server refuses anything bigger than this many characters of base64 (about 7.5 MB of sealed data). The same number
// is in server/src/worker.ts.
export const MAX_UPLOAD_CHARS = 10_000_000;

// ---- recovery code -------------------------------------------------------------------------------------------

// Crockford base32: no I, L, O or U, so a code read from paper or typed on a phone is hard to get wrong.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_CHARS = Math.ceil(((SECRET_BYTES + CHECK_BYTES) * 8) / 5); // 34

const checkByte = (secret: Uint8Array): number => sha256(concatBytes(strToU8("expense-manager recovery code check"), secret))[0];

function toBase32(bytes: Uint8Array): string {
  let out = "";
  let bits = 0;
  let acc = 0;
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(acc >> (bits - 5)) & 31];
      bits -= 5;
    }
    acc &= (1 << bits) - 1;
  }
  if (bits > 0) out += ALPHABET[(acc << (5 - bits)) & 31];
  return out;
}

// Returns null when a character is not part of the alphabet or the padding bits are not zero.
function fromBase32(text: string): Uint8Array | null {
  const out: number[] = [];
  let bits = 0;
  let acc = 0;
  for (const ch of text) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) return null;
    acc = (acc << 5) | v;
    bits += 5;
    if (bits >= 8) {
      out.push((acc >> (bits - 8)) & 255);
      bits -= 8;
    }
    acc &= (1 << bits) - 1;
  }
  return acc === 0 ? Uint8Array.from(out) : null;
}

const group = (chars: string): string => chars.match(/.{1,4}/g)!.join("-");

// The code the owner writes down: 4-character groups, the last two characters being a check so a typo is noticed.
export function encodeRecoveryCode(secret: Uint8Array): string {
  if (secret.length !== SECRET_BYTES) throw new CloudBackupError("The secret has the wrong length.");
  return group(toBase32(concatBytes(secret, Uint8Array.of(checkByte(secret)))));
}

// What the owner typed back: spaces, hyphens and case do not matter, and O/I/L are read as 0/1/1.
export function parseRecoveryCode(text: string): Uint8Array {
  const chars = text.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  if (chars.length < CODE_CHARS) throw new CloudBackupError("The recovery code is too short. Enter all of it.");
  if (chars.length > CODE_CHARS) throw new CloudBackupError("The recovery code is too long.");
  const bytes = fromBase32(chars);
  if (!bytes || bytes.length !== SECRET_BYTES + CHECK_BYTES) throw new CloudBackupError("That is not a valid recovery code. Check for a typing mistake.");
  const secret = bytes.slice(0, SECRET_BYTES);
  if (bytes[SECRET_BYTES] !== checkByte(secret)) throw new CloudBackupError("That recovery code has a typing mistake. Check each character.");
  return secret;
}

// The code in its standard layout, so what is saved and shown is always written the same way.
export const normalizeRecoveryCode = (text: string): string => encodeRecoveryCode(parseRecoveryCode(text));

// ---- keys ----------------------------------------------------------------------------------------------------

export interface CloudKeys {
  id: string; // 64 hex characters: the name of the backup on the server
  key: Uint8Array; // 32 bytes: encrypts the backup
}

const derive = (secret: Uint8Array, purpose: string): Uint8Array => hkdf(sha256, secret, undefined, strToU8(`expense-manager ${purpose} v1`), 32);

export function deriveKeys(secret: Uint8Array): CloudKeys {
  return { id: bytesToHex(derive(secret, "backup id")), key: derive(secret, "backup key") };
}

// A short fingerprint of a backup's content, kept on the phone to see whether anything changed since the last upload. It
// is keyed, so it says nothing about the content to anyone who finds it.
export const contentFingerprint = (keys: CloudKeys, csv: string): string => bytesToHex(sha256(concatBytes(keys.key, strToU8(csv))));

// ---- sealing -------------------------------------------------------------------------------------------------

// "EMB" and a format number. Bound into the encryption as associated data, so it cannot be swapped.
const HEADER = Uint8Array.of(0x45, 0x4d, 0x42, 0x01);
const TAG_BYTES = 16;

// Compresses first (encrypted data cannot be compressed afterwards), then encrypts with AES-256-GCM. The nonce must be
// NONCE_BYTES fresh random bytes for every backup.
export function sealBackup(csv: string, keys: CloudKeys, nonce: Uint8Array): Uint8Array {
  if (nonce.length !== NONCE_BYTES) throw new CloudBackupError("The nonce has the wrong length.");
  const sealed = gcm(keys.key, nonce, HEADER).encrypt(gzipSync(strToU8(csv)));
  return concatBytes(HEADER, nonce, sealed);
}

export function openBackup(data: Uint8Array, keys: CloudKeys): string {
  const minimum = HEADER.length + NONCE_BYTES + TAG_BYTES;
  if (data.length < minimum || HEADER.some((b, i) => data[i] !== b)) {
    throw new CloudBackupError("The cloud copy is not in a format this app understands.");
  }
  try {
    const nonce = data.slice(HEADER.length, HEADER.length + NONCE_BYTES);
    const plain = gcm(keys.key, nonce, HEADER).decrypt(data.slice(HEADER.length + NONCE_BYTES));
    return strFromU8(gunzipSync(plain));
  } catch {
    throw new CloudBackupError("The cloud copy could not be opened. It may be damaged, or it was not made with this recovery code.");
  }
}

// ---- base64 (the request body is text) -----------------------------------------------------------------------

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function toBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    parts.push(
      B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : "=") + (i + 2 < bytes.length ? B64[n & 63] : "="),
    );
  }
  return parts.join("");
}

export function fromBase64(text: string): Uint8Array {
  const clean = text.replace(/\s/g, "");
  if (clean.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) throw new CloudBackupError("The cloud copy is damaged.");
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  const out = new Uint8Array((clean.length / 4) * 3 - padding);
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      (B64.indexOf(clean[i]) << 18) | (B64.indexOf(clean[i + 1]) << 12) | ((B64.indexOf(clean[i + 2]) & 63) << 6) | (B64.indexOf(clean[i + 3]) & 63);
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

// What goes over the wire for a backup: sealed, then base64.
export function toUploadBody(csv: string, keys: CloudKeys, nonce: Uint8Array): string {
  const body = toBase64(sealBackup(csv, keys, nonce));
  if (body.length > MAX_UPLOAD_CHARS) {
    const mb = (body.length / 1_000_000).toFixed(1);
    throw new CloudBackupError(`This backup is ${mb} MB, too large for cloud backup. Use Export data to save it as a file instead.`);
  }
  return body;
}

export const fromUploadBody = (body: string, keys: CloudKeys): string => openBackup(fromBase64(body), keys);
