import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

import { internalPartnerApiSecret } from "../config/internal-partner-env.js";
import { HttpError } from "../lib/http-error.js";

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

/**
 * Authenticates the internal partner backend via `Authorization: Bearer <INTERNAL_PARTNER_API_SECRET>`.
 */
export function requireInternalPartnerApiSecret(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    const expected = internalPartnerApiSecret();
    if (!expected) {
      throw new HttpError(503, "Internal partner API is not configured (INTERNAL_PARTNER_API_SECRET).");
    }
    const raw = (req.headers.authorization || "").trim();
    const token = raw.toLowerCase().startsWith("bearer ") ? raw.slice(7).trim() : "";
    if (!token || !timingSafeEqualString(expected, token)) {
      throw new HttpError(401, "Invalid or missing partner authorization.");
    }
    next();
  } catch (e) {
    next(e);
  }
}
