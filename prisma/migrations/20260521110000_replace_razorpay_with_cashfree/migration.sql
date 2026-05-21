DROP INDEX IF EXISTS "User_razorpayLinkedAccountId_idx";
DROP INDEX IF EXISTS "User_razorpayLinkedAccountId_key";

ALTER TABLE "User"
DROP COLUMN IF EXISTS "razorpayLinkedAccountId";

DROP INDEX IF EXISTS "Booking_razorpayOrderId_idx";
DROP INDEX IF EXISTS "Booking_razorpayPaymentId_idx";
DROP INDEX IF EXISTS "Booking_razorpayTransferId_idx";
DROP INDEX IF EXISTS "Booking_razorpayRefundId_idx";

ALTER TABLE "Booking"
RENAME COLUMN "razorpayOrderId" TO "cashfreeOrderId";

ALTER TABLE "Booking"
RENAME COLUMN "razorpayPaymentId" TO "cashfreePaymentId";

ALTER TABLE "Booking"
ADD COLUMN "cashfreePaymentSessionId" TEXT,
DROP COLUMN IF EXISTS "razorpayTransferId",
DROP COLUMN IF EXISTS "razorpayRefundId";

CREATE INDEX "Booking_cashfreeOrderId_idx" ON "Booking"("cashfreeOrderId");
CREATE INDEX "Booking_cashfreePaymentId_idx" ON "Booking"("cashfreePaymentId");
CREATE INDEX "Booking_cashfreePaymentSessionId_idx" ON "Booking"("cashfreePaymentSessionId");

ALTER TABLE "RazorpayWebhookEvent"
RENAME TO "CashfreeWebhookEvent";

ALTER INDEX "RazorpayWebhookEvent_pkey"
RENAME TO "CashfreeWebhookEvent_pkey";

ALTER INDEX "RazorpayWebhookEvent_eventId_key"
RENAME TO "CashfreeWebhookEvent_eventId_key";

ALTER INDEX "RazorpayWebhookEvent_eventType_createdAt_idx"
RENAME TO "CashfreeWebhookEvent_eventType_createdAt_idx";

ALTER INDEX "RazorpayWebhookEvent_entityId_idx"
RENAME TO "CashfreeWebhookEvent_entityId_idx";
