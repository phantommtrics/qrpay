import axios, { type AxiosInstance } from "axios";

import {
  digitalOceanApiBaseUrl,
  digitalOceanToken,
  isDigitalOceanBillingConfigured,
} from "../config/digitalocean-env.js";
import { HttpError } from "../lib/http-error.js";

function doErrorMessageFromResponseData(data: unknown): string {
  if (data == null) {
    return "Empty response body.";
  }
  if (typeof data === "string") {
    return data.slice(0, 500);
  }
  if (typeof data === "object") {
    const o = data as Record<string, unknown>;
    for (const key of ["message", "error", "detail", "description"] as const) {
      const v = o[key];
      if (typeof v === "string" && v.trim()) {
        return v.trim().slice(0, 500);
      }
    }
  }
  try {
    return JSON.stringify(data).slice(0, 500);
  } catch {
    return "Unparseable error body.";
  }
}

function rethrowDigitalOceanAxiosError(error: unknown, context: string): never {
  if (axios.isAxiosError(error) && error.response) {
    const status = error.response.status;
    const doMsg = doErrorMessageFromResponseData(error.response.data);
    const suffix = doMsg ? `: ${doMsg}` : "";
    if (status === 401 || status === 403) {
      throw new HttpError(
        502,
        `${context}: DigitalOcean API rejected credentials (${status})${suffix}`,
      );
    }
    if (status === 404) {
      throw new HttpError(404, `${context}: DigitalOcean invoice was not found.`);
    }
    if (status >= 400 && status < 500) {
      throw new HttpError(502, `${context}: DigitalOcean API request rejected (${status})${suffix}`);
    }
    throw new HttpError(502, `${context}: DigitalOcean API error (${status})${suffix}`);
  }
  if (axios.isAxiosError(error)) {
    const code = error.code ? String(error.code) : "";
    const hint = code ? ` (${code})` : "";
    throw new HttpError(
      503,
      `${context}: Cannot reach DigitalOcean API${hint}. ${error.message || "Network error"}`,
    );
  }
  throw error;
}

export type DigitalOceanBalance = {
  account_balance: string;
  month_to_date_balance: string;
  month_to_date_usage: string;
  generated_at: string;
};

export type DigitalOceanInvoiceListItem = {
  invoice_uuid: string;
  invoice_id: string;
  amount: string;
  invoice_period: string;
  updated_at?: string;
};

export type DigitalOceanInvoiceListResponse = {
  invoices: DigitalOceanInvoiceListItem[];
  invoice_preview?: DigitalOceanInvoiceListItem | null;
};

export type DigitalOceanBillingHistoryItem = {
  amount: string;
  date: string;
  description: string;
  invoice_id?: string | null;
  invoice_uuid?: string | null;
  type: string;
};

export type DigitalOceanProductChargeItem = {
  amount: string;
  count?: string;
  name: string;
};

export type DigitalOceanAmountName = {
  amount?: string;
  name?: string;
  items?: DigitalOceanProductChargeItem[];
};

export type DigitalOceanInvoiceSummary = {
  amount: string;
  billing_period: string;
  invoice_id: string;
  invoice_uuid: string;
  product_charges?: DigitalOceanAmountName | null;
  taxes?: DigitalOceanAmountName | null;
  credits_and_adjustments?: DigitalOceanAmountName | null;
  overages?: DigitalOceanAmountName | null;
};

export type DigitalOceanInvoiceItem = {
  amount: string;
  description?: string;
  duration?: string;
  duration_unit?: string;
  end_time?: string;
  group_description?: string;
  product?: string;
  project_name?: string;
  resource_id?: string;
  resource_uuid?: string;
  start_time?: string;
};

function createClient(): AxiosInstance {
  return axios.create({
    baseURL: digitalOceanApiBaseUrl(),
    timeout: 30_000,
    headers: {
      Authorization: `Bearer ${digitalOceanToken()}`,
      Accept: "application/json",
    },
  });
}

export function assertDigitalOceanBillingConfigured(): void {
  if (!isDigitalOceanBillingConfigured()) {
    throw new HttpError(
      503,
      "DigitalOcean billing is not configured (set DIGITALOCEAN_TOKEN with billing:read scope).",
    );
  }
}

