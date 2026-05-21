import { Router } from "express";
import { UserRole } from "../generated/prisma/client";
import {
  cashfreeWebhookController,
  getAdminCashfreeWebhookEventsController,
} from "../controllers/payment.controller";
import { authenticateUser, requireRole } from "../middlewares/auth.middleware";

const paymentRouter = Router();

paymentRouter.post("/cashfree/webhook", cashfreeWebhookController);
paymentRouter.get(
  "/admin/events",
  authenticateUser,
  requireRole(UserRole.ADMIN),
  getAdminCashfreeWebhookEventsController,
);

export { paymentRouter };
