import type { NextFunction, Request, Response } from "express";
import { logger } from "../lib/logger.js";

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }

  if (value && typeof value === "object") {
    const sanitizedEntries = Object.entries(value).map(([key, nestedValue]) => {
      if (
        key.toLowerCase().includes("password") ||
        key.toLowerCase().includes("token") ||
        key.toLowerCase().includes("secret") ||
        key.toLowerCase().includes("otp")
      ) {
        return [key, "[REDACTED]"];
      }

      return [key, sanitizeValue(nestedValue)];
    });

    return Object.fromEntries(sanitizedEntries);
  }

  return value;
}

function sanitizeHeaders(headers: Request["headers"]) {
  const nextHeaders: Record<string, string | string[] | undefined> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (key === "authorization" || key === "cookie") {
      nextHeaders[key] = "[REDACTED]";
      continue;
    }

    nextHeaders[key] = value;
  }

  return nextHeaders;
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const startedAt = Date.now();

  logger.info("[request] incoming", {
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    headers: sanitizeHeaders(req.headers),
    query: sanitizeValue(req.query),
    body: sanitizeValue(req.body),
  });

  res.on("finish", () => {
    logger.info("[request] completed", {
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });

  res.on("close", () => {
    if (!res.writableEnded) {
      logger.warn("[request] aborted", {
        method: req.method,
        path: req.originalUrl,
        durationMs: Date.now() - startedAt,
      });
    }
  });

  next();
}
