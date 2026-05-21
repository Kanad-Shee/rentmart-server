import type {
  BookingStatus,
  DepositRefundStatus,
  FinancialStatus,
  OwnerPayoutStatus,
} from "../generated/prisma/client";

export type BookingPaymentOrder = {
  bookingId: string;
  orderId: string;
  paymentSessionId: string;
  amount: number;
  currency: string;
  environment: "sandbox" | "production";
  renterName: string;
  renterEmail: string;
  renterPhone: string | null;
  description: string;
};

export type BookingDisputeImageSummary = {
  id: string;
  url: string;
  position: number;
};

export type SafeBooking = {
  id: string;
  equipmentId: string;
  renterId: string;
  ownerId: string;
  startDate: string;
  endDate: string;
  rentalDays: number;
  rentalFee: number;
  platformFee: number;
  damageWaiverFee: number;
  securityDeposit: number;
  totalAuthorized: number;
  currency: string;
  isPaymentCompleted: boolean;
  financialStatus: FinancialStatus;
  paymentProvider: string | null;
  paymentIntentId: string | null;
  paymentAuthorizationId: string | null;
  cashfreeOrderId: string | null;
  cashfreePaymentId: string | null;
  cashfreePaymentSessionId: string | null;
  payoutLinkedAccountId: string | null;
  paymentAmountInPaise: number | null;
  paymentCurrency: string | null;
  lastPaymentError: string | null;
  paymentCapturedAt: string | null;
  ownerActionDeadlineAt: string;
  renterPaymentDeadlineAt: string | null;
  conditionLoggedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  disputedAt: string | null;
  paymentFailedAt: string | null;
  paymentVoidedAt: string | null;
  paymentReleasedAt: string | null;
  paymentDisputedAt: string | null;
  ownerPayoutSettledAt: string | null;
  depositRefundInitiatedAt: string | null;
  depositRefundedAt: string | null;
  ownerPayoutStatus: OwnerPayoutStatus;
  ownerPaidAt: string | null;
  ownerPayoutReference: string | null;
  depositRefundStatus: DepositRefundStatus;
  depositRefundReference: string | null;
  status: BookingStatus;
  ownerDecisionReason: string | null;
  disputeReason: string | null;
  disputeImages: BookingDisputeImageSummary[];
  createdAt: string;
  updatedAt: string;
  equipment: {
    id: string;
    title: string;
    price: number;
    normalizedAddress: string;
    status: string;
    imageUrl: string | null;
  };
  renter: {
    id: string;
    fullName: string;
    email: string;
    phoneVerified: boolean;
  };
  owner: {
    id: string;
    fullName: string;
    email: string;
    phoneVerified: boolean;
  };
};
