PRAGMA foreign_keys=OFF;

ALTER TABLE "Company" ADD COLUMN "backupStartedAt" DATETIME;
ALTER TABLE "Company" ADD COLUMN "lastBackupAt" DATETIME;
ALTER TABLE "Company" ADD COLUMN "lastSyncAt" DATETIME;
ALTER TABLE "Company" ADD COLUMN "backupStatus" TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE "Company" ADD COLUMN "syncStatus" TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE "Company" ADD COLUMN "cloudHealth" TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE "Company" ADD COLUMN "cloudNotifiedAt" DATETIME;

CREATE INDEX "Company_cloudHealth_idx" ON "Company"("cloudHealth");
CREATE INDEX "Company_lastBackupAt_idx" ON "Company"("lastBackupAt");

PRAGMA foreign_keys=ON;