export async function fetchDigitalOceanBalance(): Promise<DigitalOceanBalance> {
  assertDigitalOceanBillingConfigured();
  const client = createClient();
  try {
    const res = await client.get<DigitalOceanBalance>("/v2/customers/my/balance");
    return res.data;
  } catch (e) {
    rethrowDigitalOceanAxiosError(e, "Get customer balance");
  }
}

async function paginateCollection<T>(
  client: AxiosInstance,
  path: string,
  key: string,
): Promise<T[]> {
  const all: T[] = [];
  let page = 1;
  for (;;) {
    const res = await client.get<Record<string, unknown>>(path, {
      params: { per_page: 100, page },
    });
    const batch = Array.isArray(res.data[key]) ? (res.data[key] as T[]) : [];
    all.push(...batch);
    if (batch.length < 100) {
      break;
    }
    page += 1;
    if (page > 50) {
      break;
    }
  }
  return all;
}

export async function fetchDigitalOceanInvoiceList(): Promise<DigitalOceanInvoiceListResponse> {
  assertDigitalOceanBillingConfigured();
  const client = createClient();
  try {
    const first = await client.get<DigitalOceanInvoiceListResponse>("/v2/customers/my/invoices", {
      params: { per_page: 100, page: 1 },
    });
    const invoices = [...(first.data.invoices ?? [])];
    let page = 2;
    let lastCount = first.data.invoices?.length ?? 0;
    while (lastCount === 100 && page <= 50) {
      const next = await client.get<DigitalOceanInvoiceListResponse>("/v2/customers/my/invoices", {
        params: { per_page: 100, page },
      });
      const batch = next.data.invoices ?? [];
      invoices.push(...batch);
      lastCount = batch.length;
      page += 1;
    }
    return {
      invoices,
      invoice_preview: first.data.invoice_preview ?? null,
    };
  } catch (e) {
    rethrowDigitalOceanAxiosError(e, "List invoices");
  }
}

export async function fetchDigitalOceanBillingHistory(): Promise<DigitalOceanBillingHistoryItem[]> {
  assertDigitalOceanBillingConfigured();
  const client = createClient();
  try {
    return await paginateCollection<DigitalOceanBillingHistoryItem>(
      client,
      "/v2/customers/my/billing_history",
      "billing_history",
    );
  } catch (e) {
    rethrowDigitalOceanAxiosError(e, "List billing history");
  }
}

export async function fetchDigitalOceanInvoiceSummary(
  invoiceUuid: string,
): Promise<DigitalOceanInvoiceSummary> {
  assertDigitalOceanBillingConfigured();
  const client = createClient();
  try {
    const res = await client.get<DigitalOceanInvoiceSummary>(
      `/v2/customers/my/invoices/${encodeURIComponent(invoiceUuid)}/summary`,
    );
    return res.data;
  } catch (e) {
    rethrowDigitalOceanAxiosError(e, "Retrieve invoice summary");
  }
}

export async function fetchDigitalOceanInvoiceItems(
  invoiceUuid: string,
): Promise<DigitalOceanInvoiceItem[]> {
  assertDigitalOceanBillingConfigured();
  const client = createClient();
  try {
    return await paginateCollection<DigitalOceanInvoiceItem>(
      client,
      `/v2/customers/my/invoices/${encodeURIComponent(invoiceUuid)}`,
      "invoice_items",
    );
  } catch (e) {
    rethrowDigitalOceanAxiosError(e, "Retrieve invoice items");
  }
}

export async function fetchDigitalOceanInvoicePdf(invoiceUuid: string): Promise<Buffer> {
  assertDigitalOceanBillingConfigured();
  const client = createClient();
  try {
    const res = await client.get<ArrayBuffer>(
      `/v2/customers/my/invoices/${encodeURIComponent(invoiceUuid)}/pdf`,
      {
        responseType: "arraybuffer",
        headers: { Accept: "application/pdf" },
      },
    );
    return Buffer.from(res.data);
  } catch (e) {
    rethrowDigitalOceanAxiosError(e, "Retrieve invoice PDF");
  }
}
