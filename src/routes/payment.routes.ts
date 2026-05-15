import { Router } from "express";
import { UserRole } from "../generated/prisma/client";
import {
  getAdminRazorpayWebhookEventsController,
  razorpayWebhookController,
} from "../controllers/payment.controller";
import { authenticateUser, requireRole } from "../middlewares/auth.middleware";

const paymentRouter = Router();

paymentRouter.post("/razorpay/webhook", razorpayWebhookController);
paymentRouter.get(
  "/admin/events",
  authenticateUser,
  requireRole(UserRole.ADMIN),
  getAdminRazorpayWebhookEventsController,
);

export { paymentRouter };
