import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ZodTypeAny } from "zod";

type ValidationSource = "body" | "query" | "params";

function syncValidatedSource(
  req: Request,
  source: ValidationSource,
  data: unknown,
) {
  const target = req[source];

  if (
    target &&
    typeof target === "object" &&
    !Array.isArray(target) &&
    data &&
    typeof data === "object" &&
    !Array.isArray(data)
  ) {
    for (const key of Object.keys(target)) {
      delete (target as Record<string, unknown>)[key];
    }

    Object.assign(target, data);
    return;
  }

  (req as unknown as Record<string, unknown>)[source] = data;
}

export function validateRequest(
  schema: ZodTypeAny,
  source: ValidationSource = "body"
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req[source]);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed.",
        errors: parsed.error.flatten(),
      });
    }

    syncValidatedSource(req, source, parsed.data);
    return next();
  };
}
