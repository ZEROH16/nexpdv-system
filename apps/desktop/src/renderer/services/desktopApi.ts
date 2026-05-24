import type {
  CashRegister,
  CashMovement,
  Company,
  Customer,
  DashboardMetrics,
  FiscalConfig,
  FiscalDocument,
  FiscalStatus,
  License,
  LicenseCheckResult,
  PaymentMethod,
  PixCharge,
  PixChargeStatus,
  PixConnectionStatus,
  PixConfig,
  Product,
  ProductStockMovement,
  ProductStockMovementType,
  Sale
} from "@nexpdv/shared";

export interface ProductListResponse {
  data: Product[];
  total: number;
}

export interface CartInput {
  customerId?: string;
  notes?: string;
  discount?: number;
  highDiscountAuthorizationToken?: string;
  storeCreditAuthorizationToken?: string;
  pixChargeId?: string;
  items: Array<{ productId?: string; quantity: number; discount?: number; description?: string; unitPrice?: number; cost?: number; category?: string; notes?: string; custom?: boolean }>;
  payments: Array<{ method: PaymentMethod; amount: number }>;
}

export interface CheckoutResponse extends Sale {
  receiptHtml: string;
}

export interface SyncState {
  online: boolean;
  running: boolean;
  pending: number;
  lastSyncAt?: string;
  lastError?: string;
}

export interface UpdateState {
  enabled: boolean;
  channel: "stable" | "beta" | "dev";
  provider: "github";
  owner: string;
  repo: string;
  currentVersion: string;
  status: "disabled" | "idle" | "checking" | "available" | "not_available" | "downloading" | "downloaded" | "installing" | "error";
  version?: string;
  releaseDate?: string;
  releaseNotes?: string;
  progress?: number;
  message: string;
  checkedAt?: string;
}

export interface CloudApiStatus {
  apiUrl?: string;
  source: "programData" | "env" | "local" | "default" | "devFallback" | "missing";
  sourceLabel: string;
  programDataPath: string;
  localConfigPath: string;
  productionReady: boolean;
  message: string;
  lastError?: string;
  health?: {
    status?: string;
    product?: string;
    version?: string;
    environment?: string;
    database?: string;
    time?: string;
  };
}

export interface LicenseGuardState {
  allowed: boolean;
  status: "active" | "blocked" | "expired" | "missing" | "invalid" | "offline_grace" | "offline_expired" | "device_unauthorized";
  connection: "online" | "offline" | "not_configured" | "local";
  message: string;
  checkedAt?: string;
  lastOnlineValidatedAt?: string;
  offlineGraceEndsAt?: string;
}

export interface CashSummary {
  cashRegister?: CashRegister;
  salesTotal: number;
  incomeTotal: number;
  expenseTotal: number;
  withdrawalTotal: number;
  expectedAmount: number;
  recentMovements: CashMovement[];
}

export interface SystemState {
  activated: boolean;
  ownerOnboardingRequired: boolean;
  ownerEmail?: string;
  devUsersEnabled: boolean;
  appVersion: string;
  cloudEnabled: boolean;
  allowSalesWithoutCashRegister: boolean;
  usePermissions: boolean;
  locationControl: boolean;
  blockNegativeStock: boolean;
  automaticBackupEnabled: boolean;
  backupPath: string;
  receiptWidthMm: 58 | 80;
  receiptPrinterName: string;
  receiptFooterMessage: string;
  receiptAutoPrint: boolean;
  company: Partial<Company>;
  licenseGuard: LicenseGuardState;
  license?: License & {
    cloudEnabled?: boolean;
    fiscalEnabled?: boolean;
    pixEnabled?: boolean;
    mobileEnabled?: boolean;
    intelligenceEnabled?: boolean;
  };
}

export interface CustomerOpenAccount {
  id: string;
  name: string;
  phone?: string;
  whatsapp?: string;
  balance: number;
  creditLimit: number;
  lastPurchaseAt?: string;
  status: string;
}

export interface CustomerOpenSummary {
  totalReceivable: number;
  overdueCount: number;
  openCustomers: CustomerOpenAccount[];
  topDebtors: CustomerOpenAccount[];
}

export interface AuditEntry {
  id: string;
  action: string;
  actor: string;
  details?: string;
  createdAt: string;
}

export interface SecurityState {
  users: Array<{ id: string; name: string; username: string; email?: string; phone?: string; role: string; roleId?: string; roleName: string; sector: string; active: boolean; notes?: string; lastAccessAt?: string; permissions?: string[]; inheritedPermissions?: string[]; addedPermissions?: string[]; removedPermissions?: string[] }>;
  roles: Array<{ id: string; name: string; code: string; level: number; active: boolean; permissions: string[] }>;
  permissions: Array<{ key: string; label: string }>;
  sectors: Array<{ name: string; description: string; people: number }>;
}

