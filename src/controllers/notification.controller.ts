import type { Request, Response } from "express";
import { logger } from "../lib/logger.js";
import {
  getMyNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  NotificationServiceError,
} from "../services/notification.service.js";
import type { PaginationQueryInput } from "../validators/pagination.schema.js";

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

function handleNotificationError(res: Response, error: unknown) {
  if (error instanceof NotificationServiceError) {
    return sendError(res, error.statusCode, error.message, { code: error.code });
  }

  logger.error("Notification controller error", {
    service: "notification.controller",
    action: "handleNotificationError",
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  return sendError(res, 500, "Something went wrong.");
}

function getAuthenticatedUserId(req: Request) {
  return req.user?.userId ?? null;
}

function getNotificationIdParam(req: Request) {
  const notificationId = req.params.id;

  if (typeof notificationId !== "string" || notificationId.trim().length === 0) {
    return null;
  }

  return notificationId.trim();
}

export async function getMyNotificationsController(req: Request, res: Response) {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return sendError(res, 401, "Unauthorized.");
    }

    const notifications = await getMyNotifications(
      userId,
      req.query as unknown as PaginationQueryInput,
    );

    return sendSuccess(
      res,
      200,
      "Notifications fetched successfully.",
      notifications,
    );
  } catch (error) {
    return handleNotificationError(res, error);
  }
}

export async function markNotificationAsReadController(req: Request, res: Response) {
  try {
    const userId = getAuthenticatedUserId(req);
    const notificationId = getNotificationIdParam(req);

    if (!userId) {
      return sendError(res, 401, "Unauthorized.");
    }

    if (!notificationId) {
      return sendError(res, 400, "Notification id is required.");
    }

    const notification = await markNotificationAsRead(userId, notificationId);

    return sendSuccess(
      res,
      200,
      "Notification marked as read successfully.",
      notification,
    );
  } catch (error) {
    return handleNotificationError(res, error);
  }
}

export async function markAllNotificationsAsReadController(req: Request, res: Response) {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return sendError(res, 401, "Unauthorized.");
    }

    const result = await markAllNotificationsAsRead(userId);

    return sendSuccess(
      res,
      200,
      "Notifications marked as read successfully.",
      result,
    );
  } catch (error) {
    return handleNotificationError(res, error);
  }
}
