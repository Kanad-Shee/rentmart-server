import { z } from "zod";

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

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type BookingParams = z.infer<typeof bookingParamsSchema>;
export type RejectBookingInput = z.infer<typeof rejectBookingSchema>;
export type DisputeBookingInput = z.infer<typeof disputeBookingSchema>;
export type VerifyBookingPaymentInput = z.infer<typeof verifyBookingPaymentSchema>;
export type ManualSettlementInput = z.infer<typeof manualSettlementSchema>;
