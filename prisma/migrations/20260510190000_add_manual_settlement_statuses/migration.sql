CREATE TYPE "OwnerPayoutStatus" AS ENUM (
  'NONE',
  'PENDING',
  'PAID',
  'BLOCKED'
);

CREATE TYPE "DepositRefundStatus" AS ENUM (
  'NONE',
  'PENDING',
  'REFUNDED',
  'SKIPPED',
  'BLOCKED'
);

ALTER TYPE "FinancialStatus" ADD VALUE IF NOT EXISTS 'MANUAL_SETTLEMENT_PENDING';
ALTER TYPE "FinancialStatus" ADD VALUE IF NOT EXISTS 'MANUAL_SETTLEMENT_COMPLETE';

ALTER TABLE "Booking"
ADD COLUMN "ownerPayoutStatus" "OwnerPayoutStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN "ownerPaidAt" TIMESTAMP(3),
ADD COLUMN "ownerPayoutReference" TEXT,
ADD COLUMN "depositRefundStatus" "DepositRefundStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN "depositRefundReference" TEXT;

CREATE INDEX "Booking_ownerPayoutStatus_createdAt_idx" ON "Booking"("ownerPayoutStatus", "createdAt");
CREATE INDEX "Booking_depositRefundStatus_createdAt_idx" ON "Booking"("depositRefundStatus", "createdAt");
