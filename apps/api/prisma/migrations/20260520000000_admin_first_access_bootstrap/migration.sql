PRAGMA foreign_keys=OFF;

ALTER TABLE "User" ADD COLUMN "firstAccessRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "initialAccessTokenHash" TEXT;
ALTER TABLE "User" ADD COLUMN "initialAccessTokenExpiresAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "initialAccessCompletedAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "passwordChangedAt" DATETIME;

CREATE INDEX "User_firstAccessRequired_idx" ON "User"("firstAccessRequired");

PRAGMA foreign_keys=ON;
