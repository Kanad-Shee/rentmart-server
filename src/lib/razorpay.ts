import "dotenv/config";
import crypto from "node:crypto";

const RAZORPAY_API_BASE_URL = "https://api.razorpay.com/v1";

type RazorpayNoteValue = string | number | boolean;

type RazorpayTransferInput = {
  account: string;
  amount: number;
  currency: string;
  notes?: Record<string, RazorpayNoteValue>;
  on_hold?: boolean;
  on_hold_until?: number;
};

type RazorpayOrderResponse = {
  id: string;
  entity: "order";
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string | null;
  status: string;
  notes: Record<string, string>;
  created_at: number;
};

type RazorpayTransferResponse = {
  id: string;
  entity: "transfer";
  recipient: string;
  amount: number;
  currency: string;
  status: string;
  on_hold: boolean;
  on_hold_until: number | null;
  created_at: number;
  processed_at: number | null;
};

type RazorpayRefundResponse = {
  id: string;
  entity: "refund";
  amount: number;
  currency: string;
  payment_id: string;
  status: string;
  created_at: number;
};

export class RazorpayApiError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode = 500, code = "RAZORPAY_API_ERROR") {
    super(message);
    this.name = "RazorpayApiError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function getRequiredEnv(name: "RAZORPAY_KEY_ID" | "RAZORPAY_KEY_SECRET" | "RAZORPAY_WEBHOOK_SECRET") {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new RazorpayApiError(
      `${name} is not configured.`,
      500,
      "RAZORPAY_CONFIG_MISSING",
    );
  }

  return value;
}

function getBasicAuthHeader() {
  const keyId = getRequiredEnv("RAZORPAY_KEY_ID");
  const keySecret = getRequiredEnv("RAZORPAY_KEY_SECRET");

  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

async function parseRazorpayResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | { error?: { description?: string; code?: string } }
    | T
    | null;

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      payload.error?.description
        ? payload.error.description
        : "Razorpay request failed.";
    const code =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      payload.error?.code
        ? payload.error.code
        : "RAZORPAY_API_ERROR";

    throw new RazorpayApiError(message, response.status, code);
  }

  if (!payload) {
    throw new RazorpayApiError("Razorpay returned an empty response.");
  }

  return payload as T;
}

async function razorpayRequest<T>(
  path: string,
  init: RequestInit,
): Promise<T> {
  const response = await fetch(`${RAZORPAY_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      authorization: getBasicAuthHeader(),
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  return parseRazorpayResponse<T>(response);
}

export function toPaise(amount: number) {
  return Math.round((amount + Number.EPSILON) * 100);
}

export function verifyRazorpayWebhookSignature(payload: Buffer, signature: string) {
  const digest = crypto
    .createHmac("sha256", getRequiredEnv("RAZORPAY_WEBHOOK_SECRET"))
    .update(payload)
    .digest("hex");

  if (digest.length !== signature.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

export function verifyRazorpayCheckoutSignature(input: {
  orderId: string;
  paymentId: string;
  signature: string;
}) {
  const digest = crypto
    .createHmac("sha256", getRequiredEnv("RAZORPAY_KEY_SECRET"))
    .update(`${input.orderId}|${input.paymentId}`)
    .digest("hex");

  if (digest.length !== input.signature.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(input.signature));
}

export async function createRazorpayOrder(input: {
  amount: number;
  currency?: string;
  receipt: string;
  notes?: Record<string, RazorpayNoteValue>;
}) {
  return razorpayRequest<RazorpayOrderResponse>("/orders", {
    method: "POST",
    body: JSON.stringify({
      amount: input.amount,
      currency: input.currency ?? "INR",
      receipt: input.receipt,
      notes: input.notes,
    }),
  });
}

export async function createRazorpayTransferForPayment(input: {
  paymentId: string;
  transfers: RazorpayTransferInput[];
}) {
  return razorpayRequest<{
    entity: "collection";
    count: number;
    items: RazorpayTransferResponse[];
  }>(`/payments/${input.paymentId}/transfers`, {
    method: "POST",
    body: JSON.stringify({
      transfers: input.transfers,
    }),
  });
}

export async function releaseRazorpayTransfer(transferId: string) {
  return razorpayRequest<RazorpayTransferResponse>(`/transfers/${transferId}`, {
    method: "PATCH",
    body: JSON.stringify({
      on_hold: false,
    }),
  });
}

export async function createRazorpayRefund(input: {
  paymentId: string;
  amount: number;
  notes?: Record<string, RazorpayNoteValue>;
}) {
  return razorpayRequest<RazorpayRefundResponse>(`/payments/${input.paymentId}/refund`, {
    method: "POST",
    body: JSON.stringify({
      amount: input.amount,
      notes: input.notes,
    }),
  });
}

export function getOptionalDefaultLinkedAccountId() {
  return process.env.RAZORPAY_ROUTE_DEFAULT_LINKED_ACCOUNT_ID?.trim() || null;
}

export function getRazorpayKeyId() {
  return getRequiredEnv("RAZORPAY_KEY_ID");
}
