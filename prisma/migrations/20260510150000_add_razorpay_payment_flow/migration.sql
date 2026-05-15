CREATE TYPE "FinancialStatus" AS ENUM (
  'NONE',
  'PAYMENT_PENDING',
  'PAYMENT_PROCESSING',
  'PAYMENT_CAPTURED',
  'PAYMENT_FAILED',
  'PAYOUT_ON_HOLD',
  'PAYOUT_RELEASED',
  'PAYOUT_SETTLED',
  'PAYOUT_FAILED',
  'DEPOSIT_REFUND_PENDING',
  'DEPOSIT_REFUNDED',
  'REFUND_FAILED',
  'DISPUTED'
);

ALTER TABLE "User"
ADD COLUMN "razorpayLinkedAccountId" TEXT;

ALTER TABLE "Booking"
ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'INR',
ADD COLUMN "financialStatus" "FinancialStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN "razorpayOrderId" TEXT,
ADD COLUMN "razorpayPaymentId" TEXT,
ADD COLUMN "razorpayTransferId" TEXT,
ADD COLUMN "razorpayRefundId" TEXT,
ADD COLUMN "payoutLinkedAccountId" TEXT,
ADD COLUMN "paymentAmountInPaise" INTEGER,
ADD COLUMN "paymentCurrency" TEXT,
ADD COLUMN "lastPaymentError" TEXT,
ADD COLUMN "paymentFailedAt" TIMESTAMP(3),
ADD COLUMN "ownerPayoutSettledAt" TIMESTAMP(3),
ADD COLUMN "depositRefundInitiatedAt" TIMESTAMP(3),
ADD COLUMN "depositRefundedAt" TIMESTAMP(3);

CREATE TABLE "RazorpayWebhookEvent" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "entityId" TEXT,
  "payload" JSONB NOT NULL,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RazorpayWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_razorpayLinkedAccountId_key" ON "User"("razorpayLinkedAccountId");
CREATE INDEX "User_razorpayLinkedAccountId_idx" ON "User"("razorpayLinkedAccountId");
CREATE INDEX "Booking_financialStatus_createdAt_idx" ON "Booking"("financialStatus", "createdAt");
CREATE INDEX "Booking_razorpayOrderId_idx" ON "Booking"("razorpayOrderId");
CREATE INDEX "Booking_razorpayPaymentId_idx" ON "Booking"("razorpayPaymentId");
CREATE INDEX "Booking_razorpayTransferId_idx" ON "Booking"("razorpayTransferId");
CREATE INDEX "Booking_razorpayRefundId_idx" ON "Booking"("razorpayRefundId");
CREATE UNIQUE INDEX "RazorpayWebhookEvent_eventId_key" ON "RazorpayWebhookEvent"("eventId");
CREATE INDEX "RazorpayWebhookEvent_eventType_createdAt_idx" ON "RazorpayWebhookEvent"("eventType", "createdAt");
CREATE INDEX "RazorpayWebhookEvent_entityId_idx" ON "RazorpayWebhookEvent"("entityId");
