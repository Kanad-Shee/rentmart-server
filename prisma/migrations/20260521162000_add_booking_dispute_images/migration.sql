CREATE TABLE "BookingDisputeImage" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BookingDisputeImage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BookingDisputeImage_bookingId_position_idx" ON "BookingDisputeImage"("bookingId", "position");

ALTER TABLE "BookingDisputeImage"
ADD CONSTRAINT "BookingDisputeImage_bookingId_fkey"
FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
