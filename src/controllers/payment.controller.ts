import type { Request, Response } from "express";
import {
  BookingServiceError,
  getAdminCashfreeWebhookEvents,
  processCashfreeWebhook,
} from "../services/booking.service.js";

function sendError(res: Response, status: number, message: string, errors?: unknown) {
  return res.status(status).json({
    success: false,
    message,
    ...(errors ? { errors } : {}),
  });
}

export async function cashfreeWebhookController(req: Request, res: Response) {
  try {
    const payload = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(JSON.stringify(req.body ?? {}));

    await processCashfreeWebhook(
      payload,
      req.headers["x-webhook-signature"],
      req.headers["x-webhook-timestamp"],
      req.headers["x-idempotency-header"],
    );

    return res.status(200).json({
      success: true,
      message: "Webhook processed successfully.",
      data: null,
    });
  } catch (error) {
    if (error instanceof BookingServiceError) {
      return sendError(res, error.statusCode, error.message, { code: error.code });
    }

    console.error("Cashfree webhook error:", error);
    return sendError(res, 500, "Something went wrong.");
  }
}

export async function getAdminCashfreeWebhookEventsController(req: Request, res: Response) {
  try {
    const adminId = req.user?.userId ?? null;

    if (!adminId) {
      return sendError(res, 401, "Unauthorized.");
    }

    const events = await getAdminCashfreeWebhookEvents(adminId);

    return res.status(200).json({
      success: true,
      message: "Admin payment events fetched successfully.",
      data: events,
    });
  } catch (error) {
    if (error instanceof BookingServiceError) {
      return sendError(res, error.statusCode, error.message, { code: error.code });
    }

    console.error("Admin payment events controller error:", error);
    return sendError(res, 500, "Something went wrong.");
  }
}
