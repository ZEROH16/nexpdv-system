PRAGMA foreign_keys=OFF;

CREATE TABLE "Company" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "document" TEXT NOT NULL,
  "tradeName" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "address" TEXT,
  "logoUrl" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "User" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'cashier',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "Category" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "color" TEXT NOT NULL DEFAULT '#2563EB',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Category_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "Product" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "categoryId" TEXT,
  "name" TEXT NOT NULL,
  "barcode" TEXT,
  "sku" TEXT,
  "brand" TEXT,
  "cost" REAL NOT NULL DEFAULT 0,
  "price" REAL NOT NULL DEFAULT 0,
  "margin" REAL NOT NULL DEFAULT 0,
  "stock" REAL NOT NULL DEFAULT 0,
  "minStock" REAL NOT NULL DEFAULT 0,
  "unit" TEXT NOT NULL DEFAULT 'UN',
  "imageUrl" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "syncStatus" TEXT NOT NULL DEFAULT 'synced',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Product_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "Customer" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "document" TEXT,
  "phone" TEXT,
  "whatsapp" TEXT,
  "address" TEXT,
  "notes" TEXT,
  "creditLimit" REAL NOT NULL DEFAULT 0,
  "balance" REAL NOT NULL DEFAULT 0,
  "syncStatus" TEXT NOT NULL DEFAULT 'synced',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Customer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "Sale" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "operatorId" TEXT NOT NULL,
  "operatorName" TEXT NOT NULL,
  "customerId" TEXT,
  "customerName" TEXT,
  "subtotal" REAL NOT NULL,
  "discount" REAL NOT NULL,
  "total" REAL NOT NULL,
  "profit" REAL NOT NULL,
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'completed',
  "syncStatus" TEXT NOT NULL DEFAULT 'synced',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Sale_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Sale_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "SaleItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "saleId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "quantity" REAL NOT NULL,
  "unitPrice" REAL NOT NULL,
  "discount" REAL NOT NULL DEFAULT 0,
  "total" REAL NOT NULL,
  "cost" REAL NOT NULL,
  CONSTRAINT "SaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SaleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "Payment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "saleId" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "amount" REAL NOT NULL,
  "change" REAL NOT NULL DEFAULT 0,
  CONSTRAINT "Payment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "CashRegister" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "operatorId" TEXT NOT NULL,
  "operatorName" TEXT NOT NULL,
  "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" DATETIME,
  "openingAmount" REAL NOT NULL,
  "expectedAmount" REAL NOT NULL,
  "countedAmount" REAL,
  "difference" REAL,
  "status" TEXT NOT NULL DEFAULT 'open',
  CONSTRAINT "CashRegister_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "CashMovement" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "cashRegisterId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "amount" REAL NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashMovement_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "CashRegister" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "Setting" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Setting_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "License" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'trial',
  "validUntil" DATETIME NOT NULL,
  "demoMode" BOOLEAN NOT NULL DEFAULT true,
  "activatedAt" DATETIME,
  CONSTRAINT "License_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "Plan" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "price" REAL NOT NULL,
  "maxStores" INTEGER NOT NULL,
  "maxUsers" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "Subscription" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "startsAt" DATETIME NOT NULL,
  "endsAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Subscription_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "SyncLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "entity" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "message" TEXT,
  "payload" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "DeviceToken" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "DeviceToken_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "Product_companyId_name_idx" ON "Product"("companyId", "name");
CREATE INDEX "Product_companyId_barcode_idx" ON "Product"("companyId", "barcode");
CREATE INDEX "Sale_companyId_createdAt_idx" ON "Sale"("companyId", "createdAt");
CREATE INDEX "Sale_companyId_number_idx" ON "Sale"("companyId", "number");
CREATE UNIQUE INDEX "Setting_companyId_key_key" ON "Setting"("companyId", "key");
CREATE UNIQUE INDEX "License_key_key" ON "License"("key");
CREATE UNIQUE INDEX "DeviceToken_token_key" ON "DeviceToken"("token");

PRAGMA foreign_keys=ON;
