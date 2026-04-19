import "dotenv/config";
import { z } from "zod";

function parseCorsOrigins(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z
    .string()
    .min(1, "Set JWT_SECRET in your environment (never commit real values)"),
  JWT_EXPIRES_IN: z.string().min(1).default("24h"),
  CORS_ORIGINS: z
    .string()
    .min(1, "Set CORS_ORIGINS to a comma-separated list of allowed browser origins"),
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_FROM_EMAIL: z.string().min(1).optional(),
  PLATFORM_URL: z
    .string()
    .url()
    .min(1, "Set PLATFORM_URL in your environment (used in emails, e.g. app login link)"),
  /** Optional override for the logo image URL in HTML emails (defaults to PLATFORM_URL/easypay_logo_file.jpeg). */
  EASYPAY_LOGO_URL: z.string().url().optional(),
  /**
   * Comma-separated inbox(es) for internal alerts when a Corporate industry business is created.
   * Example: owner@phantommetrics.gm — assign billing template under Platform → Corporate → Businesses.
   */
  CORPORATE_SIGNUP_NOTIFY_EMAIL: z.string().optional(),
  /**
   * Absolute path for on-disk uploads (product images under …/products).
   * Default: `uploads/` next to compiled `dist/` (may be read-only in some hosts — set this on production).
   */
  UPLOADS_DIR: z.string().optional(),
});

const parsed = envSchema.parse(process.env);

const corsOrigins = parseCorsOrigins(parsed.CORS_ORIGINS);
if (corsOrigins.length === 0) {
  throw new Error("CORS_ORIGINS must contain at least one origin after parsing");
}

for (const origin of corsOrigins) {
  try {
    new URL(origin);
  } catch {
    throw new Error(`Invalid CORS origin (must be absolute URL): ${origin}`);
  }
}

export const env = {
  ...parsed,
  corsOrigins,
};
