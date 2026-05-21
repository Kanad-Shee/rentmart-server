import "dotenv/config";
import crypto from "node:crypto";

const CASHFREE_API_VERSION = process.env.CASHFREE_API_VERSION?.trim() || "2023-08-01";

type CashfreeEnvironment = "sandbox" | "production";

type CashfreeOrderResponse = {
  cf_order_id: string;
  order_id: string;
  order_amount: number;
  order_currency: string;
  order_status: "ACTIVE" | "PAID" | "EXPIRED" | "TERMINATED" | "TERMINATION_REQUESTED";
  payment_session_id: string;
  created_at: string;
};

type CashfreeOrderPayment = {
  cf_payment_id: string;
  order_id: string;
  payment_amount: number;
  payment_currency: string;
  payment_status: string;
  payment_message: string | null;
};

export class CashfreeApiError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode = 500, code = "CASHFREE_API_ERROR") {
    super(message);
    this.name = "CashfreeApiError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function getCashfreeEnvironment(): CashfreeEnvironment {
  const value = process.env.CASHFREE_ENVIRONMENT?.trim().toLowerCase();

  if (value === "production") {
    return "production";
  }

  if (value === "sandbox") {
    return "sandbox";
  }

  return process.env.NODE_ENV === "production" ? "production" : "sandbox";
}

function getCashfreeBaseUrl() {
  return getCashfreeEnvironment() === "production"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";
}

function getRequiredEnv(name: "CASHFREE_APP_ID" | "CASHFREE_SECRET_KEY") {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new CashfreeApiError(
      `${name} is not configured.`,
      500,
      "CASHFREE_CONFIG_MISSING",
    );
  }

  return value;
}

function buildHeaders(extraHeaders?: Record<string, string>) {
  return {
    "content-type": "application/json",
    "x-api-version": CASHFREE_API_VERSION,
    "x-client-id": getRequiredEnv("CASHFREE_APP_ID"),
    "x-client-secret": getRequiredEnv("CASHFREE_SECRET_KEY"),
    ...(extraHeaders ?? {}),
  };
}

async function parseCashfreeResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | { message?: string; code?: string; type?: string }
    | T
    | null;

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string"
        ? payload.message
        : "Cashfree request failed.";
    const code =
      payload && typeof payload === "object" && "code" in payload && typeof payload.code === "string"
        ? payload.code
        : "CASHFREE_API_ERROR";

    throw new CashfreeApiError(message, response.status, code);
  }

  if (!payload) {
    throw new CashfreeApiError("Cashfree returned an empty response.");
  }

  return payload as T;
}

async function cashfreeRequest<T>(
  path: string,
  init: RequestInit,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const response = await fetch(`${getCashfreeBaseUrl()}${path}`, {
    ...init,
    headers: buildHeaders(extraHeaders),
  });

  return parseCashfreeResponse<T>(response);
}

export function toPaise(amount: number) {
  return Math.round((amount + Number.EPSILON) * 100);
}

export function verifyCashfreeWebhookSignature(
  payload: Buffer,
  signature: string,
  timestamp: string,
) {
  const signedPayload = `${timestamp}${payload.toString("utf8")}`;
  const digest = crypto
    .createHmac("sha256", getRequiredEnv("CASHFREE_SECRET_KEY"))
    .update(signedPayload)
    .digest("base64");

  if (digest.length !== signature.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

export async function createCashfreeOrder(input: {
  orderId: string;
  amount: number;
  currency?: string;
  customer: {
    id: string;
    name: string;
    email: string;
    phone: string;
  };
  note?: string;
  idempotencyKey?: string;
}) {
  return cashfreeRequest<CashfreeOrderResponse>(
    "/orders",
    {
      method: "POST",
      body: JSON.stringify({
        order_id: input.orderId,
        order_amount: input.amount,
        order_currency: input.currency ?? "INR",
        customer_details: {
          customer_id: input.customer.id,
          customer_name: input.customer.name,
          customer_email: input.customer.email,
          customer_phone: input.customer.phone,
        },
        order_note: input.note,
      }),
    },
    input.idempotencyKey ? { "x-idempotency-key": input.idempotencyKey } : undefined,
  );
}

export async function getCashfreeOrder(orderId: string) {
  return cashfreeRequest<CashfreeOrderResponse>(`/orders/${orderId}`, {
    method: "GET",
  });
}

export async function getCashfreePaymentsForOrder(orderId: string) {
  return cashfreeRequest<CashfreeOrderPayment[]>(`/orders/${orderId}/payments`, {
    method: "GET",
  });
}

export function getCashfreeCheckoutEnvironment() {
  return getCashfreeEnvironment();
}
