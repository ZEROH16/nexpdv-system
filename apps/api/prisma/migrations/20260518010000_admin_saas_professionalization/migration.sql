PRAGMA foreign_keys=OFF;

ALTER TABLE "Company" ADD COLUMN "stateRegistration" TEXT;
ALTER TABLE "Company" ADD COLUMN "whatsapp" TEXT;
ALTER TABLE "Company" ADD COLUMN "city" TEXT;
ALTER TABLE "Company" ADD COLUMN "state" TEXT;
ALTER TABLE "Company" ADD COLUMN "zipCode" TEXT;
ALTER TABLE "Company" ADD COLUMN "internalNotes" TEXT;
ALTER TABLE "Company" ADD COLUMN "accountManager" TEXT;

ALTER TABLE "User" ADD COLUMN "phone" TEXT;
ALTER TABLE "User" ADD COLUMN "permissionsJson" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "User" ADD COLUMN "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "twoFactorSecret" TEXT;
ALTER TABLE "User" ADD COLUMN "recoveryCodesHash" TEXT;
ALTER TABLE "User" ADD COLUMN "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "lockedUntil" DATETIME;
ALTER TABLE "User" ADD COLUMN "lastLoginAt" DATETIME;

ALTER TABLE "Plan" ADD COLUMN "billingPeriod" TEXT NOT NULL DEFAULT 'monthly';
ALTER TABLE "Plan" ADD COLUMN "graceDays" INTEGER NOT NULL DEFAULT 7;
ALTER TABLE "Plan" ADD COLUMN "extraFeaturesJson" TEXT NOT NULL DEFAULT '{}';

ALTER TABLE "License" ADD COLUMN "internalNotes" TEXT;

ALTER TABLE "Device" ADD COLUMN "shortCode" TEXT;
ALTER TABLE "Device" ADD COLUMN "hostName" TEXT;
ALTER TABLE "Device" ADD COLUMN "os" TEXT;
ALTER TABLE "Device" ADD COLUMN "lastIp" TEXT;

CREATE INDEX "User_platformRole_idx" ON "User"("platformRole");
CREATE INDEX "Device_shortCode_idx" ON "Device"("shortCode");

PRAGMA foreign_keys=ON;
