PRAGMA foreign_keys=OFF;

CREATE TABLE "Tenant" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "Device" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "licenseId" TEXT,
  "deviceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "appVersion" TEXT,
  "platform" TEXT NOT NULL DEFAULT 'desktop',
  "status" TEXT NOT NULL DEFAULT 'active',
  "online" BOOLEAN NOT NULL DEFAULT false,
  "lastSeenAt" DATETIME,
  "activatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deactivatedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Device_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Device_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "License" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "SyncJob" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "deviceId" TEXT,
  "entity" TEXT NOT NULL,
  "entityId" TEXT,
  "operation" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "conflict" BOOLEAN NOT NULL DEFAULT false,
  "payload" TEXT,
  "lastError" TEXT,
  "scheduledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "SyncJob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SyncJob_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT,
  "userId" TEXT,
  "action" TEXT NOT NULL,
  "entity" TEXT,
  "entityId" TEXT,
  "details" TEXT,
  "ip" TEXT,
  "userAgent" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

ALTER TABLE "Company" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Company" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';

ALTER TABLE "User" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "User" ADD COLUMN "platformRole" TEXT NOT NULL DEFAULT 'company_user';
ALTER TABLE "User" ADD COLUMN "refreshTokenHash" TEXT;

ALTER TABLE "Plan" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Plan" ADD COLUMN "code" TEXT NOT NULL DEFAULT 'PRO';
ALTER TABLE "Plan" ADD COLUMN "description" TEXT;
ALTER TABLE "Plan" ADD COLUMN "maxDevices" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Plan" ADD COLUMN "featuresJson" TEXT NOT NULL DEFAULT '{}';

ALTER TABLE "License" ADD COLUMN "planId" TEXT;
ALTER TABLE "License" ADD COLUMN "planCode" TEXT NOT NULL DEFAULT 'OFFLINE';
ALTER TABLE "License" ADD COLUMN "offlineGraceUntil" DATETIME;
ALTER TABLE "License" ADD COLUMN "featuresJson" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "License" ADD COLUMN "maxDevices" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "License" ADD COLUMN "lastValidatedAt" DATETIME;
ALTER TABLE "License" ADD COLUMN "lastSyncedAt" DATETIME;
ALTER TABLE "License" ADD COLUMN "blockedReason" TEXT;
ALTER TABLE "License" ADD COLUMN "createdAt" DATETIME NOT NULL DEFAULT '1970-01-01 00:00:00';
ALTER TABLE "License" ADD COLUMN "updatedAt" DATETIME NOT NULL DEFAULT '1970-01-01 00:00:00';

CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");
CREATE INDEX "Company_tenantId_idx" ON "Company"("tenantId");
CREATE INDEX "Company_status_idx" ON "Company"("status");
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");
CREATE INDEX "User_companyId_idx" ON "User"("companyId");
CREATE UNIQUE INDEX "Plan_code_key" ON "Plan"("code");
CREATE INDEX "License_companyId_idx" ON "License"("companyId");
CREATE INDEX "License_status_idx" ON "License"("status");
CREATE INDEX "License_validUntil_idx" ON "License"("validUntil");
CREATE UNIQUE INDEX "Device_companyId_deviceId_key" ON "Device"("companyId", "deviceId");
CREATE INDEX "Device_companyId_status_idx" ON "Device"("companyId", "status");
CREATE INDEX "SyncJob_companyId_status_idx" ON "SyncJob"("companyId", "status");
CREATE INDEX "SyncJob_deviceId_idx" ON "SyncJob"("deviceId");
CREATE INDEX "Subscription_companyId_idx" ON "Subscription"("companyId");
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

PRAGMA foreign_keys=ON;