export interface SecuritySettings {
  requireLoginOnStart: boolean;
  allowQuickPin: boolean;
  requireManagerAuthorization: boolean;
  allowMultipleOperators: boolean;
  autoLockEnabled: boolean;
  autoLockMinutes: number;
  sessionTimeoutMinutes: number;
  rememberLastOperator: boolean;
}

export interface AuthSession {
  id: string;
  userId: string;
  userName: string;
  role: string;
  roleName: string;
  operatorId: string;
  operatorName: string;
  loginAt: string;
  logoutAt?: string;
  active: boolean;
  locked: boolean;
}

export interface AuthState {
  user?: SecurityState["users"][number];
  session?: AuthSession;
  settings: SecuritySettings;
  lastOperatorLogin?: string;
}

export interface SaveUserInput {
  id?: string;
  name: string;
  username: string;
  email?: string;
  phone?: string;
  roleId: string;
  sector?: string;
  pin?: string;
  password?: string;
  active?: boolean;
  notes?: string;
  permissionOverrides?: Array<{ permission: string; effect: "allow" | "deny" }>;
}

export interface OwnerOnboardingInput {
  name: string;
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
  pin: string;
  confirmPin: string;
}

export interface SaveRoleInput {
  id?: string;
  name: string;
  code?: string;
  level?: number;
  active?: boolean;
  permissions: string[];
}

export interface BackupState {
  backupPath: string;
  automaticBackupEnabled: boolean;
  lastBackupAt?: string;
}

export interface ThermalPrinterInfo {
  name: string;
  displayName: string;
  description?: string;
}

export interface ReceiptPrintContext {
  saleId?: string;
  saleNumber?: string;
  reason?: "sale" | "reprint" | "test";
}

