CREATE TABLE "EquipmentReview" (
  "id" TEXT NOT NULL,
  "equipmentId" TEXT NOT NULL,
  "renterId" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EquipmentReview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EquipmentReviewImage" (
  "id" TEXT NOT NULL,
  "reviewId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EquipmentReviewImage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EquipmentReview_equipmentId_renterId_key" ON "EquipmentReview"("equipmentId", "renterId");
CREATE INDEX "EquipmentReview_equipmentId_createdAt_idx" ON "EquipmentReview"("equipmentId", "createdAt");
CREATE INDEX "EquipmentReview_renterId_createdAt_idx" ON "EquipmentReview"("renterId", "createdAt");
CREATE INDEX "EquipmentReviewImage_reviewId_position_idx" ON "EquipmentReviewImage"("reviewId", "position");

ALTER TABLE "EquipmentReview"
ADD CONSTRAINT "EquipmentReview_equipmentId_fkey"
FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EquipmentReview"
ADD CONSTRAINT "EquipmentReview_renterId_fkey"
FOREIGN KEY ("renterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EquipmentReviewImage"
ADD CONSTRAINT "EquipmentReviewImage_reviewId_fkey"
FOREIGN KEY ("reviewId") REFERENCES "EquipmentReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
