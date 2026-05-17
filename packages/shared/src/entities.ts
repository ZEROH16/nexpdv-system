export type Id = string;

export type SyncStatus = "pending" | "synced" | "failed" | "conflict";
export type SaleStatus = "completed" | "cancelled";
export type PaymentMethod = "cash" | "pix" | "credit" | "debit" | "store_credit";
export type CashMovementType = "opening" | "income" | "expense" | "withdrawal" | "closing";
export type UserRole = "owner" | "admin" | "manager" | "stockist" | "cashier";
export type LicenseStatus = "active" | "trial" | "expired" | "blocked";
export type PixConfigMode = "manual" | "static_qr" | "dynamic_qr";
export type PixKeyType = "cpf" | "cnpj" | "email" | "phone" | "random";
export type PixChargeStatus = "waiting" | "paid" | "expired" | "cancelled";
export type FiscalEnvironment = "homologation" | "production";
export type FiscalStatus = "not_issued" | "authorized" | "rejected" | "cancelled" | "contingency";

export interface Company {
  id: Id;
  name: string;
  document: string;
  tradeName?: string;
  legalName?: string;
  stateRegistration?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  logoUrl?: string;
  ownerEmail?: string;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: Id;
  companyId: Id;
  name: string;
  email: string;
  role: UserRole;
  sector?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: Id;
  companyId: Id;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: Id;
  companyId: Id;
  name: string;
  barcode?: string;
  sku?: string;
  categoryId?: Id;
  categoryName?: string;
  brand?: string;
  cost: number;
  price: number;
  margin: number;
  stock: number;
  minStock: number;
  unit: string;
  expirationDate?: string;
  locationEnabled?: boolean;
  aisle?: string;
  shelf?: string;
  gondola?: string;
  sector?: string;
  imageUrl?: string;
  active: boolean;
  updatedAt: string;
  syncStatus?: SyncStatus;
}

export interface Customer {
  id: Id;
  companyId: Id;
  name: string;
  document?: string;
  phone?: string;
  whatsapp?: string;
  address?: string;
  notes?: string;
  creditLimit: number;
  balance: number;
  lgpdAccepted?: boolean;
  active?: boolean;
  lastPurchaseAt?: string;
  updatedAt: string;
  syncStatus?: SyncStatus;
}

export interface SaleItem {
  id: Id;
  saleId: Id;
  productId: Id;
  productName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
  cost: number;
}

export interface Payment {
  id: Id;
  saleId: Id;
  method: PaymentMethod;
  amount: number;
  change?: number;
}

export interface Sale {
  id: Id;
  companyId: Id;
  number: string;
  operatorId: Id;
  operatorName: string;
  customerId?: Id;
  customerName?: string;
  items: SaleItem[];
  payments: Payment[];
  subtotal: number;
  discount: number;
  total: number;
  profit: number;
  notes?: string;
  status: SaleStatus;
  fiscalStatus?: FiscalStatus;
  fiscalDocumentId?: Id;
  accessKey?: string;
  xmlPath?: string;
  danfeUrl?: string;
  fiscalErrorMessage?: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
}

export interface CashRegister {
  id: Id;
  companyId: Id;
  operatorId: Id;
  operatorName: string;
  openedAt: string;
  closedAt?: string;
  openingAmount: number;
  expectedAmount: number;
  countedAmount?: number;
  difference?: number;
  closingNotes?: string;
  status: "open" | "closed";
}

export interface CashMovement {
  id: Id;
  cashRegisterId: Id;
  type: CashMovementType;
  description: string;
  amount: number;
  createdAt: string;
}

export interface SyncQueueItem {
  id: Id;
  companyId: Id;
  entity: "product" | "customer" | "sale" | "cash_register" | "cash_movement" | "settings";
  entityId: Id;
  operation: "create" | "update" | "delete";
  payload: unknown;
  attempts: number;
  lastError?: string;
  status: SyncStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardMetrics {
  dailyRevenue: number;
  monthlyRevenue: number;
  estimatedProfit: number;
  averageTicket: number;
  salesCount: number;
  lowStockCount: number;
  openCustomersCount?: number;
  openCustomersBalance?: number;
  cashBalance: number;
  syncPending: number;
  topProducts: Array<{ name: string; quantity: number; revenue: number }>;
  salesChart: Array<{ label: string; value: number }>;
}

export interface License {
  id: Id;
  companyId: Id;
  key: string;
  status: LicenseStatus;
  validUntil: string;
  demoMode: boolean;
  cloudEnabled?: boolean;
  fiscalEnabled?: boolean;
  pixEnabled?: boolean;
  mobileEnabled?: boolean;
  intelligenceEnabled?: boolean;
  ownerEmail?: string;
  activatedAt?: string;
}

export interface PixConfig {
  id: Id;
  companyId: Id;
  enabled: boolean;
  mode: PixConfigMode;
  key: string;
  keyType: PixKeyType;
  receiverName: string;
  city: string;
  provider?: string;
  apiKey?: string;
  webhookUrl?: string;
  updatedAt: string;
}

export interface PixCharge {
  id: Id;
  companyId: Id;
  saleId?: Id;
  amount: number;
  status: PixChargeStatus;
  qrCodePayload: string;
  provider?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
}

export interface PixProvider {
  getPixConfig(): Promise<PixConfig>;
  savePixConfig(config: Partial<PixConfig>): Promise<PixConfig>;
  createChargeMock(amount: number, saleId?: string): Promise<PixCharge>;
  getChargeStatusMock(chargeId: string): Promise<PixChargeStatus>;
  cancelChargeMock(chargeId: string): Promise<PixCharge>;
  generateStaticQrCodePayload(config?: Partial<PixConfig>): Promise<string>;
  generateDynamicQrCodeMock(amount: number, saleId?: string): Promise<PixCharge>;
}

export interface FiscalConfig {
  id: Id;
  companyId: Id;
  enabled: boolean;
  environment: FiscalEnvironment;
  uf: string;
  municipality: string;
  taxRegime: string;
  stateRegistration: string;
  csc: string;
  cscId: string;
  series: string;
  nextNumber: number;
  defaultCfop: string;
  defaultNcm: string;
  defaultCstCsosn: string;
  certificatePath?: string;
  certificatePassword?: string;
  provider?: string;
  apiKey?: string;
  updatedAt: string;
}

export interface FiscalDocument {
  id: Id;
  companyId: Id;
  saleId: Id;
  status: FiscalStatus;
  documentNumber?: number;
  series?: string;
  accessKey?: string;
  xmlPath?: string;
  danfeUrl?: string;
  errorMessage?: string;
  environment: FiscalEnvironment;
  createdAt: string;
  updatedAt: string;
}

export interface FiscalCompanyData {
  name: string;
  document: string;
  stateRegistration?: string;
  city?: string;
  state?: string;
}

export interface FiscalCustomerData {
  name?: string;
  document?: string;
}

export interface FiscalProductData {
  productId: Id;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
  ncm?: string;
  cfop?: string;
  cstCsosn?: string;
}

export interface FiscalProvider {
  getFiscalConfig(): Promise<FiscalConfig>;
  saveFiscalConfig(config: Partial<FiscalConfig>): Promise<FiscalConfig>;
  validateFiscalConfig(config?: Partial<FiscalConfig>): Promise<{ valid: boolean; errors: string[] }>;
  prepareNfcePayload(sale: Sale): Promise<unknown>;
  issueNfceMock(saleId: string): Promise<FiscalDocument>;
  cancelFiscalDocumentMock(documentId: string): Promise<FiscalDocument>;
  getFiscalStatusMock(documentId: string): Promise<FiscalStatus>;
}
