import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

import { internalPartnerApiSecrets } from "../config/internal-partner-env.js";
import { HttpError } from "../lib/http-error.js";

/** When proxies strip `Authorization`, partners may send the same secret in this header (no `Bearer` prefix). */
const ALT_AUTH_HEADER = "x-easypay-internal-partner-secret";

function timingSafeEqualString(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ba.length !== bb.length) {
      return false;
    }
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function headerString(req: Request, name: string): string {
  const v = req.headers[name];
  if (typeof v === "string") {
    return v;
  }
  if (Array.isArray(v) && v.length > 0) {
    return v[0] ?? "";
  }
  return "";
}

/**
 * Accepts `Authorization: Bearer <secret>`, a raw `Authorization: <secret>` (not Basic/Digest),
 * or `X-Easypay-Internal-Partner-Secret: <secret>` when Authorization is missing or empty.
 */
function extractInternalPartnerToken(req: Request): string {
  const auth = headerString(req, "authorization").trim();
  if (auth) {
    const bearer = /^Bearer\s+(.*)$/is.exec(auth);
    if (bearer?.[1]) {
      return bearer[1].trim();
    }
    const lower = auth.toLowerCase();
    if (lower.startsWith("basic ") || lower.startsWith("digest ")) {
      return "";
    }
    return auth;
  }
  return headerString(req, ALT_AUTH_HEADER).trim();
}

function tokenMatchesAnySecret(token: string, secrets: readonly string[]): boolean {
  if (!token) {
    return false;
  }
  return secrets.some((expected) => timingSafeEqualString(expected, token));
}

/**
 * Authenticates the internal partner backend. Configure one or more secrets in INTERNAL_PARTNER_API_SECRET
 * (comma-separated). Send `Authorization: Bearer <secret>`, or the same secret without the Bearer prefix,
 * or header `X-Easypay-Internal-Partner-Secret: <secret>`.
 */
export function requireInternalPartnerApiSecret(req: Request, _res: Response, next: NextFunction) {
  try {
    const secrets = internalPartnerApiSecrets();
    if (!secrets?.length) {
      throw new HttpError(503, "Internal partner API is not configured (INTERNAL_PARTNER_API_SECRET).");
    }
    const token = extractInternalPartnerToken(req);
    if (!tokenMatchesAnySecret(token, secrets)) {
      throw new HttpError(
        401,
        "Invalid or missing partner authorization. Use the INTERNAL_PARTNER_API_SECRET value (not the webhook HMAC secret): Authorization: Bearer <secret>, or header X-Easypay-Internal-Partner-Secret: <secret>.",
      );
    }
    next();
  } catch (e) {
    next(e);
  }
}
