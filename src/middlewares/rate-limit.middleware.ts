import type { NextFunction, Request, RequestHandler, Response } from "express";
import { incrementRateLimitCounter } from "../lib/redis.js";

type RateLimitOptions = {
  keyPrefix: string;
  limit: number;
  message: string;
  windowMs: number;
  getIdentifier?: (req: Request) => string;
};

type RateLimitErrorPayload = {
  code: "RATE_LIMIT_EXCEEDED";
  retryAfterSeconds: number;
};

function sendRateLimitError(res: Response, message: string, retryAfterSeconds: number) {
  return res.status(429).json({
    success: false,
    message,
    errors: {
      code: "RATE_LIMIT_EXCEEDED",
      retryAfterSeconds,
    } satisfies RateLimitErrorPayload,
  });
}

function normalizeIdentifier(identifier: string) {
  return identifier.trim().toLowerCase() || "anonymous";
}

export function createRateLimiter(options: RateLimitOptions): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const identifier = normalizeIdentifier(options.getIdentifier?.(req) ?? req.ip ?? "anonymous");
    const key = `${options.keyPrefix}:${identifier}`;
    const result = await incrementRateLimitCounter(key, options.windowMs);

    res.setHeader("X-RateLimit-Limit", String(options.limit));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(options.limit - result.count, 0)));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(Date.now() / 1000) + result.ttlSeconds));

    if (result.count > options.limit) {
      res.setHeader("Retry-After", String(result.ttlSeconds));
      return sendRateLimitError(res, options.message, result.ttlSeconds);
    }

    return next();
  };
}