export const desktopApi = {
  dashboard: () => window.nexpdv.dashboard.get<DashboardMetrics>(),
  products: {
    list: (query?: { search?: string; lowStock?: boolean; active?: "active" | "inactive" | "all"; categoryId?: string; expiringDays?: number; page?: number; pageSize?: number }) =>
      window.nexpdv.products.list<ProductListResponse>(query),
    save: (product: Partial<Product>) => window.nexpdv.products.save<Product>(product),
    stockMovement: (input: { productId: string; type: ProductStockMovementType; quantity: number; reason?: string }) =>
      window.nexpdv.products.stockMovement<Product>(input),
    stockMovements: (productId?: string) => window.nexpdv.products.stockMovements<ProductStockMovement[]>(productId),
    categories: () => window.nexpdv.products.categories<Array<{ id: string; name: string; color: string }>>(),
    importCsv: (csv: string) => window.nexpdv.products.importCsv<{ imported: number }>(csv)
  },
  customers: {
    list: (search?: string) => window.nexpdv.customers.list<Customer[]>(search),
    save: (customer: Partial<Customer>) => window.nexpdv.customers.save<Customer>(customer),
    delete: (customerId: string) => window.nexpdv.customers.delete<Customer>(customerId),
    payment: (input: { customerId: string; amount: number }) => window.nexpdv.customers.payment<Customer>(input),
    openSummary: () => window.nexpdv.customers.openSummary<CustomerOpenSummary>()
  },
  sales: {
    checkout: (input: CartInput) => window.nexpdv.sales.checkout<CheckoutResponse>(input),
    list: (filters?: { start?: string; end?: string; search?: string }) => window.nexpdv.sales.list<Sale[]>(filters),
    cancel: (input: string | { saleId: string; login?: string; password?: string; pin?: string }) => window.nexpdv.sales.cancel<Sale>(input),
    removeCancelled: (input: { saleId: string; login?: string; password?: string; pin?: string }) => window.nexpdv.sales.removeCancelled<{ removed: boolean }>(input),
    receipt: (saleId: string) => window.nexpdv.sales.receipt<string>(saleId)
  },
  cash: {
    current: () => window.nexpdv.cash.current<CashRegister | undefined>(),
    summary: () => window.nexpdv.cash.summary<CashSummary>(),
    open: (openingAmount: number) => window.nexpdv.cash.open<CashRegister>(openingAmount),
    movement: (input: { type: "income" | "expense" | "withdrawal"; description: string; amount: number }) =>
      window.nexpdv.cash.movement<CashRegister>(input),
    close: (input: { cashRegisterId: string; countedAmount: number; closingNotes?: string }) => window.nexpdv.cash.close<CashRegister>(input)
  },
  sync: {
    status: () => window.nexpdv.sync.status<SyncState>(),
    flush: () => window.nexpdv.sync.flush<SyncState>(),
    onStatus: window.nexpdv.sync.onStatus
  },
  updates: {
    status: () => window.nexpdv.updates.status<UpdateState>(),
    check: () => window.nexpdv.updates.check<UpdateState>(),
    download: () => window.nexpdv.updates.download<UpdateState>(),
    install: () => window.nexpdv.updates.install<UpdateState>(),
    remindLater: () => window.nexpdv.updates.remindLater<UpdateState>(),
    onStatus: window.nexpdv.updates.onStatus
  },
  license: {
    check: () => window.nexpdv.license.check<LicenseCheckResult>(),
    validate: () => window.nexpdv.license.validate<LicenseGuardState>(),
    onStatus: window.nexpdv.license.onStatus
  },
  auth: {
    state: () => window.nexpdv.auth.state<AuthState>(),
    login: (input: { login: string; password?: string; pin?: string; rememberOperator?: boolean }) => window.nexpdv.auth.login<AuthState>(input),
    logout: (sessionId?: string) => window.nexpdv.auth.logout<AuthState>(sessionId),
    lock: () => window.nexpdv.auth.lock<AuthState>(),
    unlock: (input: { login?: string; password?: string; pin?: string }) => window.nexpdv.auth.unlock<AuthState>(input),
    switchOperator: (input: { login: string; password?: string; pin?: string; rememberOperator?: boolean }) => window.nexpdv.auth.switchOperator<AuthState>(input),
    authorize: (input: { login?: string; password?: string; pin?: string; permission?: string; requireManager?: boolean }) =>
      window.nexpdv.auth.authorize<{ ok: boolean; user?: SecurityState["users"][number]; message: string; token?: string }>(input),
    securitySettings: () => window.nexpdv.auth.securitySettings<SecuritySettings>(),
    saveSecuritySettings: (input: Partial<SecuritySettings>) => window.nexpdv.auth.saveSecuritySettings<SecuritySettings>(input),
    saveUser: (input: SaveUserInput) => window.nexpdv.auth.saveUser<SecurityState["users"][number]>(input),
    setUserActive: (input: { userId: string; active: boolean }) => window.nexpdv.auth.setUserActive<SecurityState["users"][number]>(input),
    resetPassword: (input: { userId: string; password: string }) => window.nexpdv.auth.resetPassword<SecurityState["users"][number]>(input),
    resetPin: (input: { userId: string; pin: string }) => window.nexpdv.auth.resetPin<SecurityState["users"][number]>(input),
    saveRole: (input: SaveRoleInput) => window.nexpdv.auth.saveRole<SecurityState["roles"][number]>(input),
    duplicateRole: (roleId: string) => window.nexpdv.auth.duplicateRole<SecurityState["roles"][number]>(roleId),
    setRoleActive: (input: { roleId: string; active: boolean }) => window.nexpdv.auth.setRoleActive<SecurityState["roles"][number]>(input),
    resetRoleDefaults: (roleId: string) => window.nexpdv.auth.resetRoleDefaults<SecurityState["roles"][number]>(roleId)
  },
  system: {
    state: () => window.nexpdv.system.state<SystemState>(),
    activate: (input: { ownerEmail: string; licenseKey: string; companyName: string }) => window.nexpdv.system.activate<SystemState>(input),
    createOwnerAccess: (input: OwnerOnboardingInput) => window.nexpdv.system.createOwnerAccess<SecurityState["users"][number]>(input),
    settings: (input: { usePermissions?: boolean; locationControl?: boolean; allowSalesWithoutCashRegister?: boolean; blockNegativeStock?: boolean; automaticBackupEnabled?: boolean; backupPath?: string; receiptWidthMm?: 58 | 80; receiptPrinterName?: string; receiptFooterMessage?: string; receiptAutoPrint?: boolean }) => window.nexpdv.system.settings<SystemState>(input),
    cloud: (input: { cloudKey: string; ownerEmail: string }) => window.nexpdv.system.cloud<SystemState>(input),
    company: (input: Partial<Company>) => window.nexpdv.system.company<Partial<Company>>(input),
    manager: (password: string) => window.nexpdv.system.manager<{ ok: boolean; role?: "manager" | "admin" | "owner"; message: string }>(password),
    authorize: (input: { password: string; permission: string }) => window.nexpdv.system.authorize<{ ok: boolean; message: string }>(input),
    audit: () => window.nexpdv.system.audit<AuditEntry[]>(),
    auditEvent: (input: { action: string; actor?: string; details?: string }) => window.nexpdv.system.auditEvent<{ ok: true }>(input),
    security: () => window.nexpdv.system.security<SecurityState>(),
    backupState: () => window.nexpdv.system.backupState<BackupState>(),
    backupExport: () => window.nexpdv.system.backupExport<BackupState & { filePath: string }>(),
    backupRestore: (filePath: string) => window.nexpdv.system.backupRestore<BackupState>(filePath),
    openExternal: (url: string) => window.nexpdv.system.openExternal<{ ok: true }>(url),
    copyText: (text: string) => window.nexpdv.system.copyText<{ ok: true }>(text),
    cloudApiStatus: () => window.nexpdv.system.cloudApiStatus<CloudApiStatus>(),
    cloudApiTest: (apiUrl?: string) => window.nexpdv.system.cloudApiTest<CloudApiStatus>({ apiUrl }),
    cloudApiSave: (input: { apiUrl: string; login?: string; password?: string; pin?: string }) => window.nexpdv.system.cloudApiSave<CloudApiStatus>(input),
    cloudApiReset: (input: { login?: string; password?: string; pin?: string }) => window.nexpdv.system.cloudApiReset<CloudApiStatus>(input),
    resetLocal: () => window.nexpdv.system.resetLocal<{ ok: boolean; restarting: boolean; markerPath: string }>()
  },
  pix: {
    getPixConfig: () => window.nexpdv.pix.config<PixConfig>(),
    savePixConfig: (input: Partial<PixConfig>) => window.nexpdv.pix.saveConfig<PixConfig>(input),
    testConnection: () => window.nexpdv.pix.testConnection<{ status: PixConnectionStatus; message: string }>(),
    createCharge: (input: { amount: number; saleId?: string }) => window.nexpdv.pix.createCharge<PixCharge>(input),
    getCharge: (input: string | { chargeId: string; refreshProvider?: boolean }) => window.nexpdv.pix.charge<PixCharge>(input),
    cancelCharge: (chargeId: string) => window.nexpdv.pix.cancelCharge<PixCharge>(chargeId),
    renderQrCode: (payload: string) => window.nexpdv.pix.renderQr<{ dataUrl: string }>(payload),
    createChargeMock: (input: { amount: number; saleId?: string }) => window.nexpdv.pix.createChargeMock<PixCharge>(input),
    getChargeStatusMock: (chargeId: string) => window.nexpdv.pix.chargeStatusMock<PixChargeStatus>(chargeId),
    cancelChargeMock: (chargeId: string) => window.nexpdv.pix.cancelChargeMock<PixCharge>(chargeId),
    confirmChargeMock: (chargeId: string) => window.nexpdv.pix.confirmChargeMock<PixCharge>(chargeId),
    generateStaticQrCodePayload: () => window.nexpdv.pix.staticPayload<string>(),
    generateDynamicQrCodeMock: (input: { amount: number; saleId?: string }) => window.nexpdv.pix.dynamicPayloadMock<string>(input)
  },
  fiscal: {
    getFiscalConfig: () => window.nexpdv.fiscal.config<FiscalConfig>(),
    saveFiscalConfig: (input: Partial<FiscalConfig>) => window.nexpdv.fiscal.saveConfig<FiscalConfig>(input),
    validateFiscalConfig: () => window.nexpdv.fiscal.validateConfig<{ valid: boolean; errors: string[] }>(),
    issueNfceMock: (saleId: string) => window.nexpdv.fiscal.issueNfceMock<FiscalDocument>(saleId),
    cancelFiscalDocumentMock: (documentId: string) => window.nexpdv.fiscal.cancelDocumentMock<FiscalDocument>(documentId),
    getFiscalStatusMock: (documentId: string) => window.nexpdv.fiscal.statusMock<FiscalStatus>(documentId)
  },
  printers: {
    list: () => window.nexpdv.printers.list<ThermalPrinterInfo[]>(),
    test: (input?: { printerName?: string; widthMm?: 58 | 80 }) => window.nexpdv.printers.test<{ ok: true }>(input),
    openDrawer: (input?: { printerName?: string; widthMm?: 58 | 80 }) => window.nexpdv.printers.openDrawer<{ ok: true; mode: "escpos" }>(input)
  },
  receipt: {
    print: (html: string, context?: ReceiptPrintContext) => window.nexpdv.receipt.print<{ ok: true }>({ html, context })
  }
};
