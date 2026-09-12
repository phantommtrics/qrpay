/**
 * Deskline (pro-ticketing) API client — adapted from vpay ticketing client.
 * Auth: X-Api-Key. Base URL must end with `/api`.
 */

import { env } from "../../config/env.js";

export type TicketingConfig = {
  baseUrl: string;
  apiKey: string;
  configured: boolean;
};

export type TicketingComment = {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
};

export type TicketingStatusEvent = {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  note: string | null;
  actorName: string | null;
  createdAt: string;
};

export type TicketingTicket = {
  id: string;
  ref: string;
  summary: string;
  description: string | null;
  status: string;
  comments: TicketingComment[];
  statusEvents: TicketingStatusEvent[];
};

export class TicketingError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = "TicketingError";
  }
}

export function getTicketingConfig(): TicketingConfig {
  const raw = (env.TICKETING_API_BASE_URL || "").replace(/\/$/, "");
  const baseUrl = raw && !raw.endsWith("/api") ? `${raw}/api` : raw;
  const apiKey = (env.TICKETING_API_KEY || "").trim();
  return {
    baseUrl,
    apiKey,
    configured: Boolean(baseUrl && apiKey),
  };
}

function ticketingMessage(json: Record<string, unknown>, fallback: string): string {
  const message = json.message;
  if (typeof message === "string" && message.trim()) return message;
  if (Array.isArray(message)) {
    const first = message.find((item) => typeof item === "string" && item.trim());
    if (typeof first === "string") return first;
  }
  if (typeof json.error === "string" && json.error.trim()) return json.error;
  return fallback;
}

async function ticketingJson<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const { baseUrl, apiKey, configured } = getTicketingConfig();
  if (!configured) {
    throw new TicketingError(
      "Settlement requests are temporarily unavailable.",
      503,
      "TICKETING_NOT_CONFIGURED",
    );
  }

  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  const method = init.method || "GET";
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Api-Key": apiKey,
  };
  let body: string | undefined;
  if (init.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.body);
  }

  let res: Response;
  try {
    res = await fetch(url, { method, headers, body });
  } catch (error) {
    console.error("[ticketing] request failed", {
      method,
      path,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TicketingError(
      "Could not reach support right now. Try again shortly.",
      503,
      "TICKETING_UNREACHABLE",
    );
  }

  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = {};
  }

  if (!res.ok) {
    console.error("[ticketing] API error", { method, path, status: res.status });
    const userMessage =
      res.status === 401 || res.status === 403
        ? "Settlement requests are temporarily unavailable."
        : ticketingMessage(json, "Could not submit your request. Try again shortly.");
    throw new TicketingError(
      userMessage,
      res.status >= 500 ? 503 : res.status === 401 || res.status === 403 ? 503 : res.status,
      res.status === 401 || res.status === 403 ? "TICKETING_UNAUTHORIZED" : "TICKETING_ERROR",
    );
  }

  return json as T;
}

function parseIsoDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function parseComments(raw: unknown): TicketingComment[] {
  if (!Array.isArray(raw)) return [];
  const comments: TicketingComment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (row.isInternal === true) continue;
    if (typeof row.id !== "string" || typeof row.body !== "string" || !row.body.trim()) {
      continue;
    }
    const author =
      row.author && typeof row.author === "object"
        ? (row.author as Record<string, unknown>)
        : null;
    const authorName =
      typeof author?.name === "string" && author.name.trim() ? author.name.trim() : "Support";
    comments.push({
      id: row.id,
      body: row.body.trim(),
      authorName,
      createdAt: parseIsoDate(row.createdAt) ?? new Date(0).toISOString(),
    });
  }
  return comments;
}

function parseStatusEvents(raw: unknown): TicketingStatusEvent[] {
  if (!Array.isArray(raw)) return [];
  const events: TicketingStatusEvent[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.toStatus !== "string") continue;
    const actor =
      row.actor && typeof row.actor === "object" ? (row.actor as Record<string, unknown>) : null;
    const actorName =
      typeof actor?.name === "string" && actor.name.trim() ? actor.name.trim() : null;
    events.push({
      id: row.id,
      fromStatus: typeof row.fromStatus === "string" ? row.fromStatus : null,
      toStatus: row.toStatus,
      note: typeof row.note === "string" && row.note.trim() ? row.note.trim() : null,
      actorName,
      createdAt: parseIsoDate(row.createdAt) ?? new Date(0).toISOString(),
    });
  }
  return events;
}

function parseTicket(raw: Record<string, unknown>, fallbackSummary = ""): TicketingTicket | null {
  if (typeof raw.id !== "string" || typeof raw.ref !== "string") return null;
  return {
    id: raw.id,
    ref: raw.ref,
    summary: typeof raw.summary === "string" ? raw.summary : fallbackSummary,
    description: typeof raw.description === "string" ? raw.description : null,
    status: typeof raw.status === "string" ? raw.status : "NEW",
    comments: parseComments(raw.comments),
    statusEvents: parseStatusEvents(raw.statusEvents),
  };
}

export async function createTicketingTicket(input: {
  summary: string;
  description: string;
  type: "REQUEST" | "INCIDENT";
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
}): Promise<TicketingTicket> {
  const created = await ticketingJson<Record<string, unknown>>("/v1/tickets", {
    method: "POST",
    body: {
      summary: input.summary,
      description: input.description,
      type: input.type,
      priority: input.priority ?? "MEDIUM",
    },
  });

  const ticket = parseTicket(created, input.summary);
  if (!ticket) {
    throw new TicketingError("Support did not return a ticket number.", 502, "TICKETING_INVALID");
  }
  return ticket;
}

export async function getTicketingTicket(id: string): Promise<TicketingTicket | null> {
  try {
    const raw = await ticketingJson<Record<string, unknown>>(
      `/v1/tickets/${encodeURIComponent(id)}`,
    );
    return parseTicket(raw);
  } catch (error) {
    if (error instanceof TicketingError && error.code === "TICKETING_NOT_CONFIGURED") {
      throw error;
    }
    return null;
  }
}
