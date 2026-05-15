DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'PENDING_RENTER_PAYMENT'
      AND enumtypid = '"BookingStatus"'::regtype
  ) THEN
    ALTER TYPE "BookingStatus" ADD VALUE 'PENDING_RENTER_PAYMENT' AFTER 'PENDING_OWNER_APPROVAL';
  END IF;
END $$;

ALTER TABLE "Booking"
  ALTER COLUMN "paymentProvider" DROP NOT NULL,
  ALTER COLUMN "paymentIntentId" DROP NOT NULL,
  ALTER COLUMN "paymentIdempotencyKey" DROP NOT NULL,
  ADD COLUMN "renterPaymentDeadlineAt" TIMESTAMP(3);
