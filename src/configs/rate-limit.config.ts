import type { Request } from "express";

export const AUTH_RATE_LIMITS = {
  signup: {
    keyPrefix: "rate:auth:signup",
    limit: 5,
    message: "Too many sign up attempts. Please try again later.",
    windowMs: 15 * 60 * 1000,
  },
  signin: {
    keyPrefix: "rate:auth:signin",
    limit: 10,
    message: "Too many sign in attempts. Please try again later.",
    windowMs: 15 * 60 * 1000,
  },
  verifyOtp: {
    keyPrefix: "rate:auth:verify-otp",
    limit: 5,
    message: "Too many OTP attempts. Please try again later.",
    windowMs: 10 * 60 * 1000,
  },
  resendOtp: {
    keyPrefix: "rate:auth:resend-otp",
    limit: 3,
    message: "Too many OTP resend attempts. Please try again later.",
    windowMs: 10 * 60 * 1000,
  },
} as const;

function normalizeRateLimitKey(value: string) {
  return value.trim().toLowerCase();
}

export function getIpRateLimitKey(req: Request) {
  return normalizeRateLimitKey(req.ip || "anonymous");
}

export function getBodyEmailRateLimitKey(req: Request) {
  const bodyEmail = typeof req.body?.email === "string" ? req.body.email : null;
  const userEmail = typeof req.user?.email === "string" ? req.user.email : null;
  const identifier = bodyEmail ?? userEmail ?? req.ip ?? "anonymous";

  return normalizeRateLimitKey(identifier);
}
