-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'ADDRESS_UPDATED';
ALTER TYPE "NotificationType" ADD VALUE 'PASSWORD_UPDATED';
ALTER TYPE "NotificationType" ADD VALUE 'PHONE_VERIFIED';
ALTER TYPE "NotificationType" ADD VALUE 'BOOKING_REQUEST_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE 'BOOKING_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'BOOKING_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE 'BOOKING_PAYMENT_REQUIRED';
ALTER TYPE "NotificationType" ADD VALUE 'BOOKING_PAYMENT_CONFIRMED';
ALTER TYPE "NotificationType" ADD VALUE 'RENTER_PAYMENT_CONFIRMED';
ALTER TYPE "NotificationType" ADD VALUE 'BOOKING_STARTED';
ALTER TYPE "NotificationType" ADD VALUE 'BOOKING_COMPLETED';
ALTER TYPE "NotificationType" ADD VALUE 'BOOKING_CANCELLED';
ALTER TYPE "NotificationType" ADD VALUE 'BOOKING_DISPUTED';
