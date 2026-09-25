-- CreateEnum
CREATE TYPE "ChallengePurpose" AS ENUM ('REGISTRATION', 'LOGIN', 'EMAIL_CHANGE', 'SELF_DELETE');

-- CreateEnum
CREATE TYPE "ChallengeMethod" AS ENUM ('OTP', 'MAGIC_LINK');

-- CreateTable
CREATE TABLE "EmailChallenge" (
    "id" TEXT NOT NULL,
    "purpose" "ChallengePurpose" NOT NULL,
    "method" "ChallengeMethod" NOT NULL,
    "email" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "userId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailChallenge_email_purpose_idx" ON "EmailChallenge"("email", "purpose");
