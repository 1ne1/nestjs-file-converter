-- CreateEnum
CREATE TYPE "TransformationType" AS ENUM ('FILE', 'IMAGE');

-- CreateEnum
CREATE TYPE "TransformationStatus" AS ENUM ('SUCCESS', 'ERROR');

-- CreateTable
CREATE TABLE "TransformationHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "TransformationType" NOT NULL,
    "sourceFormat" TEXT NOT NULL,
    "targetFormat" TEXT NOT NULL,
    "status" "TransformationStatus" NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "errorCode" TEXT,
    "fileId" TEXT,
    "fileContentType" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransformationHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TransformationHistory_userId_createdAt_idx" ON "TransformationHistory"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "TransformationHistory_expiresAt_idx" ON "TransformationHistory"("expiresAt");

-- AddForeignKey
ALTER TABLE "TransformationHistory" ADD CONSTRAINT "TransformationHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
