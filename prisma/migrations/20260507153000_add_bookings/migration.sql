CREATE TYPE "BookingStatus" AS ENUM (
  'PENDING_OWNER_APPROVAL',
  'CONFIRMED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'DISPUTED'
);

CREATE TABLE "Booking" (
  "id" TEXT NOT NULL,
  "equipmentId" TEXT NOT NULL,
  "renterId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "rentalDays" INTEGER NOT NULL,
  "rentalFee" DOUBLE PRECISION NOT NULL,
  "platformFee" DOUBLE PRECISION NOT NULL,
  "damageWaiverFee" DOUBLE PRECISION NOT NULL,
  "securityDeposit" DOUBLE PRECISION NOT NULL,
  "totalAuthorized" DOUBLE PRECISION NOT NULL,
  "paymentProvider" TEXT NOT NULL,
  "paymentIntentId" TEXT NOT NULL,
  "paymentAuthorizationId" TEXT,
  "paymentIdempotencyKey" TEXT NOT NULL,
  "paymentCapturedAt" TIMESTAMP(3),
  "paymentVoidedAt" TIMESTAMP(3),
  "paymentReleasedAt" TIMESTAMP(3),
  "paymentDisputedAt" TIMESTAMP(3),
  "ownerActionDeadlineAt" TIMESTAMP(3) NOT NULL,
  "conditionLoggedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "disputedAt" TIMESTAMP(3),
  "status" "BookingStatus" NOT NULL DEFAULT 'PENDING_OWNER_APPROVAL',
  "ownerDecisionReason" TEXT,
  "disputeReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Booking_equipmentId_idx" ON "Booking"("equipmentId");
CREATE INDEX "Booking_renterId_createdAt_idx" ON "Booking"("renterId", "createdAt");
CREATE INDEX "Booking_ownerId_createdAt_idx" ON "Booking"("ownerId", "createdAt");
CREATE INDEX "Booking_status_createdAt_idx" ON "Booking"("status", "createdAt");
CREATE INDEX "Booking_paymentIntentId_idx" ON "Booking"("paymentIntentId");

ALTER TABLE "Booking"
ADD CONSTRAINT "Booking_equipmentId_fkey"
FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Booking"
ADD CONSTRAINT "Booking_renterId_fkey"
FOREIGN KEY ("renterId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Booking"
ADD CONSTRAINT "Booking_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
