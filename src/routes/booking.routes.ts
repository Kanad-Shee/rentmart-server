import { Router } from "express";
import { UserRole } from "../generated/prisma/client";
import { uploadOptionalBookingDisputeImages } from "../middlewares/image-upload.middleware";
import {
  approveBookingController,
  completeBookingController,
  createBookingPaymentOrderController,
  createBookingController,
  disputeBookingController,
  getAdminBookingsController,
  getMyBookingsController,
  getOwnerBookingsController,
  markDepositRefundedController,
  markOwnerPayoutPaidController,
  rejectBookingController,
  startBookingController,
  verifyBookingPaymentController,
} from "../controllers/booking.controller";
import {
  authenticateUser,
  requireRole,
  requireVerifiedMobile,
} from "../middlewares/auth.middleware";
import { validateRequest } from "../middlewares/validate.middleware";
import {
  bookingParamsSchema,
  createBookingPaymentOrderSchema,
  createBookingSchema,
  disputeBookingSchema,
  manualSettlementSchema,
  rejectBookingSchema,
  verifyBookingPaymentSchema,
} from "../validators/booking.schema";

const bookingRouter = Router();

bookingRouter.post(
  "/",
  authenticateUser,
  requireVerifiedMobile(),
  requireRole(UserRole.RENTER),
  validateRequest(createBookingSchema),
  createBookingController,
);

bookingRouter.get(
  "/mine",
  authenticateUser,
  requireRole(UserRole.RENTER),
  getMyBookingsController,
);

bookingRouter.get(
  "/owner",
  authenticateUser,
  requireRole(UserRole.OWNER),
  getOwnerBookingsController,
);

bookingRouter.get(
  "/admin",
  authenticateUser,
  requireRole(UserRole.ADMIN),
  getAdminBookingsController,
);

bookingRouter.post(
  "/:bookingId/payment/order",
  authenticateUser,
  requireVerifiedMobile(),
  requireRole(UserRole.RENTER),
  validateRequest(bookingParamsSchema, "params"),
  validateRequest(createBookingPaymentOrderSchema),
  createBookingPaymentOrderController,
);

bookingRouter.post(
  "/:bookingId/payment/verify",
  authenticateUser,
  requireVerifiedMobile(),
  requireRole(UserRole.RENTER),
  validateRequest(bookingParamsSchema, "params"),
  validateRequest(verifyBookingPaymentSchema),
  verifyBookingPaymentController,
);

bookingRouter.patch(
  "/:bookingId/approve",
  authenticateUser,
  requireRole(UserRole.OWNER),
  validateRequest(bookingParamsSchema, "params"),
  approveBookingController,
);

bookingRouter.patch(
  "/:bookingId/reject",
  authenticateUser,
  requireRole(UserRole.OWNER),
  validateRequest(bookingParamsSchema, "params"),
  validateRequest(rejectBookingSchema),
  rejectBookingController,
);

bookingRouter.patch(
  "/:bookingId/start",
  authenticateUser,
  requireRole(UserRole.OWNER),
  validateRequest(bookingParamsSchema, "params"),
  startBookingController,
);

bookingRouter.patch(
  "/:bookingId/complete",
  authenticateUser,
  requireRole(UserRole.OWNER),
  validateRequest(bookingParamsSchema, "params"),
  completeBookingController,
);

bookingRouter.patch(
  "/:bookingId/dispute",
  authenticateUser,
  requireRole(UserRole.OWNER),
  uploadOptionalBookingDisputeImages,
  validateRequest(bookingParamsSchema, "params"),
  validateRequest(disputeBookingSchema),
  disputeBookingController,
);

bookingRouter.patch(
  "/:bookingId/mark-owner-paid",
  authenticateUser,
  requireRole(UserRole.ADMIN),
  validateRequest(bookingParamsSchema, "params"),
  validateRequest(manualSettlementSchema),
  markOwnerPayoutPaidController,
);

bookingRouter.patch(
  "/:bookingId/mark-deposit-refunded",
  authenticateUser,
  requireRole(UserRole.ADMIN),
  validateRequest(bookingParamsSchema, "params"),
  validateRequest(manualSettlementSchema),
  markDepositRefundedController,
);

export { bookingRouter };
