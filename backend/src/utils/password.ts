import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SALT_LENGTH = 16;
const KEY_LENGTH = 64;

export function hashPassword(password: string) {
  const normalizedPassword = password.trim();

  if (!normalizedPassword) {
    throw new Error("Password cannot be empty.");
  }

  const salt = randomBytes(SALT_LENGTH).toString("hex");
  const hash = scryptSync(normalizedPassword, salt, KEY_LENGTH).toString("hex");

  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedPasswordHash: string) {
  const [salt, hash] = storedPasswordHash.split(":");

  if (!salt || !hash) {
    return false;
  }

  const candidateHash = scryptSync(password.trim(), salt, KEY_LENGTH);
  const expectedHash = Buffer.from(hash, "hex");

  if (candidateHash.length !== expectedHash.length) {
    return false;
  }

  return timingSafeEqual(candidateHash, expectedHash);
}
