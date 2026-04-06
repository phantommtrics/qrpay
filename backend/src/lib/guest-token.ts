import { randomBytes } from "node:crypto";

/** URL-safe token for guest quotation / invoice links. */
export function newGuestToken(): string {
  return randomBytes(24).toString("base64url");
}
