import crypto from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 16;
const AUTH_TAG_LEN = 16;
const KEY_BYTES = 32;

function encryptionKeyBytes(): Buffer {
  const raw = process.env.APP_SECRET_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error("APP_SECRET_ENCRYPTION_KEY is not set (32-byte key, base64-encoded).");
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== KEY_BYTES) {
    throw new Error(
      `APP_SECRET_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes; got ${buf.length}.`,
    );
  }
  return buf;
}

export function encryptJsonPayload(payload: unknown): { iv: string; ciphertext: string } {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, encryptionKeyBytes(), iv, { authTagLength: AUTH_TAG_LEN });
  const json = JSON.stringify(payload);
  const enc = Buffer.concat([cipher.update(json, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    ciphertext: Buffer.concat([enc, tag]).toString("base64"),
  };
}

export function decryptJsonPayload<T>(ivB64: string, ciphertextB64: string): T {
  const iv = Buffer.from(ivB64, "base64");
  const combined = Buffer.from(ciphertextB64, "base64");
  if (combined.length < AUTH_TAG_LEN) {
    throw new Error("Invalid ciphertext.");
  }
  const tag = combined.subarray(combined.length - AUTH_TAG_LEN);
  const enc = combined.subarray(0, combined.length - AUTH_TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, encryptionKeyBytes(), iv, {
    authTagLength: AUTH_TAG_LEN,
  });
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return JSON.parse(dec.toString("utf8")) as T;
}
