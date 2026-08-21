import { HttpError } from "../lib/http-error.js";

const DEFAULT_DO_API_BASE = "https://api.digitalocean.com";

/** True when a DigitalOcean billing token is present (server still boots without it). */
export function isDigitalOceanBillingConfigured(): boolean {
  return Boolean((process.env.DIGITALOCEAN_TOKEN || "").trim());
}

export function digitalOceanApiBaseUrl(): string {
  return (process.env.DIGITALOCEAN_API_BASE_URL?.trim() || DEFAULT_DO_API_BASE).replace(/\/+$/, "");
}

export function digitalOceanToken(): string {
  const token = (process.env.DIGITALOCEAN_TOKEN || "").trim();
  if (!token) {
    throw new HttpError(
      503,
      "DigitalOcean billing is not configured (set DIGITALOCEAN_TOKEN with billing:read scope).",
    );
  }
  return token;
}
