ALTER TABLE "Equipment"
ADD COLUMN "reviewSummaryText" TEXT,
ADD COLUMN "reviewSummaryGeneratedAt" TIMESTAMP(3),
ADD COLUMN "reviewSummaryReviewCount" INTEGER;
