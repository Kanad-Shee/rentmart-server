import { logger } from "./logger.js";

type LogLevel = "error" | "warn";

type ErrorLogInput = {
  service: string;
  action: string;
  error: unknown;
  context?: Record<string, unknown>;
  level?: LogLevel;
};

function toErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    name: "UnknownError",
    message: String(error),
    stack: undefined,
  };
}

export function logServiceError({
  service,
  action,
  error,
  context,
  level = "error",
}: ErrorLogInput) {
  const payload = {
    service,
    action,
    ...toErrorDetails(error),
    context: context ?? {},
    timestamp: new Date().toISOString(),
  };

  if (level === "warn") {
    logger.warn("[service-error]", payload);
    return;
  }

  logger.error("[service-error]", payload);
}
