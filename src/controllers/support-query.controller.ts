import type { Request, Response } from "express";
import { logger } from "../lib/logger.js";
import {
  createSupportQuery,
  listSupportQueries,
  resolveSupportQuery,
  SupportQueryServiceError,
} from "../services/support-query.service.js";
import type { CreateSupportQueryInput } from "../validators/support-query.schema.js";

function sendSuccess<T>(res: Response, status: number, message: string, data: T) {
  return res.status(status).json({
    success: true,
    message,
    data,
  });
}

function sendError(res: Response, status: number, message: string, errors?: unknown) {
  return res.status(status).json({
    success: false,
    message,
    ...(errors ? { errors } : {}),
  });
}

function handleSupportQueryError(res: Response, error: unknown) {
  if (error instanceof SupportQueryServiceError) {
    return sendError(res, error.statusCode, error.message, { code: error.code });
  }

  logger.error("Support query controller error", {
    service: "support-query.controller",
    action: "handleSupportQueryError",
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  return sendError(res, 500, "Something went wrong.");
}

function getQueryIdParam(req: Request) {
  const id = req.params.id;

  if (typeof id !== "string" || id.trim().length === 0) {
    return null;
  }

  return id.trim();
}

export async function createSupportQueryController(req: Request, res: Response) {
  try {
    if (!req.user) {
      return sendError(res, 401, "Unauthorized.");
    }

    const input = req.body as CreateSupportQueryInput;
    const query = await createSupportQuery(req.user.userId, input);

    return sendSuccess(res, 201, "Support query created successfully.", query);
  } catch (error) {
    return handleSupportQueryError(res, error);
  }
}

export async function listSupportQueriesController(_req: Request, res: Response) {
  try {
    const queries = await listSupportQueries();
    return sendSuccess(res, 200, "Support queries fetched successfully.", queries);
  } catch (error) {
    return handleSupportQueryError(res, error);
  }
}

export async function resolveSupportQueryController(req: Request, res: Response) {
  try {
    const id = getQueryIdParam(req);

    if (!id) {
      return sendError(res, 400, "Support query id is required.");
    }

    const result = await resolveSupportQuery(id);
    return sendSuccess(res, 200, "Support query resolved successfully.", result);
  } catch (error) {
    return handleSupportQueryError(res, error);
  }
}
