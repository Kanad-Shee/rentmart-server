-- CreateEnum
CREATE TYPE "SupportQueryTopic" AS ENUM (
  'GENERAL_INQUIRY',
  'LISTING_HELP',
  'RENTAL_HELP',
  'PAYMENT_HELP',
  'ACCOUNT_HELP'
);

-- CreateTable
CREATE TABLE "SupportQuery" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "topic" "SupportQueryTopic" NOT NULL,
  "fullName" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" "UserRole" NOT NULL,
  "message" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SupportQuery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportQuery_userId_createdAt_idx" ON "SupportQuery"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportQuery_topic_createdAt_idx" ON "SupportQuery"("topic", "createdAt");

-- CreateIndex
CREATE INDEX "SupportQuery_role_createdAt_idx" ON "SupportQuery"("role", "createdAt");

-- AddForeignKey
ALTER TABLE "SupportQuery" ADD CONSTRAINT "SupportQuery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
