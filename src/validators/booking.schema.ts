import { z } from "zod";
import { paginationQuerySchema } from "./pagination.schema.js";

const dateStringSchema = z
  .string({ message: "Date is required." })
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format.");

const moneySchema = z
  .number({ message: "Amount is required." })
  .finite("Amount must be a valid number.")
  .min(0, "Amount cannot be negative.");

export const createBookingSchema = z
  .object({
    equipmentId: z
      .string({ message: "Equipment id is required." })
      .trim()
      .min(1, "Equipment id is required."),
    startDate: dateStringSchema,
    endDate: dateStringSchema,
    rentalDays: z
      .number({ message: "Rental days are required." })
      .int("Rental days must be a whole number.")
      .min(1, "Select at least one rental day."),
    rentalFee: moneySchema,
    platformFee: moneySchema,
    damageWaiverFee: moneySchema,
    securityDeposit: moneySchema,
    totalAuthorized: moneySchema,
  })
  .superRefine((values, ctx) => {
    if (values.endDate < values.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "End date must be on or after the start date.",
      });
    }
  });

export const bookingParamsSchema = z.object({
  bookingId: z
    .string({ message: "Booking id is required." })
    .trim()
    .min(1, "Booking id is required."),
});

export const rejectBookingSchema = z.object({
  reason: z
    .string({ message: "Reason is required." })
    .trim()
    .min(5, "Provide at least 5 characters for the rejection reason.")
    .max(400, "Reason is too long."),
});

export const disputeBookingSchema = z.object({
  reason: z
    .string({ message: "Reason is required." })
    .trim()
    .min(5, "Provide at least 5 characters for the dispute reason.")
    .max(400, "Reason is too long."),
});

export const createBookingPaymentOrderSchema = z.object({});

export const verifyBookingPaymentSchema = z.object({
  cashfreeOrderId: z
    .string({ message: "Cashfree order id is required." })
    .trim()
    .min(1, "Cashfree order id is required."),
});

export const manualSettlementSchema = z.object({
  reference: z
    .string()
    .trim()
    .max(200, "Reference is too long.")
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
});

export const ownerBookingsQuerySchema = paginationQuerySchema.extend({
  group: z
    .enum([
      "ALL",
      "PENDING",
      "AWAITING_PAYMENT",
      "CONFIRMED",
      "IN_PROGRESS",
      "HISTORY",
    ])
    .optional(),
});

export const adminBookingsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120, "Search is too long.").optional(),
  status: z
    .enum([
      "ALL",
      "PENDING_OWNER_APPROVAL",
      "PENDING_RENTER_PAYMENT",
      "CONFIRMED",
      "IN_PROGRESS",
      "COMPLETED",
      "CANCELLED",
      "DISPUTED",
    ])
    .optional(),
  financialStatus: z
    .enum([
      "ALL",
      "PAYMENT_CAPTURED",
      "MANUAL_SETTLEMENT_PENDING",
      "MANUAL_SETTLEMENT_COMPLETE",
      "PAYMENT_FAILED",
      "DISPUTED",
      "PAYMENT_PENDING",
      "PAYMENT_PROCESSING",
      "NONE",
    ])
    .optional(),
  ownerPayoutStatus: z.enum(["ALL", "PENDING", "PAID", "BLOCKED", "NONE"]).optional(),
  depositRefundStatus: z
    .enum(["ALL", "PENDING", "REFUNDED", "SKIPPED", "BLOCKED", "NONE"])
    .optional(),
  needsAction: z.enum(["ALL", "ONLY_ACTION"]).optional(),
});

export const adminPaymentEventsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120, "Search is too long.").optional(),
  eventType: z.string().trim().max(120, "Event type is too long.").optional(),
  status: z.enum(["ALL", "processed", "unprocessed", "unmatched"]).optional(),
  linkState: z.enum(["ALL", "LINKED", "UNLINKED"]).optional(),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type BookingParams = z.infer<typeof bookingParamsSchema>;
export type RejectBookingInput = z.infer<typeof rejectBookingSchema>;
export type DisputeBookingInput = z.infer<typeof disputeBookingSchema>;
export type VerifyBookingPaymentInput = z.infer<typeof verifyBookingPaymentSchema>;
export type ManualSettlementInput = z.infer<typeof manualSettlementSchema>;
export type OwnerBookingsQueryInput = z.infer<typeof ownerBookingsQuerySchema>;
export type AdminBookingsQueryInput = z.infer<typeof adminBookingsQuerySchema>;
export type AdminPaymentEventsQueryInput = z.infer<
  typeof adminPaymentEventsQuerySchema
>;
