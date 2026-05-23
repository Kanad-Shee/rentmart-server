import { Router } from "express";
import { UserRole } from "@prisma/client";
import {
  cashfreeWebhookController,
  getAdminCashfreeWebhookEventsController,
} from "../controllers/payment.controller.js";
import { authenticateUser, requireRole } from "../middlewares/auth.middleware.js";
import { validateRequest } from "../middlewares/validate.middleware.js";
import { adminPaymentEventsQuerySchema } from "../validators/booking.schema.js";

const paymentRouter = Router();

paymentRouter.post("/cashfree/webhook", cashfreeWebhookController);
paymentRouter.get(
  "/admin/events",
  authenticateUser,
  requireRole(UserRole.ADMIN),
  validateRequest(adminPaymentEventsQuerySchema, "query"),
  getAdminCashfreeWebhookEventsController,
);

export { paymentRouter };
