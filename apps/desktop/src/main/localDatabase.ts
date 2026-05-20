import { app } from "electron";
import initSqlJs, { type Database as SqlJsDatabase, type Statement as SqlJsStatement } from "sql.js";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  calculateMargin,
  calculateSaleTotals,
  ensureProductCanSell,
  roundMoney,
  saleNumber,
  type CashRegister,
  type CashMovement,
  type Company,
  type Customer,
  type DashboardMetrics,
  type FiscalConfig,
  type FiscalDocument,
  type License,
  type Payment,
  type PaymentMethod,
  type PixCharge,
  type PixChargeStatus,
  type PixConfig,
  type PixConnectionStatus,
  type Product,
  type ProductStockMovement,
  type ProductStockMovementType,
  type Sale,
  type SaleItem,
  type SyncQueueItem
} from "@nexpdv/shared";
import { activateLicenseOnline } from "./cloudLicenseService";
import { FiscalService } from "./fiscalService";
import { assertLicensedModule, checkStoredLicense, createLocalLicenseActivation, isLocalActivationKey, normalizeStoredLicense, serializeFeatures, type LocalLicenseRecord } from "./licenseService";
import { adminRoleCodes, hashPassword, hashPin, legacyHashPassword, managerRoleCodes, normalizeLogin, PERMISSIONS, permissionLabels, type PermissionKey } from "./permissionService";
import { PixService } from "./pixService";
import { roleSeeds } from "./roleService";

const COMPANY_ID = "cmp_nexpdv_demo";
const OWNER_ID = "usr_dono_demo";
const ADMIN_ID = "usr_admin_demo";
const MANAGER_ID = "usr_gerente_demo";
const OPERATOR_ID = "usr_operador_demo";
const OPERATOR_NAME = "Operador Caixa";
const DEV_USER_IDS = [OWNER_ID, ADMIN_ID, MANAGER_ID, OPERATOR_ID];

const desktopDevUsersEnabled = (): boolean => process.env.NODE_ENV === "development" && process.env.DESKTOP_DEV_USERS === "true";

const userSeeds = [
  { id: OWNER_ID, username: "dono", name: "Dono NexPDV", email: "dono@nexpdv.com.br", phone: "", roleId: "role_owner", role: "owner", sector: "Gerencia", password: "123456", pin: "2026", notes: "Usuario dono inicial" },
  { id: ADMIN_ID, username: "admin", name: "Administrador NexPDV", email: "admin@nexpdv.com.br", phone: "", roleId: "role_admin", role: "admin", sector: "Administrativo", password: "123456", pin: "9999", notes: "Administrador local inicial" },
  { id: MANAGER_ID, username: "gerente", name: "Gerente NexPDV", email: "gerente@nexpdv.com.br", phone: "", roleId: "role_manager", role: "manager", sector: "Gerencia", password: "123456", pin: "1234", notes: "Gerente local inicial" },
  { id: OPERATOR_ID, username: "operador", name: OPERATOR_NAME, email: "operador@nexpdv.com.br", phone: "", roleId: "role_cashier", role: "cashier", sector: "Caixa", password: "operador123", pin: "0000", notes: "Operador padrao do caixa" }
];

type QueryParams = Record<string, unknown> | unknown[];

interface PreparedStatement {
  run: (...args: unknown[]) => void;
  get: <T = unknown>(...args: unknown[]) => T | undefined;
  all: <T = unknown>(...args: unknown[]) => T[];
}

interface Db {
  exec: (sql: string) => void;
  prepare: (sql: string) => PreparedStatement;
  transaction: <T extends (...args: any[]) => any>(fn: T) => T;
  export: () => Uint8Array;
}

export interface ProductQuery {
  search?: string;
  lowStock?: boolean;
  active?: "active" | "inactive" | "all";
  categoryId?: string;
  expiringDays?: number;
  page?: number;
  pageSize?: number;
}

export interface ProductStockMovementInput {
  productId: string;
  type: ProductStockMovementType;
  quantity: number;
  reason?: string;
}

export interface CheckoutInput {
  customerId?: string;
  notes?: string;
  discount?: number;
  highDiscountAuthorizationToken?: string;
  storeCreditAuthorizationToken?: string;
  pixChargeId?: string;
  items: Array<{
    productId?: string;
    quantity: number;
    discount?: number;
    description?: string;
    unitPrice?: number;
    cost?: number;
    category?: string;
    notes?: string;
    custom?: boolean;
  }>;
  payments: Array<{ method: PaymentMethod; amount: number }>;
}

export interface CashCloseInput {
  cashRegisterId: string;
  countedAmount: number;
  closingNotes?: string;
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

export interface ActivationInput {
  ownerEmail: string;
  licenseKey: string;
  companyName: string;
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

export interface CloudActivationInput {
  cloudKey: string;
  ownerEmail: string;
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
  automaticBackupEnabled: boolean;
  backupPath: string;
  blockNegativeStock: boolean;
  receiptWidthMm: 58 | 80;
  receiptPrinterName: string;
  receiptFooterMessage: string;
  receiptAutoPrint: boolean;
  company: Partial<Company>;
  license?: License & {
    cloudEnabled?: boolean;
    fiscalEnabled?: boolean;
    pixEnabled?: boolean;
    mobileEnabled?: boolean;
    intelligenceEnabled?: boolean;
  };
}

export interface UserAccount {
  id: string;
  name: string;
  username: string;
  email?: string;
  phone?: string;
  role: string;
  roleId?: string;
  roleName: string;
  sector: string;
  active: boolean;
  notes?: string;
  lastAccessAt?: string;
  permissions?: PermissionKey[];
  inheritedPermissions?: PermissionKey[];
  addedPermissions?: PermissionKey[];
  removedPermissions?: PermissionKey[];
}

export interface RoleAccount {
  id: string;
  name: string;
  code: string;
  level: number;
  active: boolean;
  permissions: PermissionKey[];
}

export interface SecurityState {
  users: UserAccount[];
  roles: RoleAccount[];
  permissions: Array<{ key: PermissionKey; label: string }>;
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
  user?: UserAccount;
  session?: AuthSession;
  settings: SecuritySettings;
  lastOperatorLogin?: string;
}

export interface AuthLoginInput {
  login: string;
  password?: string;
  pin?: string;
  rememberOperator?: boolean;
}

export interface AuthCredentialInput {
  login?: string;
  password?: string;
  pin?: string;
  permission?: PermissionKey;
  requireManager?: boolean;
}

export interface AuthAuthorizationResult {
  ok: boolean;
  user?: UserAccount;
  message: string;
  token?: string;
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
  permissionOverrides?: Array<{ permission: PermissionKey; effect: "allow" | "deny" }>;
}

export interface SaveRoleInput {
  id?: string;
  name: string;
  code?: string;
  level?: number;
  active?: boolean;
  permissions: PermissionKey[];
}

export interface AuthLogEntry {
  id: string;
  userId?: string;
  action: string;
  success: boolean;
  details?: string;
  ip?: string;
  machineId?: string;
  deviceName?: string;
  createdAt: string;
}

export interface BackupState {
  backupPath: string;
  automaticBackupEnabled: boolean;
  lastBackupAt?: string;
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

export interface AuditEventInput {
  action?: string;
  actor?: string;
  details?: string;
}

export interface AuditEntry {
  id: string;
  action: string;
  actor: string;
  details?: string;
  createdAt: string;
}

const now = () => new Date().toISOString();
const uid = (prefix: string) => `${prefix}_${randomUUID()}`;
const toBoolean = (value: unknown): boolean => value === true || value === 1 || value === "1" || value === "true";

const normalizeValue = (value: unknown) => {
  if (value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  return value as string | number | null | Uint8Array;
};

const extractNamedParams = (sql: string): Set<string> =>
  new Set(Array.from(sql.matchAll(/[@:$][A-Za-z_][A-Za-z0-9_]*/g), ([match]) => match));

const normalizeObjectParam = (input: Record<string, unknown>, namedParams: Set<string>) => {
  const entries = Object.entries(input).flatMap(([key, value]) => {
    const names = key.startsWith("@") || key.startsWith(":") || key.startsWith("$") ? [key] : [`@${key}`, `:${key}`, `$${key}`];
    return names.filter((name) => namedParams.size === 0 || namedParams.has(name)).map((name) => [name, normalizeValue(value)] as const);
  });
  return Object.fromEntries(entries);
};

const normalizeArgs = (args: unknown[], namedParams = new Set<string>()): QueryParams | undefined => {
  if (!args.length) return undefined;
  if (args.length === 1 && Array.isArray(args[0])) {
    return args[0].map(normalizeValue);
  }
  if (args.length === 1 && args[0] && typeof args[0] === "object") {
    return normalizeObjectParam(args[0] as Record<string, unknown>, namedParams);
  }
  return args.map(normalizeValue);
};

const normalizeRow = (row: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value === undefined ? null : value]));

class SqlJsPreparedStatement implements PreparedStatement {
  private readonly namedParams: Set<string>;

  constructor(
    private readonly db: SqlJsDatabase,
    private readonly sql: string,
    private readonly markDirty: () => void
  ) {
    this.namedParams = extractNamedParams(sql);
  }

  run(...args: unknown[]): void {
    const statement = this.prepare(args);
    try {
      while (statement.step()) {
        // Consume any rows returned by SQLite pragmas or CTEs.
      }
      this.markDirty();
    } finally {
      statement.free();
    }
  }

  get<T = unknown>(...args: unknown[]): T | undefined {
    const statement = this.prepare(args);
    try {
      return statement.step() ? (normalizeRow(statement.getAsObject()) as T) : undefined;
    } finally {
      statement.free();
    }
  }

  all<T = unknown>(...args: unknown[]): T[] {
    const statement = this.prepare(args);
    const rows: T[] = [];
    try {
      while (statement.step()) {
        rows.push(normalizeRow(statement.getAsObject()) as T);
      }
      return rows;
    } finally {
      statement.free();
    }
  }

  private prepare(args: unknown[]): SqlJsStatement {
    const statement = this.db.prepare(this.sql);
    const params = normalizeArgs(args, this.namedParams);
    if (params) statement.bind(params as any);
    return statement;
  }
}

class SqlJsAdapter implements Db {
  private transactionDepth = 0;
  private dirty = false;

  constructor(
    private readonly db: SqlJsDatabase,
    private readonly persist: () => void
  ) {}

  exec(sql: string): void {
    this.db.exec(sql);
    this.markDirty();
  }

  prepare(sql: string): PreparedStatement {
    return new SqlJsPreparedStatement(this.db, sql, () => this.markDirty());
  }

  transaction<T extends (...args: any[]) => any>(fn: T): T {
    return ((...args: Parameters<T>) => {
      this.db.exec("BEGIN");
      this.transactionDepth += 1;
      try {
        const result = fn(...args);
        this.transactionDepth -= 1;
        this.db.exec("COMMIT");
        this.flushIfNeeded();
        return result;
      } catch (error) {
        this.transactionDepth -= 1;
        this.db.exec("ROLLBACK");
        if (this.transactionDepth === 0) this.dirty = false;
        throw error;
      }
    }) as T;
  }

  export(): Uint8Array {
    return this.db.export();
  }

  private markDirty(): void {
    if (this.transactionDepth > 0) {
      this.dirty = true;
      return;
    }
    this.persist();
  }

  private flushIfNeeded(): void {
    if (this.transactionDepth === 0 && this.dirty) {
      this.dirty = false;
      this.persist();
    }
  }
}

export class LocalDatabase {
  private db!: Db;
  private SQL?: Awaited<ReturnType<typeof initSqlJs>>;
  private authorizationTokens = new Map<string, { permission: PermissionKey; userId: string; expiresAt: number }>();

  constructor(private readonly dbPath = path.join(app.getPath("userData"), "nexpdv-local.db")) {}

  async initialize(): Promise<void> {
    const SQL = await initSqlJs({ locateFile: (file) => this.resolveSqlJsFile(file) });
    this.SQL = SQL;
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    const data = fs.existsSync(this.dbPath) ? fs.readFileSync(this.dbPath) : undefined;
    this.db = new SqlJsAdapter(new SQL.Database(data), () => this.persist());
    this.db.exec("PRAGMA foreign_keys = ON");
    this.createSchema();
    this.migrateSchema();
    this.seedInitialData();
    this.ensureLicenseStorage();
    this.ensureSecuritySeed();
    this.ensureDefaultSettings();
    this.runAutomaticBackupIfNeeded();
    this.persist();
  }

  listProducts(query: ProductQuery = {}): { data: Product[]; total: number } {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: string[] = ["p.company_id = @companyId"];
    const params: Record<string, unknown> = { companyId: COMPANY_ID, limit: pageSize, offset: (page - 1) * pageSize };

    if (query.search) {
      where.push("(p.name LIKE @search OR p.barcode LIKE @search OR p.sku LIKE @search)");
      params.search = `%${query.search}%`;
    }

    if (query.lowStock) {
      where.push("p.stock <= p.min_stock");
    }
    if (query.active === "active") {
      where.push("p.active = 1");
    } else if (query.active === "inactive") {
      where.push("p.active = 0");
    }
    if (query.categoryId) {
      where.push("p.category_id = @categoryId");
      params.categoryId = query.categoryId;
    }
    if (query.expiringDays !== undefined) {
      const limitDate = new Date(Date.now() + Math.max(1, Number(query.expiringDays)) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      where.push("p.expiration_date IS NOT NULL AND p.expiration_date <> '' AND p.expiration_date <= @expirationLimit");
      params.expirationLimit = limitDate;
    }

    const clause = where.join(" AND ");
    const data = this.db
      .prepare(
        `SELECT p.id, p.company_id as companyId, p.name, p.barcode, p.sku, p.category_id as categoryId,
          c.name as categoryName, p.brand, p.cost, p.price, p.margin, p.stock, p.min_stock as minStock,
          p.unit, p.expiration_date as expirationDate, p.location_enabled as locationEnabled,
          p.aisle, p.shelf, p.gondola, p.sector, p.image_url as imageUrl, p.active,
          p.updated_at as updatedAt, p.sync_status as syncStatus
        FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE ${clause}
        ORDER BY p.name
        LIMIT @limit OFFSET @offset`
      )
      .all(params) as Product[];

    const total = this.db.prepare(`SELECT COUNT(*) as total FROM products p WHERE ${clause}`).get(params) as { total: number };
    return { data, total: total.total };
  }

  upsertProduct(input: Partial<Product>): Product {
    this.assertCurrentPermission(input.id ? "edit_product" : "create_product");
    const id = input.id ?? uid("prd");
    const timestamp = now();
    const name = input.name?.trim();
    const barcode = input.barcode?.trim();
    const price = Number(input.price ?? 0);
    const cost = Number(input.cost ?? 0);
    const stock = Number(input.stock ?? 0);
    const minStock = Number(input.minStock ?? 0);
    if (!name) throw new Error("Informe o nome do produto.");
    if (!Number.isFinite(price) || price <= 0) throw new Error("Preco de venda invalido.");
    if (!Number.isFinite(cost) || cost < 0) throw new Error("Preco de custo invalido.");
    if (this.getSetting("block_negative_stock") === "true" && (stock < 0 || minStock < 0)) {
      throw new Error("Estoque negativo bloqueado nas configuracoes.");
    }
    if (barcode) {
      const duplicate = this.db.prepare("SELECT id FROM products WHERE company_id = ? AND barcode = ? AND id <> ? LIMIT 1").get(COMPANY_ID, barcode, id);
      if (duplicate) throw new Error("Ja existe produto com este codigo de barras.");
    }
    const margin = calculateMargin(Number(input.cost ?? 0), Number(input.price ?? 0));
    const existing = this.getProductById(id);
    const product: Product = {
      id,
      companyId: COMPANY_ID,
      name,
      barcode,
      sku: input.sku?.trim(),
      categoryId: input.categoryId ?? ((input as any).categoryName ? this.ensureCategory(String((input as any).categoryName)) : undefined),
      brand: input.brand?.trim(),
      cost,
      price,
      margin,
      stock,
      minStock,
      unit: input.unit || "UN",
      expirationDate: input.expirationDate,
      locationEnabled: input.locationEnabled ?? false,
      aisle: input.aisle?.trim(),
      shelf: input.shelf?.trim(),
      gondola: input.gondola?.trim(),
      sector: input.sector?.trim(),
      imageUrl: input.imageUrl,
      active: input.active ?? true,
      updatedAt: timestamp,
      syncStatus: "pending"
    };

    if (existing) {
      this.db
        .prepare(
          `UPDATE products SET name = @name, barcode = @barcode, sku = @sku, category_id = @categoryId,
            brand = @brand, cost = @cost, price = @price, margin = @margin, stock = @stock,
            min_stock = @minStock, unit = @unit, expiration_date = @expirationDate,
            location_enabled = @locationEnabled, aisle = @aisle, shelf = @shelf, gondola = @gondola,
            sector = @sector, image_url = @imageUrl, active = @active,
            updated_at = @updatedAt, sync_status = @syncStatus WHERE id = @id`
        )
        .run(product);
      this.enqueue("product", id, "update", product);
      this.recordAudit(existing.active && !product.active ? "produto inativado" : "produto alterado", this.getCurrentOperatorName(), product.name);
    } else {
      this.db
        .prepare(
          `INSERT INTO products (id, company_id, name, barcode, sku, category_id, brand, cost, price, margin,
            stock, min_stock, unit, expiration_date, location_enabled, aisle, shelf, gondola, sector, image_url, active, updated_at, sync_status)
          VALUES (@id, @companyId, @name, @barcode, @sku, @categoryId, @brand, @cost, @price, @margin,
            @stock, @minStock, @unit, @expirationDate, @locationEnabled, @aisle, @shelf, @gondola, @sector, @imageUrl, @active, @updatedAt, @syncStatus)`
        )
        .run(product);
      this.enqueue("product", id, "create", product);
      this.recordAudit("produto criado", this.getCurrentOperatorName(), product.name);
    }

    return this.getProductById(id)!;
  }

  importProductsFromCsv(csv: string): { imported: number } {
    const lines = csv.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const rows = lines.slice(1);
    let imported = 0;
    const run = this.db.transaction(() => {
      rows.forEach((line) => {
        const [name, barcode, sku, categoryName, brand, cost, price, stock, minStock, unit] = line.split(",").map((cell) => cell.trim());
        const categoryId = categoryName ? this.ensureCategory(categoryName) : undefined;
        this.upsertProduct({
          name,
          barcode,
          sku,
          categoryId,
          brand,
          cost: Number(cost || 0),
          price: Number(price || 0),
          stock: Number(stock || 0),
          minStock: Number(minStock || 0),
          unit: unit || "UN",
          active: true
        });
        imported += 1;
      });
    });
    run();
    return { imported };
  }

  adjustProductStock(input: ProductStockMovementInput): Product {
    this.assertCurrentPermission("edit_product");
    const product = this.getProductById(input.productId);
    if (!product) throw new Error("Produto nao encontrado.");
    const quantity = Number(input.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Informe uma quantidade valida.");
    const previousStock = Number(product.stock ?? 0);
    const deltaByType: Record<ProductStockMovementType, number> = {
      entry: quantity,
      exit: -quantity,
      adjustment: quantity - previousStock,
      loss: -quantity,
      expiration: -quantity
    };
    const newStock = roundMoney(previousStock + deltaByType[input.type]);
    if (this.getSetting("block_negative_stock") === "true" && newStock < 0) {
      throw new Error("Estoque negativo bloqueado nas configuracoes.");
    }
    const timestamp = now();
    const movement: ProductStockMovement = {
      id: uid("stk"),
      companyId: COMPANY_ID,
      productId: product.id,
      productName: product.name,
      type: input.type,
      quantity,
      previousStock,
      newStock,
      reason: input.reason?.trim(),
      operatorName: this.getCurrentOperatorName(),
      createdAt: timestamp
    };
    this.db
      .prepare(
        `INSERT INTO product_stock_movements (id, company_id, product_id, product_name, type, quantity,
          previous_stock, new_stock, reason, operator_name, created_at)
        VALUES (@id, @companyId, @productId, @productName, @type, @quantity,
          @previousStock, @newStock, @reason, @operatorName, @createdAt)`
      )
      .run(movement);
    this.db.prepare("UPDATE products SET stock = @stock, updated_at = @updatedAt, sync_status = 'pending' WHERE id = @id").run({
      id: product.id,
      stock: newStock,
      updatedAt: timestamp
    });
    const updated = this.getProductById(product.id)!;
    this.enqueue("product", updated.id, "update", updated);
    this.recordAudit("movimentacao estoque", movement.operatorName, `${product.name}: ${input.type} ${quantity} (${previousStock} -> ${newStock})`);
    return updated;
  }

  listProductStockMovements(productId?: string): ProductStockMovement[] {
    const where = ["company_id = @companyId"];
    const params: Record<string, unknown> = { companyId: COMPANY_ID };
    if (productId) {
      where.push("product_id = @productId");
      params.productId = productId;
    }
    return this.db
      .prepare(
        `SELECT id, company_id as companyId, product_id as productId, product_name as productName,
          type, quantity, previous_stock as previousStock, new_stock as newStock, reason,
          operator_name as operatorName, created_at as createdAt
        FROM product_stock_movements
        WHERE ${where.join(" AND ")}
        ORDER BY created_at DESC
        LIMIT 200`
      )
      .all(params) as ProductStockMovement[];
  }

  listCustomers(search = ""): Customer[] {
    return this.db
      .prepare(
        `SELECT id, company_id as companyId, name, document, phone, whatsapp, address, notes,
          credit_limit as creditLimit, balance, lgpd_accepted as lgpdAccepted, lgpd_accepted_at as lgpdAcceptedAt, active,
          last_purchase_at as lastPurchaseAt, updated_at as updatedAt, sync_status as syncStatus
        FROM customers
        WHERE company_id = @companyId AND active = 1 AND (@search = '' OR name LIKE @term OR document LIKE @term OR phone LIKE @term OR whatsapp LIKE @term)
        ORDER BY name`
      )
      .all({ companyId: COMPANY_ID, search, term: `%${search}%` }) as Customer[];
  }

  upsertCustomer(input: Partial<Customer>): Customer {
    this.assertCurrentPermission(input.id ? "edit_customer" : "create_customer");
    const id = input.id ?? uid("cus");
    const timestamp = now();
    const existingCustomer = this.getCustomerById(id);
    if (!input.name?.trim()) throw new Error("Informe o nome do cliente.");
    if (Number(input.creditLimit ?? 0) < 0 || Number(input.balance ?? 0) < 0) {
      throw new Error("Limite e saldo nao podem ser negativos.");
    }
    const lgpdAccepted = input.lgpdAccepted ?? false;
    const lgpdAcceptedAt = lgpdAccepted ? input.lgpdAcceptedAt ?? existingCustomer?.lgpdAcceptedAt ?? timestamp : undefined;
    const customer: Customer = {
      id,
      companyId: COMPANY_ID,
      name: input.name.trim(),
      document: input.document?.trim(),
      phone: input.phone?.trim(),
      whatsapp: input.whatsapp?.trim(),
      address: input.address?.trim(),
      notes: input.notes?.trim(),
      creditLimit: Number(input.creditLimit ?? 0),
      balance: Number(input.balance ?? 0),
      lgpdAccepted,
      lgpdAcceptedAt,
      active: input.active ?? true,
      lastPurchaseAt: input.lastPurchaseAt,
      updatedAt: timestamp,
      syncStatus: "pending"
    };
    const exists = this.db.prepare("SELECT id FROM customers WHERE id = ?").get(id);
    if (exists) {
      this.db
        .prepare(
          `UPDATE customers SET name = @name, document = @document, phone = @phone, whatsapp = @whatsapp,
          address = @address, notes = @notes, credit_limit = @creditLimit, balance = @balance,
          lgpd_accepted = @lgpdAccepted, lgpd_accepted_at = @lgpdAcceptedAt, active = @active, last_purchase_at = @lastPurchaseAt,
          updated_at = @updatedAt, sync_status = @syncStatus WHERE id = @id`
      )
        .run(customer);
      this.enqueue("customer", id, "update", customer);
      this.recordAudit("cliente editado", this.getCurrentOperatorName(), customer.name);
      if (!existingCustomer?.lgpdAccepted && customer.lgpdAccepted) {
        this.recordAudit("aceite LGPD", this.getCurrentOperatorName(), customer.name);
      }
    } else {
      this.db
        .prepare(
          `INSERT INTO customers (id, company_id, name, document, phone, whatsapp, address, notes, credit_limit, balance, lgpd_accepted, lgpd_accepted_at, active, last_purchase_at, updated_at, sync_status)
          VALUES (@id, @companyId, @name, @document, @phone, @whatsapp, @address, @notes, @creditLimit, @balance, @lgpdAccepted, @lgpdAcceptedAt, @active, @lastPurchaseAt, @updatedAt, @syncStatus)`
        )
        .run(customer);
      this.enqueue("customer", id, "create", customer);
      this.recordAudit("cliente criado", this.getCurrentOperatorName(), customer.name);
      if (customer.lgpdAccepted) this.recordAudit("aceite LGPD", this.getCurrentOperatorName(), customer.name);
    }
    return customer;
  }

  deleteCustomer(customerId: string): Customer {
    this.assertCurrentPermission("delete_customer");
    const customer = this.getCustomerById(customerId);
    if (!customer) throw new Error("Cliente nao encontrado.");
    const linkedSale = this.db.prepare("SELECT id FROM sales WHERE customer_id = ? LIMIT 1").get(customerId);
    const timestamp = now();
    this.db
      .prepare("UPDATE customers SET active = 0, updated_at = @updatedAt, sync_status = 'pending' WHERE id = @id")
      .run({ id: customerId, updatedAt: timestamp });
    const updated = { ...customer, active: false, updatedAt: timestamp, syncStatus: "pending" as const };
    this.enqueue("customer", customerId, "update", updated);
    this.recordAudit("cliente excluido/inativado", this.getCurrentOperatorName(), `${customer.name}${linkedSale ? " possui venda vinculada" : ""}`);
    return updated;
  }

  registerCustomerPayment(customerId: string, amount: number): Customer {
    this.assertCurrentPermission("edit_customer");
    const customer = this.getCustomerById(customerId);
    if (!customer) throw new Error("Cliente nao encontrado.");
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) throw new Error("Valor de pagamento invalido.");
    const timestamp = now();
    this.db
      .prepare("UPDATE customers SET balance = MAX(balance - @amount, 0), updated_at = @updatedAt, sync_status = 'pending' WHERE id = @id")
      .run({ id: customerId, amount: Math.max(0, amount), updatedAt: timestamp });
    const updated = this.getCustomerById(customerId)!;
    this.enqueue("customer", customerId, "update", updated);
    this.recordAudit("pagamento de cliente registrado", this.getCurrentOperatorName(), `${customer.name}: ${amount}`);
    return updated;
  }

  getCustomerOpenSummary(): CustomerOpenSummary {
    const openCustomers = this.db
      .prepare(
        `SELECT c.id, c.name, c.phone, c.whatsapp, c.balance, c.credit_limit as creditLimit,
          c.last_purchase_at as lastPurchaseAt,
          CASE WHEN c.balance > c.credit_limit AND c.credit_limit > 0 THEN 'Acima do limite' ELSE 'Em aberto' END as status
        FROM customers c
        WHERE c.company_id = @companyId AND c.active = 1 AND c.balance > 0
        ORDER BY c.balance DESC`
      )
      .all({ companyId: COMPANY_ID }) as CustomerOpenAccount[];
    const totalReceivable = roundMoney(openCustomers.reduce((sum, customer) => sum + customer.balance, 0));
    return {
      totalReceivable,
      overdueCount: openCustomers.filter((customer) => customer.creditLimit > 0 && customer.balance > customer.creditLimit).length,
      openCustomers,
      topDebtors: openCustomers.slice(0, 5)
    };
  }

  checkoutSale(input: CheckoutInput): Sale & { receiptHtml: string } {
    this.assertCurrentPermission("sell");
    if (!input.items.length) throw new Error("Adicione ao menos um item para finalizar a venda.");
    if (!input.payments.length) throw new Error("Informe uma forma de pagamento.");
    if (input.payments.some((payment) => payment.method === "pix")) {
      assertLicensedModule(this, "pix");
      const pixCharge = input.pixChargeId ? this.pixService().getChargeMock(input.pixChargeId) : undefined;
      if (!pixCharge) throw new Error("Cobranca Pix nao encontrada. Gere uma cobranca antes de finalizar.");
      if (pixCharge.status !== "paid") throw new Error("Pagamento Pix ainda nao confirmado.");
    }
    const createSale = this.db.transaction(() => {
      const cashRegister = this.ensureOpenCashRegister();
      const operator = this.getCurrentOperator();
      const timestamp = now();
      const saleId = uid("sal");
      const number = saleNumber();
      const saleItems: SaleItem[] = input.items.map((cartItem) => {
        if (cartItem.custom || !cartItem.productId) {
          const itemDiscount = Number(cartItem.discount ?? 0);
          const quantity = Number(cartItem.quantity || 1);
          const unitPrice = Number(cartItem.unitPrice ?? 0);
          if (quantity <= 0 || unitPrice <= 0) throw new Error("Produto diverso precisa de valor e quantidade validos.");
          if (itemDiscount < 0 || itemDiscount >= unitPrice * quantity) throw new Error("Desconto de item invalido.");
          const total = roundMoney(unitPrice * quantity - itemDiscount);
          return {
            id: uid("sit"),
            saleId,
            productId: uid("misc"),
            productName: cartItem.description?.trim() || "Produto diverso",
            quantity,
            unitPrice,
            discount: itemDiscount,
            total,
            cost: Number(cartItem.cost ?? 0)
          };
        }
        const product = this.getProductById(cartItem.productId);
        if (!product) throw new Error("Produto nao encontrado.");
        if (!product.active) throw new Error(`${product.name} esta inativo.`);
        ensureProductCanSell(product, cartItem.quantity);
        const itemDiscount = Number(cartItem.discount ?? 0);
        if (itemDiscount < 0 || itemDiscount >= product.price * cartItem.quantity) throw new Error("Desconto de item invalido.");
        const total = roundMoney(product.price * cartItem.quantity - itemDiscount);
        return {
          id: uid("sit"),
          saleId,
          productId: product.id,
          productName: product.name,
          quantity: cartItem.quantity,
          unitPrice: product.price,
          discount: itemDiscount,
          total,
          cost: product.cost
        };
      });

      const payments: Payment[] = input.payments.map((payment) => ({
        id: uid("pay"),
        saleId,
        method: payment.method,
        amount: Number(payment.amount),
        change: 0
      }));
      if (payments.some((payment) => payment.amount <= 0)) throw new Error("Valor de pagamento invalido.");
      const saleDiscount = Number(input.discount ?? 0);
      if (saleDiscount < 0) throw new Error("Desconto da venda invalido.");
      const totals = calculateSaleTotals(saleItems, payments, saleDiscount);
      if (saleDiscount > totals.subtotal) throw new Error("Desconto maior que o subtotal da venda.");
      const discountPercent = totals.subtotal > 0 ? (saleDiscount / totals.subtotal) * 100 : 0;
      if (discountPercent > 5.0001) {
        this.assertDiscountPermission("apply_high_discount", input.highDiscountAuthorizationToken);
      } else if (saleDiscount > 0) {
        this.assertDiscountPermission("apply_discount", input.highDiscountAuthorizationToken);
      }
      if (totals.paid < totals.total) {
        throw new Error("Pagamento insuficiente para finalizar a venda.");
      }
      const cashPayment = payments.find((payment) => payment.method === "cash");
      if (cashPayment) cashPayment.change = totals.change;

      const customer = input.customerId ? this.getCustomerById(input.customerId) : undefined;
      const storeCreditAmount = payments
        .filter((payment) => payment.method === "store_credit")
        .reduce((sum, payment) => sum + payment.amount, 0);
      if (storeCreditAmount > 0) {
        if (!customer) throw new Error("Selecione um cliente para venda fiado.");
        if (customer.balance + storeCreditAmount > customer.creditLimit) {
          this.assertAuthorizedPermission(
            "authorize_store_credit_limit",
            input.storeCreditAuthorizationToken,
            "Limite fiado insuficiente. Solicite autorizacao de gerente/admin."
          );
        }
      }
      const sale: Sale = {
        id: saleId,
        companyId: COMPANY_ID,
        number,
        operatorId: operator.id,
        operatorName: operator.name,
        customerId: customer?.id,
        customerName: customer?.name,
        items: saleItems,
        payments,
        subtotal: totals.subtotal,
        discount: saleDiscount,
        total: totals.total,
        profit: totals.profit,
        notes: input.notes,
        status: "completed",
        fiscalStatus: "not_issued",
        createdAt: timestamp,
        updatedAt: timestamp,
        syncStatus: "pending"
      };

      this.db
        .prepare(
          `INSERT INTO sales (id, company_id, number, operator_id, operator_name, customer_id, customer_name,
            subtotal, discount, total, profit, notes, status, fiscal_status, created_at, updated_at, sync_status)
          VALUES (@id, @companyId, @number, @operatorId, @operatorName, @customerId, @customerName,
            @subtotal, @discount, @total, @profit, @notes, @status, @fiscalStatus, @createdAt, @updatedAt, @syncStatus)`
        )
        .run(sale);

      const insertItem = this.db.prepare(
        `INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, unit_price, discount, total, cost)
        VALUES (@id, @saleId, @productId, @productName, @quantity, @unitPrice, @discount, @total, @cost)`
      );
      const insertPayment = this.db.prepare(
        `INSERT INTO payments (id, sale_id, method, amount, change) VALUES (@id, @saleId, @method, @amount, @change)`
      );
      const updateStock = this.db.prepare("UPDATE products SET stock = stock - @quantity, updated_at = @updatedAt, sync_status = 'pending' WHERE id = @productId");

      saleItems.forEach((item) => {
        insertItem.run(item);
        const updatedBefore = this.getProductById(item.productId);
        if (updatedBefore) {
          updateStock.run({ quantity: item.quantity, updatedAt: timestamp, productId: item.productId });
          const updated = this.getProductById(item.productId);
          if (updated) this.enqueue("product", updated.id, "update", updated);
        } else {
          this.recordAudit("produto diverso lancado", operator.name, `${item.productName}: ${item.quantity} x ${item.unitPrice}`);
        }
      });
      payments.forEach((payment) => insertPayment.run(payment));
      if (input.pixChargeId && payments.some((payment) => payment.method === "pix")) {
        this.pixService().linkChargeToSale(input.pixChargeId, sale.id);
      }

      if (customer && storeCreditAmount > 0) {
        this.db
          .prepare("UPDATE customers SET balance = balance + @amount, last_purchase_at = @updatedAt, updated_at = @updatedAt, sync_status = 'pending' WHERE id = @id")
          .run({ id: customer.id, amount: storeCreditAmount, updatedAt: timestamp });
        const updatedCustomer = this.getCustomerById(customer.id);
        if (updatedCustomer) this.enqueue("customer", customer.id, "update", updatedCustomer);
      } else if (customer) {
        this.db
          .prepare("UPDATE customers SET last_purchase_at = @updatedAt, updated_at = @updatedAt WHERE id = @id")
          .run({ id: customer.id, updatedAt: timestamp });
      }

      const cashImpact = roundMoney(payments.reduce((sum, payment) => (payment.method === "store_credit" ? sum : sum + payment.amount - (payment.change ?? 0)), 0));
      this.db
        .prepare(
          `INSERT INTO cash_movements (id, cash_register_id, type, description, amount, created_at)
          VALUES (@id, @cashRegisterId, 'income', @description, @amount, @createdAt)`
        )
        .run({
          id: uid("mov"),
          cashRegisterId: cashRegister.id,
          description: `Venda ${sale.number}`,
          amount: cashImpact,
          createdAt: timestamp
        });

      this.db
        .prepare("UPDATE cash_registers SET expected_amount = expected_amount + @amount WHERE id = @id")
        .run({ id: cashRegister.id, amount: cashImpact });

      this.enqueue("sale", sale.id, "create", sale);
      this.recordAudit("venda criada", operator.name, `${sale.number}: ${sale.total}`);
      return { ...sale, receiptHtml: this.createReceiptHtml(sale) };
    });

    return createSale();
  }

  listSales(filters: { start?: string; end?: string; search?: string } = {}): Sale[] {
    const where = ["s.company_id = @companyId"];
    const params: Record<string, unknown> = { companyId: COMPANY_ID, search: filters.search ?? "", term: `%${filters.search ?? ""}%` };
    if (filters.start) {
      where.push("s.created_at >= @start");
      params.start = filters.start;
    }
    if (filters.end) {
      where.push("s.created_at <= @end");
      params.end = filters.end;
    }
    if (filters.search) {
      where.push("(s.id = @search OR s.number LIKE @term OR s.customer_name LIKE @term OR s.operator_name LIKE @term)");
    }
    const rows = this.db
      .prepare(
        `SELECT s.id, s.company_id as companyId, s.number, s.operator_id as operatorId, s.operator_name as operatorName,
          s.customer_id as customerId, s.customer_name as customerName, s.subtotal, s.discount, s.total,
          s.profit, s.notes, s.status, s.fiscal_status as fiscalStatus, s.fiscal_document_id as fiscalDocumentId,
          s.access_key as accessKey, s.xml_path as xmlPath, s.danfe_url as danfeUrl,
          s.fiscal_error_message as fiscalErrorMessage, s.created_at as createdAt, s.updated_at as updatedAt,
          s.sync_status as syncStatus
        FROM sales s
        WHERE ${where.join(" AND ")}
        ORDER BY s.created_at DESC
        LIMIT 200`
      )
      .all(params) as Omit<Sale, "items" | "payments">[];
    return rows.map((sale) => ({ ...sale, items: this.getSaleItems(sale.id), payments: this.getPayments(sale.id) }));
  }

  cancelSale(saleId: string, credential?: string | AuthCredentialInput): Sale {
    const authorizedUser = credential
      ? this.requireCredential({
          ...(typeof credential === "string" ? { password: credential } : credential),
          permission: "cancel_sale",
          requireManager: true
        })
      : this.getCurrentOperator();
    if (!this.userHasPermission(authorizedUser.id, "cancel_sale") && !managerRoleCodes.has(authorizedUser.role)) {
      this.recordAudit("tentativa acao negada", authorizedUser.name, "cancel_sale");
      throw new Error("Usuario sem permissao para cancelar venda.");
    }
    const sale = this.listSales({ search: saleId }).find((item) => item.id === saleId || item.number === saleId);
    if (!sale) throw new Error("Venda nao encontrada.");
    if (sale.status === "cancelled") return sale;

    const run = this.db.transaction(() => {
      const timestamp = now();
      this.db.prepare("UPDATE sales SET status = 'cancelled', updated_at = @updatedAt, sync_status = 'pending' WHERE id = @id").run({ id: sale.id, updatedAt: timestamp });
      sale.items.forEach((item) => {
        if (this.getProductById(item.productId)) {
          this.db.prepare("UPDATE products SET stock = stock + @quantity, updated_at = @updatedAt, sync_status = 'pending' WHERE id = @productId").run({
            quantity: item.quantity,
            updatedAt: timestamp,
            productId: item.productId
          });
        }
      });
      const storeCreditAmount = sale.payments.filter((payment) => payment.method === "store_credit").reduce((sum, payment) => sum + payment.amount, 0);
      if (sale.customerId && storeCreditAmount > 0) {
        this.db.prepare("UPDATE customers SET balance = MAX(balance - @amount, 0), updated_at = @updatedAt, sync_status = 'pending' WHERE id = @id").run({
          id: sale.customerId,
          amount: storeCreditAmount,
          updatedAt: timestamp
        });
        const updatedCustomer = this.getCustomerById(sale.customerId);
        if (updatedCustomer) this.enqueue("customer", sale.customerId, "update", updatedCustomer);
      }
      const cashRegister = this.getCurrentCashRegister();
      if (cashRegister) {
        const cashImpact = roundMoney(sale.payments.reduce((sum, payment) => (payment.method === "store_credit" ? sum : sum + payment.amount - (payment.change ?? 0)), 0));
        this.db
          .prepare(
            `INSERT INTO cash_movements (id, cash_register_id, type, description, amount, created_at)
            VALUES (@id, @cashRegisterId, 'expense', @description, @amount, @createdAt)`
          )
          .run({ id: uid("mov"), cashRegisterId: cashRegister.id, description: `Cancelamento ${sale.number}`, amount: -cashImpact, createdAt: timestamp });
        this.db.prepare("UPDATE cash_registers SET expected_amount = expected_amount - @amount WHERE id = @id").run({ id: cashRegister.id, amount: cashImpact });
      }
      const updated = { ...sale, status: "cancelled" as const, updatedAt: timestamp, syncStatus: "pending" as const };
      this.enqueue("sale", sale.id, "update", updated);
      this.recordAudit("venda cancelada", authorizedUser?.name ?? this.getCurrentOperatorName(), sale.number);
      return updated;
    });
    return run();
  }

  removeCancelledSale(saleId: string, credential: string | AuthCredentialInput): { removed: boolean } {
    const user = this.requireCredential(typeof credential === "string" ? { password: credential } : credential);
    if (!adminRoleCodes.has(user.role) || !this.userHasPermission(user.id, "remove_cancelled_sale")) {
      this.recordAudit("tentativa acao negada", user.name, "remove_cancelled_sale");
      throw new Error("Apenas Administrador ou Dono pode remover venda cancelada.");
    }
    const sale = this.listSales({ search: saleId }).find((item) => item.id === saleId || item.number === saleId);
    if (!sale) throw new Error("Venda nao encontrada.");
    if (sale.status !== "cancelled") throw new Error("Vendas concluidas nao podem ser removidas. Cancele a venda primeiro.");
    const run = this.db.transaction(() => {
      this.db.prepare("DELETE FROM payments WHERE sale_id = ?").run(sale.id);
      this.db.prepare("DELETE FROM sale_items WHERE sale_id = ?").run(sale.id);
      this.db.prepare("DELETE FROM sales WHERE id = ?").run(sale.id);
      this.recordAudit("venda cancelada removida", user.name, sale.number);
      return { removed: true };
    });
    return run();
  }

  getSaleReceiptHtml(saleId: string): string {
    const sale = this.listSales({ search: saleId }).find((item) => item.id === saleId || item.number === saleId);
    if (!sale) throw new Error("Venda nao encontrada.");
    return this.createReceiptHtml(sale);
  }

  getDashboard(): DashboardMetrics {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const month = new Date(today.getFullYear(), today.getMonth(), 1);
    const daily = this.db.prepare("SELECT COALESCE(SUM(s.total), 0) as revenue, COUNT(s.id) as count, COALESCE(SUM(s.profit), 0) as profit FROM sales s WHERE s.status = 'completed' AND s.created_at >= ?").get(today.toISOString()) as { revenue: number; count: number; profit: number };
    const monthly = this.db.prepare("SELECT COALESCE(SUM(s.total), 0) as revenue FROM sales s WHERE s.status = 'completed' AND s.created_at >= ?").get(month.toISOString()) as { revenue: number };
    const lowStock = this.db.prepare("SELECT COUNT(p.id) as count FROM products p WHERE p.stock <= p.min_stock AND p.active = 1").get() as { count: number };
    const openCustomers = this.db.prepare("SELECT COUNT(c.id) as count, COALESCE(SUM(c.balance), 0) as balance FROM customers c WHERE c.active = 1 AND c.balance > 0").get() as { count: number; balance: number };
    const pending = this.db.prepare("SELECT COUNT(q.id) as count FROM sync_queue q WHERE q.status IN ('pending','failed')").get() as { count: number };
    const cash = this.getCurrentCashRegister();
    const topProducts = this.db
      .prepare(
        `SELECT si.product_name as name, SUM(si.quantity) as quantity, SUM(si.total) as revenue
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        WHERE s.status = 'completed'
        GROUP BY si.product_id, si.product_name
        ORDER BY SUM(si.quantity) DESC
        LIMIT 5`
      )
      .all() as DashboardMetrics["topProducts"];
    const salesChart = Array.from({ length: 7 }).map((_, index) => {
      const day = new Date();
      day.setDate(day.getDate() - (6 - index));
      const start = new Date(day);
      start.setHours(0, 0, 0, 0);
      const end = new Date(day);
      end.setHours(23, 59, 59, 999);
      const value = this.db.prepare("SELECT COALESCE(SUM(s.total), 0) as revenue FROM sales s WHERE s.status = 'completed' AND s.created_at BETWEEN @start AND @end").get({
        start: start.toISOString(),
        end: end.toISOString()
      }) as { revenue: number };
      return { label: `${day.getDate()}/${day.getMonth() + 1}`, value: value.revenue };
    });

    return {
      dailyRevenue: daily.revenue,
      monthlyRevenue: monthly.revenue,
      estimatedProfit: daily.profit,
      averageTicket: daily.count ? roundMoney(daily.revenue / daily.count) : 0,
      salesCount: daily.count,
      lowStockCount: lowStock.count,
      openCustomersCount: openCustomers.count,
      openCustomersBalance: openCustomers.balance,
      cashBalance: cash?.expectedAmount ?? 0,
      syncPending: pending.count,
      topProducts,
      salesChart
    };
  }

  getCurrentCashRegister(): CashRegister | undefined {
    return this.db
      .prepare(
        `SELECT id, company_id as companyId, operator_id as operatorId, operator_name as operatorName,
          opened_at as openedAt, closed_at as closedAt, opening_amount as openingAmount,
          expected_amount as expectedAmount, counted_amount as countedAmount, difference,
          closing_notes as closingNotes, status
        FROM cash_registers
        WHERE company_id = ? AND status = 'open'
        ORDER BY opened_at DESC
        LIMIT 1`
      )
      .get(COMPANY_ID) as CashRegister | undefined;
  }

  getCashSummary(): CashSummary {
    const cashRegister = this.getCurrentCashRegister();
    if (!cashRegister) {
      return {
        salesTotal: 0,
        incomeTotal: 0,
        expenseTotal: 0,
        withdrawalTotal: 0,
        expectedAmount: 0,
        recentMovements: []
      };
    }

    const totals = this.db
      .prepare(
        `SELECT
          COALESCE(SUM(CASE WHEN type = 'income' AND description LIKE 'Venda %' THEN amount ELSE 0 END), 0) as salesTotal,
          COALESCE(SUM(CASE WHEN type = 'income' AND description NOT LIKE 'Venda %' THEN amount ELSE 0 END), 0) as incomeTotal,
          COALESCE(SUM(CASE WHEN type = 'expense' THEN ABS(amount) ELSE 0 END), 0) as expenseTotal,
          COALESCE(SUM(CASE WHEN type = 'withdrawal' THEN ABS(amount) ELSE 0 END), 0) as withdrawalTotal
        FROM cash_movements
        WHERE cash_register_id = ?`
      )
      .get(cashRegister.id) as Omit<CashSummary, "cashRegister" | "expectedAmount">;

    const recentMovements = this.db
      .prepare(
        `SELECT id, cash_register_id as cashRegisterId, type, description, amount, created_at as createdAt
        FROM cash_movements
        WHERE cash_register_id = ?
        ORDER BY created_at DESC
        LIMIT 6`
      )
      .all(cashRegister.id) as CashMovement[];

    return {
      cashRegister,
      salesTotal: totals.salesTotal,
      incomeTotal: totals.incomeTotal,
      expenseTotal: totals.expenseTotal,
      withdrawalTotal: totals.withdrawalTotal,
      expectedAmount: cashRegister.expectedAmount,
      recentMovements
    };
  }

  openCashRegister(openingAmount: number): CashRegister {
    this.assertCurrentPermission("open_cash");
    const existing = this.getCurrentCashRegister();
    if (existing) return existing;
    const operator = this.getCurrentOperator();
    const cashRegister: CashRegister = {
      id: uid("cash"),
      companyId: COMPANY_ID,
      operatorId: operator.id,
      operatorName: operator.name,
      openedAt: now(),
      openingAmount,
      expectedAmount: openingAmount,
      status: "open"
    };
    this.db
      .prepare(
        `INSERT INTO cash_registers (id, company_id, operator_id, operator_name, opened_at, opening_amount, expected_amount, status)
        VALUES (@id, @companyId, @operatorId, @operatorName, @openedAt, @openingAmount, @expectedAmount, @status)`
      )
      .run(cashRegister);
    this.db
      .prepare(
        `INSERT INTO cash_movements (id, cash_register_id, type, description, amount, created_at)
        VALUES (@id, @cashRegisterId, 'opening', 'Abertura de caixa', @amount, @createdAt)`
      )
      .run({ id: uid("mov"), cashRegisterId: cashRegister.id, amount: openingAmount, createdAt: cashRegister.openedAt });
    this.enqueue("cash_register", cashRegister.id, "create", cashRegister);
    this.recordAudit("caixa aberto", operator.name, `Valor inicial ${openingAmount}`);
    return cashRegister;
  }

  addCashMovement(type: "income" | "expense" | "withdrawal", description: string, amount: number): CashRegister {
    this.assertCurrentPermission(type === "withdrawal" ? "cash_withdrawal" : type === "income" ? "cash_income" : "cash_expense");
    const cashRegister = this.getCurrentCashRegister();
    if (!cashRegister) throw new Error("Caixa fechado. Abra o caixa antes de registrar movimentacoes.");
    const signedAmount = type === "income" ? amount : -amount;
    this.db
      .prepare(
        `INSERT INTO cash_movements (id, cash_register_id, type, description, amount, created_at)
        VALUES (@id, @cashRegisterId, @type, @description, @amount, @createdAt)`
      )
      .run({ id: uid("mov"), cashRegisterId: cashRegister.id, type, description, amount: signedAmount, createdAt: now() });
    this.db.prepare("UPDATE cash_registers SET expected_amount = expected_amount + @amount WHERE id = @id").run({ id: cashRegister.id, amount: signedAmount });
    this.recordAudit(type === "withdrawal" ? "sangria" : type === "income" ? "entrada de caixa" : "saida de caixa", this.getCurrentOperatorName(), `${description}: ${amount}`);
    return this.getCurrentCashRegister()!;
  }

  closeCashRegister(input: CashCloseInput): CashRegister {
    this.assertCurrentPermission("close_cash");
    const cashRegister = this.getCurrentCashRegister();
    if (!cashRegister || cashRegister.id !== input.cashRegisterId) throw new Error("Caixa aberto nao encontrado.");
    const difference = roundMoney(input.countedAmount - cashRegister.expectedAmount);
    const closed: CashRegister = {
      ...cashRegister,
      closedAt: now(),
      countedAmount: input.countedAmount,
      difference,
      closingNotes: input.closingNotes?.trim(),
      status: "closed"
    };
    this.db
      .prepare("UPDATE cash_registers SET closed_at = @closedAt, counted_amount = @countedAmount, difference = @difference, closing_notes = @closingNotes, status = 'closed' WHERE id = @id")
      .run(closed);
    this.enqueue("cash_register", closed.id, "update", closed);
    this.recordAudit("caixa fechado", this.getCurrentOperatorName(), `Esperado ${cashRegister.expectedAmount}, contado ${input.countedAmount}, diferenca ${difference}${closed.closingNotes ? `, obs: ${closed.closingNotes}` : ""}`);
    return closed;
  }

  getSyncQueue(limit = 50): SyncQueueItem[] {
    return this.db
      .prepare(
        `SELECT id, company_id as companyId, entity, entity_id as entityId, operation, payload,
          attempts, last_error as lastError, status, created_at as createdAt, updated_at as updatedAt
        FROM sync_queue
        WHERE status IN ('pending', 'failed')
        ORDER BY created_at
        LIMIT ?`
      )
      .all(limit)
      .map((item: any) => ({ ...item, payload: JSON.parse(item.payload) })) as SyncQueueItem[];
  }

  markSyncSuccess(ids: string[]): void {
    if (!ids.length) return;
    const update = this.db.prepare("UPDATE sync_queue SET status = 'synced', updated_at = @updatedAt WHERE id = @id");
    const run = this.db.transaction(() => ids.forEach((id) => update.run({ id, updatedAt: now() })));
    run();
  }

  markSyncFailure(id: string, error: string): void {
    this.db
      .prepare("UPDATE sync_queue SET status = 'failed', attempts = attempts + 1, last_error = @error, updated_at = @updatedAt WHERE id = @id")
      .run({ id, error, updatedAt: now() });
  }

  getLicense() {
    const row = this.db
      .prepare(
        `SELECT id, company_id as companyId, key, plan, status, valid_until as validUntil,
          demo_mode as demoMode, cloud_enabled as cloudEnabled, fiscal_enabled as fiscalEnabled,
          pix_enabled as pixEnabled, mobile_enabled as mobileEnabled, intelligence_enabled as intelligenceEnabled,
          owner_email as ownerEmail, establishment_name as establishmentName, issued_at as issuedAt,
          activated_at as activatedAt, last_validated_at as lastValidatedAt,
          validation_mode as validationMode, signature, features_json as featuresJson
        FROM licenses WHERE company_id = ? LIMIT 1`
      )
      .get(COMPANY_ID) as (License & Record<string, unknown>) | undefined;
    if (!row) return undefined;
    return normalizeStoredLicense({
      ...row,
      demoMode: toBoolean(row.demoMode),
      cloudEnabled: toBoolean(row.cloudEnabled),
      fiscalEnabled: toBoolean(row.fiscalEnabled),
      pixEnabled: toBoolean(row.pixEnabled),
      mobileEnabled: toBoolean(row.mobileEnabled),
      intelligenceEnabled: toBoolean(row.intelligenceEnabled)
    } as License & { featuresJson?: string });
  }

  getSystemState(): SystemState {
    const backup = this.getBackupState();
    const license = this.getLicense() as SystemState["license"];
    const licenseCheck = checkStoredLicense(license);
    const activated = this.getSetting("system_activated") === "true" && licenseCheck.valid;
    return {
      activated,
      ownerOnboardingRequired: activated && this.isOwnerOnboardingRequired(),
      ownerEmail: licenseCheck.ownerEmail ?? this.getCompany().ownerEmail,
      devUsersEnabled: desktopDevUsersEnabled(),
      appVersion: app.getVersion(),
      cloudEnabled: licenseCheck.cloudEnabled,
      allowSalesWithoutCashRegister: this.getSetting("allow_sales_without_cash_register") === "true",
      usePermissions: this.getSetting("use_permissions") === "true",
      locationControl: this.getSetting("location_control") === "true",
      automaticBackupEnabled: backup.automaticBackupEnabled,
      backupPath: backup.backupPath,
      blockNegativeStock: this.getSetting("block_negative_stock") !== "false",
      receiptWidthMm: this.getSetting("receipt_width_mm") === "58" ? 58 : 80,
      receiptPrinterName: this.getSetting("receipt_printer_name") || "",
      receiptFooterMessage: this.getSetting("receipt_footer_message") || "Obrigado pela preferencia.",
      receiptAutoPrint: this.getSetting("receipt_auto_print") !== "false",
      company: this.getCompany(),
      license
    };
  }

  async activateSystem(input: ActivationInput): Promise<SystemState> {
    this.assertCurrentPermission("activate_license");
    const timestamp = now();
    let license: LocalLicenseRecord;
    let activationMode: "online" | "local" = "local";
    try {
      const onlineLicense = await activateLicenseOnline(input, COMPANY_ID);
      if (onlineLicense) {
        license = onlineLicense;
        activationMode = "online";
      } else {
        if (!isLocalActivationKey(input.licenseKey)) {
          throw new Error("API Cloud nao configurada para ativar esta chave. Em desenvolvimento, use http://localhost:3333 ou defina NEXPDV_CLOUD_API_URL.");
        }
        license = createLocalLicenseActivation(input, COMPANY_ID, timestamp);
      }
    } catch (error) {
      this.recordAudit("ativacao online indisponivel", input.ownerEmail.trim(), error instanceof Error ? error.message : "falha desconhecida");
      if (!isLocalActivationKey(input.licenseKey)) {
        throw error;
      }
      license = createLocalLicenseActivation(input, COMPANY_ID, timestamp);
    }
    this.db
      .prepare(
        `UPDATE companies SET trade_name = @tradeName, name = @name, owner_email = @ownerEmail,
          updated_at = @updatedAt WHERE id = @id`
      )
      .run({ id: COMPANY_ID, tradeName: license.establishmentName, name: license.establishmentName, ownerEmail: license.ownerEmail, updatedAt: timestamp });
    this.saveLicenseRecord(license);
    this.setSetting("system_activated", "true");
    this.setSetting("cloud_enabled", String(license.features.cloud));
    this.recordAudit("licenca ativada", license.ownerEmail, `${activationMode}: ${license.plan}: ${license.key}`);
    this.recordAudit("sistema ativado", license.ownerEmail, license.establishmentName);
    return this.getSystemState();
  }

  createOwnerAccess(input: OwnerOnboardingInput): UserAccount {
    if (this.getSetting("system_activated") !== "true") {
      throw new Error("Ative o NexPDV antes de criar o acesso do dono.");
    }
    const license = this.getLicense() as LocalLicenseRecord | undefined;
    const licenseCheck = checkStoredLicense(license);
    if (!licenseCheck.valid || !license) {
      throw new Error("Licenca local invalida. Refaca a ativacao antes do primeiro acesso.");
    }
    if (!this.isOwnerOnboardingRequired()) {
      throw new Error("O acesso do dono ja foi configurado.");
    }

    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();
    const username = normalizeLogin(input.username);
    if (!name) throw new Error("Informe o nome do dono.");
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new Error("Informe um email valido.");
    if (license.ownerEmail && license.ownerEmail.trim().toLowerCase() !== email) {
      throw new Error("O email do dono precisa ser o mesmo usado na ativacao da licenca.");
    }
    if (!username) throw new Error("Informe o login do dono.");
    if (input.password.length < 8) throw new Error("A senha deve ter pelo menos 8 caracteres.");
    if (input.password !== input.confirmPassword) throw new Error("A confirmacao de senha nao confere.");
    if (!/^\d{4,6}$/.test(input.pin)) throw new Error("PIN deve ser numerico com 4 a 6 digitos.");
    if (input.pin !== input.confirmPin) throw new Error("A confirmacao do PIN nao confere.");

    const duplicateLogin = this.db.prepare("SELECT id FROM users WHERE company_id = ? AND lower(username) = ? LIMIT 1").get(COMPANY_ID, username);
    if (duplicateLogin) throw new Error("Ja existe usuario com este login.");

    const id = uid("usr");
    const timestamp = now();
    this.db
      .prepare(
        `INSERT INTO users (
          id, company_id, name, username, email, phone, role, role_id, sector,
          password_hash, pin_hash, notes, license_key, source, active, created_at, updated_at
        ) VALUES (
          @id, @companyId, @name, @username, @email, '', 'owner', 'role_owner', 'Administrativo',
          @passwordHash, @pinHash, @notes, @licenseKey, 'activation_onboarding', 1, @createdAt, @updatedAt
        )`
      )
      .run({
        id,
        companyId: COMPANY_ID,
        name,
        username,
        email,
        passwordHash: hashPassword(input.password),
        pinHash: hashPin(input.pin),
        notes: "Primeiro usuario dono criado apos ativacao",
        licenseKey: license.key,
        createdAt: timestamp,
        updatedAt: timestamp
      });
    this.setSetting("owner_user_id", id);
    this.setSetting("owner_onboarding_completed", "true");
    this.setSetting("use_permissions", "true");
    this.setSecuritySetting("last_operator_login", username);
    this.recordAuthLog(id, "owner_onboarding", true, "Primeiro acesso do dono criado");
    this.recordAudit("usuario dono criado", name, `Licenca ${license.key}`);
    this.recordAudit("primeiro acesso concluido", name, "activation_onboarding");
    return this.getUserAccountById(id)!;
  }

  activateCloud(input: CloudActivationInput): SystemState {
    this.assertCurrentPermission("activate_cloud");
    const company = this.getCompany();
    const companyName = company.tradeName || company.name || "NexPDV Store";
    const license = createLocalLicenseActivation({ ownerEmail: input.ownerEmail, licenseKey: input.cloudKey, companyName }, COMPANY_ID, now());
    if (!license.features.cloud) {
      throw new Error("A chave informada nao libera o modo Cloud.");
    }
    this.saveLicenseRecord(license);
    this.setSetting("system_activated", "true");
    this.setSetting("cloud_enabled", "true");
    this.recordAudit("cloud ativado", input.ownerEmail.trim(), `Plano ${license.plan}`);
    return this.getSystemState();
  }

  getAuthState(): AuthState {
    const session = this.getActiveSession();
    const user = session ? this.getUserAccountById(session.userId) : undefined;
    return {
      session,
      user,
      settings: this.getSecuritySettings(),
      lastOperatorLogin: this.getSecuritySetting("last_operator_login")
    };
  }

  login(input: AuthLoginInput): AuthState {
    const login = normalizeLogin(input.login);
    const user = this.findUserByLogin(login);
    if (!user || !user.active) {
      this.recordAuthLog(undefined, "login", false, `Operador nao encontrado: ${login}`);
      this.recordAudit("tentativa falha login", login || "desconhecido", "Operador nao encontrado ou inativo");
      throw new Error("Operador, PIN ou senha incorretos.");
    }
    if (!this.verifyUserCredential(user.id, { password: input.password, pin: input.pin })) {
      this.recordAuthLog(user.id, "login", false, "Credencial invalida");
      this.recordAudit("tentativa falha login", user.name, "Credencial invalida");
      throw new Error("Operador, PIN ou senha incorretos.");
    }
    const timestamp = now();
    this.db.prepare("UPDATE sessions SET active = 0, logout_at = COALESCE(logout_at, @logoutAt) WHERE company_id = @companyId AND active = 1").run({
      companyId: COMPANY_ID,
      logoutAt: timestamp
    });
    this.db
      .prepare(
        `INSERT INTO sessions (id, company_id, user_id, user_name, role, role_name, operator_id, operator_name, login_at, active, locked)
        VALUES (@id, @companyId, @userId, @userName, @role, @roleName, @operatorId, @operatorName, @loginAt, 1, 0)`
      )
      .run({
        id: uid("ses"),
        companyId: COMPANY_ID,
        userId: user.id,
        userName: user.name,
        role: user.role,
        roleName: user.roleName,
        operatorId: user.id,
        operatorName: user.name,
        loginAt: timestamp
      });
    this.db.prepare("UPDATE users SET last_access_at = @lastAccessAt WHERE id = @id").run({ id: user.id, lastAccessAt: timestamp });
    if (input.rememberOperator ?? this.getSecuritySettings().rememberLastOperator) this.setSecuritySetting("last_operator_login", user.username || user.email || login);
    this.recordAuthLog(user.id, "login", true, "Sessao iniciada");
    this.recordAudit("login", user.name, "Sessao iniciada");
    return this.getAuthState();
  }

  logout(sessionId?: string): AuthState {
    const session = sessionId ? this.getSessionById(sessionId) : this.getActiveSession();
    if (!session) return this.getAuthState();
    const timestamp = now();
    this.db.prepare("UPDATE sessions SET active = 0, locked = 0, logout_at = @logoutAt WHERE id = @id").run({ id: session.id, logoutAt: timestamp });
    this.recordAuthLog(session.userId, "logout", true, "Sessao encerrada");
    this.recordAudit("logout", session.userName, "Sessao encerrada");
    return this.getAuthState();
  }

  lockSession(): AuthState {
    const session = this.getActiveSession();
    if (!session) return this.getAuthState();
    this.db.prepare("UPDATE sessions SET locked = 1 WHERE id = ?").run(session.id);
    this.recordAudit("tela bloqueada", session.userName, "Bloqueio rapido do PDV");
    return this.getAuthState();
  }

  unlockSession(input: AuthCredentialInput): AuthState {
    const session = this.getActiveSession();
    if (!session) throw new Error("Nenhuma sessao ativa para desbloquear.");
    if (!this.verifyUserCredential(session.userId, input)) {
      this.recordAuthLog(session.userId, "unlock", false, "Credencial invalida");
      this.recordAudit("tentativa acao negada", session.userName, "Desbloqueio do PDV negado");
      throw new Error("PIN ou senha incorretos.");
    }
    this.db.prepare("UPDATE sessions SET locked = 0 WHERE id = ?").run(session.id);
    this.recordAuthLog(session.userId, "unlock", true, "Tela desbloqueada");
    this.recordAudit("desbloqueio tela", session.userName, "PIN/senha validado");
    return this.getAuthState();
  }

  switchOperator(input: AuthLoginInput): AuthState {
    const user = this.findUserByLogin(normalizeLogin(input.login));
    if (!user || !user.active || !this.verifyUserCredential(user.id, input)) {
      this.recordAuthLog(user?.id, "switch_operator", false, "Credencial invalida");
      this.recordAudit("tentativa acao negada", input.login || "desconhecido", "Troca de operador negada");
      throw new Error("Operador, PIN ou senha incorretos.");
    }
    const session = this.getActiveSession();
    if (!session) return this.login(input);
    this.db
      .prepare(
        `UPDATE sessions SET user_id = @userId, user_name = @userName, role = @role, role_name = @roleName,
          operator_id = @operatorId, operator_name = @operatorName, locked = 0 WHERE id = @id`
      )
      .run({
        id: session.id,
        userId: user.id,
        userName: user.name,
        role: user.role,
        roleName: user.roleName,
        operatorId: user.id,
        operatorName: user.name
      });
    this.db.prepare("UPDATE users SET last_access_at = @lastAccessAt WHERE id = @id").run({ id: user.id, lastAccessAt: now() });
    this.setSecuritySetting("last_operator_login", user.username || user.email || input.login);
    this.recordAuthLog(user.id, "switch_operator", true, `Operador atual: ${user.name}`);
    this.recordAudit("troca operador", user.name, "Operador assumiu a sessao do caixa");
    return this.getAuthState();
  }

  authorizeCredential(input: AuthCredentialInput): AuthAuthorizationResult {
    try {
      const user = this.requireCredential(input);
      if (input.requireManager && !managerRoleCodes.has(user.role)) throw new Error("A acao requer gerente ou administrador.");
      if (input.permission && !this.userHasPermission(user.id, input.permission)) throw new Error("Usuario sem permissao para esta acao.");
      const token = input.permission ? this.createAuthorizationToken(user.id, input.permission) : undefined;
      this.recordAuthLog(user.id, "authorize", true, input.permission ?? "manager");
      return { ok: true, user, message: "Autorizado.", token };
    } catch (error) {
      this.recordAuthLog(undefined, "authorize", false, input.permission ?? "manager");
      this.recordAudit("tentativa acao negada", input.login || "credencial informada", input.permission ?? "manager");
      return { ok: false, message: error instanceof Error ? error.message : "Nao autorizado." };
    }
  }

  saveSecuritySettings(input: Partial<SecuritySettings>): SecuritySettings {
    this.assertCurrentPermission("access_settings");
    const entries: Array<[keyof SecuritySettings, unknown]> = [
      ["requireLoginOnStart", input.requireLoginOnStart],
      ["allowQuickPin", input.allowQuickPin],
      ["requireManagerAuthorization", input.requireManagerAuthorization],
      ["allowMultipleOperators", input.allowMultipleOperators],
      ["autoLockEnabled", input.autoLockEnabled],
      ["autoLockMinutes", input.autoLockMinutes],
      ["sessionTimeoutMinutes", input.sessionTimeoutMinutes],
      ["rememberLastOperator", input.rememberLastOperator]
    ];
    entries.forEach(([key, value]) => {
      if (value !== undefined) this.setSecuritySetting(key, String(value));
    });
    this.recordAudit("configuracoes alteradas", this.getCurrentOperatorName(), "Aba Seguranca atualizada");
    return this.getSecuritySettings();
  }

  saveUser(input: SaveUserInput): UserAccount {
    this.assertCurrentPermission("manage_users");
    if (!input.name.trim()) throw new Error("Informe o nome do usuario.");
    if (!input.username.trim()) throw new Error("Informe o login do usuario.");
    if (!input.id && (!input.password || input.password.length < 6)) throw new Error("Senha deve ter pelo menos 6 caracteres.");
    if (!input.id && (!input.pin || !/^\d{4,8}$/.test(input.pin))) throw new Error("PIN deve ser numerico com 4 a 8 digitos.");
    const role = this.getRoleById(input.roleId);
    if (!role) throw new Error("Cargo invalido.");
    if (!toBoolean(role.active)) throw new Error("Cargo inativo nao pode ser atribuido.");
    const id = input.id ?? uid("usr");
    const duplicateLogin = this.db.prepare("SELECT id FROM users WHERE company_id = ? AND lower(username) = ? AND id <> ? LIMIT 1").get(COMPANY_ID, normalizeLogin(input.username), id);
    if (duplicateLogin) throw new Error("Ja existe usuario com este login.");
    const existing = input.id ? this.getUserAccountById(input.id) : undefined;
    const timestamp = now();
    const payload = {
      id,
      companyId: COMPANY_ID,
      name: input.name.trim(),
      username: normalizeLogin(input.username),
      email: input.email?.trim() || "",
      phone: input.phone?.trim() || "",
      role: role.code,
      roleId: role.id,
      sector: input.sector?.trim() || "",
      passwordHash: input.password ? hashPassword(input.password) : undefined,
      pinHash: input.pin ? hashPin(input.pin) : undefined,
      notes: input.notes?.trim() || "",
      active: input.active ?? true,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    if (existing) {
      this.db
        .prepare(
          `UPDATE users SET name = @name, username = @username, email = @email, phone = @phone, role = @role,
            role_id = @roleId, sector = @sector, notes = @notes, active = @active, updated_at = @updatedAt
          WHERE id = @id`
        )
        .run(payload);
      if (payload.passwordHash) this.db.prepare("UPDATE users SET password_hash = @passwordHash WHERE id = @id").run(payload);
      if (payload.pinHash) this.db.prepare("UPDATE users SET pin_hash = @pinHash WHERE id = @id").run(payload);
      this.recordAudit("usuario editado", this.getCurrentOperatorName(), payload.name);
    } else {
      this.db
        .prepare(
          `INSERT INTO users (id, company_id, name, username, email, phone, role, role_id, sector, password_hash, pin_hash, notes, active, created_at, updated_at)
          VALUES (@id, @companyId, @name, @username, @email, @phone, @role, @roleId, @sector, @passwordHash, @pinHash, @notes, @active, @createdAt, @updatedAt)`
        )
        .run(payload);
      this.recordAudit("usuario criado", this.getCurrentOperatorName(), payload.name);
    }
    if (input.permissionOverrides) {
      this.saveUserPermissionOverrides(id, input.permissionOverrides);
      this.recordAudit("alteracao permissoes", this.getCurrentOperatorName(), payload.name);
    }
    return this.getUserAccountById(id)!;
  }

  setUserActive(userId: string, active: boolean): UserAccount {
    this.assertCurrentPermission("manage_users");
    this.db.prepare("UPDATE users SET active = @active, updated_at = @updatedAt WHERE company_id = @companyId AND id = @id").run({
      id: userId,
      companyId: COMPANY_ID,
      active,
      updatedAt: now()
    });
    const user = this.getUserAccountById(userId);
    if (!user) throw new Error("Usuario nao encontrado.");
    this.recordAudit(active ? "usuario ativado" : "usuario inativado", this.getCurrentOperatorName(), user.name);
    return user;
  }

  resetUserPassword(userId: string, password: string): UserAccount {
    this.assertCurrentPermission("manage_users");
    if (password.length < 6) throw new Error("Senha deve ter pelo menos 6 caracteres.");
    this.db.prepare("UPDATE users SET password_hash = @passwordHash, updated_at = @updatedAt WHERE id = @id").run({
      id: userId,
      passwordHash: hashPassword(password),
      updatedAt: now()
    });
    const user = this.getUserAccountById(userId);
    if (!user) throw new Error("Usuario nao encontrado.");
    this.recordAudit("redefinicao senha", this.getCurrentOperatorName(), user.name);
    return user;
  }

  resetUserPin(userId: string, pin: string): UserAccount {
    this.assertCurrentPermission("manage_users");
    if (!/^\d{4,8}$/.test(pin)) throw new Error("PIN deve ser numerico com 4 a 8 digitos.");
    this.db.prepare("UPDATE users SET pin_hash = @pinHash, updated_at = @updatedAt WHERE id = @id").run({
      id: userId,
      pinHash: hashPin(pin),
      updatedAt: now()
    });
    const user = this.getUserAccountById(userId);
    if (!user) throw new Error("Usuario nao encontrado.");
    this.recordAudit("redefinicao PIN", this.getCurrentOperatorName(), user.name);
    return user;
  }

  validateManagerPassword(password: string): { ok: boolean; role?: "manager" | "admin" | "owner"; message: string } {
    const result = this.authorizeCredential({ password, permission: "access_management", requireManager: true });
    if (result.ok) this.recordAudit("acesso a gestao", result.user!.name, "Acesso liberado");
    return result.ok ? { ok: true, role: result.user!.role as "manager" | "admin" | "owner", message: "Acesso liberado." } : { ok: false, message: result.message };
  }

  authorizeAction(input: { password?: string; pin?: string; login?: string; permission: PermissionKey }): { ok: boolean; user?: UserAccount; message: string } {
    return this.authorizeCredential(input);
  }

  recordAuditEvent(input: AuditEventInput = {}): { ok: true } {
    const action = input.action?.trim();
    if (!action) throw new Error("Acao de auditoria invalida.");
    this.recordAudit(action, input.actor?.trim() || this.getCurrentOperatorName(), input.details?.trim() || "");
    return { ok: true };
  }

  getCompany(): Partial<Company> {
    return (
      this.db
        .prepare(
          `SELECT id, name, document, trade_name as tradeName, legal_name as legalName,
            state_registration as stateRegistration, phone, whatsapp, email, address, city, state,
            zip_code as zipCode, logo_url as logoUrl, owner_email as ownerEmail,
            created_at as createdAt, updated_at as updatedAt
          FROM companies WHERE id = ?`
        )
        .get(COMPANY_ID) ?? {}
    ) as Partial<Company>;
  }

  updateCompany(input: Partial<Company>): Partial<Company> {
    this.assertCurrentPermission("access_settings");
    const timestamp = now();
    this.db
      .prepare(
        `UPDATE companies SET name = @name, document = @document, trade_name = @tradeName,
          legal_name = @legalName, state_registration = @stateRegistration, phone = @phone,
          whatsapp = @whatsapp, email = @email, address = @address, city = @city, state = @state,
          zip_code = @zipCode, logo_url = @logoUrl, owner_email = @ownerEmail, updated_at = @updatedAt
        WHERE id = @id`
      )
      .run({
        id: COMPANY_ID,
        name: input.name || input.tradeName || "NexPDV Store",
        document: input.document || "",
        tradeName: input.tradeName || input.name || "",
        legalName: input.legalName || "",
        stateRegistration: input.stateRegistration || "",
        phone: input.phone || "",
        whatsapp: input.whatsapp || "",
        email: input.email || "",
        address: input.address || "",
        city: input.city || "",
        state: input.state || "",
        zipCode: input.zipCode || "",
        logoUrl: input.logoUrl || "",
        ownerEmail: input.ownerEmail || "",
        updatedAt: timestamp
      });
    this.recordAudit("empresa editada", this.getCurrentOperatorName(), input.tradeName || input.name || "Empresa");
    return this.getCompany();
  }

  updateSettings(input: {
    usePermissions?: boolean;
    locationControl?: boolean;
    allowSalesWithoutCashRegister?: boolean;
    blockNegativeStock?: boolean;
    automaticBackupEnabled?: boolean;
    backupPath?: string;
    receiptWidthMm?: 58 | 80;
    receiptPrinterName?: string;
    receiptFooterMessage?: string;
    receiptAutoPrint?: boolean;
  }): SystemState {
    this.assertCurrentPermission("access_settings");
    if (typeof input.usePermissions === "boolean") {
      this.setSetting("use_permissions", String(input.usePermissions));
      this.recordAudit("permissoes alteradas", this.getCurrentOperatorName(), `Controle ${input.usePermissions ? "ativado" : "desativado"}`);
    }
    if (typeof input.locationControl === "boolean") {
      this.setSetting("location_control", String(input.locationControl));
      this.recordAudit("configuracoes alteradas", this.getCurrentOperatorName(), `Localizacao ${input.locationControl ? "ativada" : "desativada"}`);
    }
    if (typeof input.allowSalesWithoutCashRegister === "boolean") {
      this.setSetting("allow_sales_without_cash_register", String(input.allowSalesWithoutCashRegister));
      this.recordAudit("configuracoes alteradas", this.getCurrentOperatorName(), `Venda com caixa fechado ${input.allowSalesWithoutCashRegister ? "permitida" : "bloqueada"}`);
    }
    if (typeof input.blockNegativeStock === "boolean") {
      this.setSetting("block_negative_stock", String(input.blockNegativeStock));
      this.recordAudit("configuracoes alteradas", this.getCurrentOperatorName(), `Estoque negativo ${input.blockNegativeStock ? "bloqueado" : "permitido"}`);
    }
    if (typeof input.automaticBackupEnabled === "boolean") {
      this.setSetting("automatic_backup_enabled", String(input.automaticBackupEnabled));
      this.recordAudit("configuracoes alteradas", this.getCurrentOperatorName(), `Backup automatico ${input.automaticBackupEnabled ? "ativado" : "desativado"}`);
    }
    if (typeof input.backupPath === "string" && input.backupPath.trim()) {
      this.setSetting("backup_path", input.backupPath.trim());
      this.recordAudit("configuracoes alteradas", this.getCurrentOperatorName(), `Caminho backup: ${input.backupPath.trim()}`);
    }
    if (input.receiptWidthMm === 58 || input.receiptWidthMm === 80) {
      this.setSetting("receipt_width_mm", String(input.receiptWidthMm));
      this.recordAudit("configuracoes alteradas", this.getCurrentOperatorName(), `Cupom ${input.receiptWidthMm}mm`);
    }
    if (typeof input.receiptPrinterName === "string") {
      const printerName = input.receiptPrinterName.trim();
      this.setSetting("receipt_printer_name", printerName);
      this.recordAudit("configuracoes alteradas", this.getCurrentOperatorName(), printerName ? `Impressora do cupom: ${printerName}` : "Impressora do cupom removida");
    }
    if (typeof input.receiptFooterMessage === "string") {
      this.setSetting("receipt_footer_message", input.receiptFooterMessage.trim() || "Obrigado pela preferencia.");
      this.recordAudit("configuracoes alteradas", this.getCurrentOperatorName(), "Mensagem do cupom atualizada");
    }
    if (typeof input.receiptAutoPrint === "boolean") {
      this.setSetting("receipt_auto_print", String(input.receiptAutoPrint));
      this.recordAudit("configuracoes alteradas", this.getCurrentOperatorName(), `Impressao automatica ${input.receiptAutoPrint ? "ativada" : "desativada"}`);
    }
    return this.getSystemState();
  }

  getReceiptPrintSettings(): { printerName?: string; widthMm: 58 | 80 } {
    const printerName = this.getSetting("receipt_printer_name")?.trim();
    return {
      printerName: printerName || undefined,
      widthMm: this.getSetting("receipt_width_mm") === "58" ? 58 : 80
    };
  }

  getPixConfig(): PixConfig {
    return this.pixService().getPixConfig();
  }

  savePixConfig(input: Partial<PixConfig>): PixConfig {
    this.assertCurrentPermission("configure_pix");
    assertLicensedModule(this, "pix");
    return this.pixService().savePixConfig(input);
  }

  createPixChargeMock(amount: number, saleId?: string): PixCharge {
    assertLicensedModule(this, "pix");
    return this.pixService().createChargeMock(amount, saleId);
  }

  createPixCharge(amount: number, saleId?: string): Promise<PixCharge> {
    assertLicensedModule(this, "pix");
    return this.pixService().createCharge(amount, saleId);
  }

  getPixChargeStatusMock(chargeId: string): PixChargeStatus {
    return this.pixService().getChargeStatusMock(chargeId);
  }

  getPixCharge(chargeId: string, refreshProvider = false): Promise<PixCharge> {
    return this.pixService().getCharge(chargeId, refreshProvider);
  }

  cancelPixChargeMock(chargeId: string): PixCharge {
    assertLicensedModule(this, "pix");
    return this.pixService().cancelChargeMock(chargeId);
  }

  cancelPixCharge(chargeId: string): Promise<PixCharge> {
    assertLicensedModule(this, "pix");
    return this.pixService().cancelCharge(chargeId);
  }

  confirmPixChargeMock(chargeId: string): PixCharge {
    assertLicensedModule(this, "pix");
    return this.pixService().confirmChargeMock(chargeId);
  }

  generateStaticPixQrCodePayload(): string {
    assertLicensedModule(this, "pix");
    return this.pixService().generateStaticQrCodePayload();
  }

  generateDynamicPixQrCodeMock(amount: number, saleId?: string): string {
    assertLicensedModule(this, "pix");
    return this.pixService().generateDynamicQrCodeMock(amount, saleId);
  }

  testPixConnection(): Promise<{ status: PixConnectionStatus; message: string }> {
    this.assertCurrentPermission("configure_pix");
    assertLicensedModule(this, "pix");
    return this.pixService().testConnection();
  }

  getFiscalConfig(): FiscalConfig {
    return this.fiscalService().getFiscalConfig();
  }

  saveFiscalConfig(input: Partial<FiscalConfig>): FiscalConfig {
    this.assertCurrentPermission("configure_fiscal");
    assertLicensedModule(this, "fiscal");
    return this.fiscalService().saveFiscalConfig(input);
  }

  validateFiscalConfig(): { valid: boolean; errors: string[] } {
    this.assertCurrentPermission("configure_fiscal");
    assertLicensedModule(this, "fiscal");
    return this.fiscalService().validateFiscalConfig();
  }

  issueNfceMock(saleId: string): FiscalDocument {
    this.assertCurrentPermission("issue_fiscal");
    assertLicensedModule(this, "fiscal");
    return this.fiscalService().issueNfceMock(saleId);
  }

  cancelFiscalDocumentMock(documentId: string): FiscalDocument {
    this.assertCurrentPermission("cancel_fiscal");
    assertLicensedModule(this, "fiscal");
    return this.fiscalService().cancelFiscalDocumentMock(documentId);
  }

  getFiscalStatusMock(documentId: string) {
    return this.fiscalService().getFiscalStatusMock(documentId);
  }

  listCategories(): Array<{ id: string; name: string; color: string }> {
    return this.db.prepare("SELECT id, name, color FROM categories WHERE company_id = ? ORDER BY name").all(COMPANY_ID) as Array<{ id: string; name: string; color: string }>;
  }

  listSecurity(): SecurityState {
    const roles = this.db
      .prepare(
        `SELECT r.id, r.name, r.code, r.level, r.active
        FROM roles r
        WHERE r.company_id = ?
        ORDER BY r.level DESC`
      )
      .all(COMPANY_ID) as Omit<RoleAccount, "permissions">[];
    const rolePermissions = this.db.prepare("SELECT role_id as roleId, permission_key as permissionKey FROM role_permissions").all() as Array<{ roleId: string; permissionKey: PermissionKey }>;
    const users = this.db
      .prepare(
        `SELECT u.id, u.name, COALESCE(u.username, u.email, '') as username, u.email, u.phone,
          u.role, u.role_id as roleId, COALESCE(r.name, u.role) as roleName,
          COALESCE(u.sector, '') as sector, u.active, u.notes, u.last_access_at as lastAccessAt
        FROM users u
        LEFT JOIN roles r ON r.id = u.role_id
        WHERE u.company_id = ?
        ORDER BY r.level DESC, u.name`
      )
      .all(COMPANY_ID)
      .map((user: any) => {
        const details = this.getUserPermissionDetails(user.id);
        return {
          ...user,
          permissions: details.effective,
          inheritedPermissions: details.inherited,
          addedPermissions: details.added,
          removedPermissions: details.removed
        };
      }) as UserAccount[];
    const sectors = ["Caixa", "Estoque", "Administrativo", "Gerencia"].map((name) => ({
      name,
      description:
        name === "Caixa"
          ? "Operacao de frente de loja e recebimentos."
          : name === "Estoque"
            ? "Reposicao, inventario e conferencia."
            : name === "Administrativo"
              ? "Cadastros, financeiro e suporte."
              : "Aprovacoes, relatorios e acompanhamento remoto.",
      people: users.filter((user) => user.sector === name).length
    }));
    return {
      users,
      roles: roles.map((role) => ({
        ...role,
        permissions: rolePermissions.filter((item) => item.roleId === role.id).map((item) => item.permissionKey)
      })),
      permissions: PERMISSIONS.map((key) => ({ key, label: permissionLabels[key] })),
      sectors
    };
  }

  saveRole(input: SaveRoleInput): RoleAccount {
    this.assertCurrentPermission("manage_users");
    if (!input.name.trim()) throw new Error("Informe o nome do cargo.");
    const id = input.id ?? uid("role");
    const existing = input.id ? this.getRoleById(input.id) : undefined;
    const code = existing?.code ?? input.code?.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_") ?? `custom_${Date.now()}`;
    const permissions = this.normalizePermissionList(input.permissions);
    const timestamp = now();
    const role = {
      id,
      companyId: COMPANY_ID,
      name: input.name.trim(),
      code,
      level: Number(input.level ?? existing?.level ?? 30),
      active: input.active ?? true,
      updatedAt: timestamp
    };
    this.db
      .prepare(
        `INSERT INTO roles (id, company_id, name, code, level, active, updated_at)
        VALUES (@id, @companyId, @name, @code, @level, @active, @updatedAt)
        ON CONFLICT(id) DO UPDATE SET name = @name, level = @level, active = @active, updated_at = @updatedAt`
      )
      .run(role);
    this.replaceRolePermissions(id, permissions);
    this.recordAudit("permissoes alteradas", this.getCurrentOperatorName(), role.name);
    return this.getRoleAccountById(id)!;
  }

  duplicateRole(roleId: string): RoleAccount {
    this.assertCurrentPermission("manage_users");
    const source = this.getRoleAccountById(roleId);
    if (!source) throw new Error("Cargo nao encontrado.");
    return this.saveRole({
      name: `${source.name} copia`,
      code: `${source.code}_copy_${Date.now()}`,
      level: Math.max(1, source.level - 1),
      active: true,
      permissions: source.permissions
    });
  }

  setRoleActive(roleId: string, active: boolean): RoleAccount {
    this.assertCurrentPermission("manage_users");
    const role = this.getRoleAccountById(roleId);
    if (!role) throw new Error("Cargo nao encontrado.");
    if (!active) {
      const inUse = this.db.prepare("SELECT id FROM users WHERE role_id = ? AND active = 1 LIMIT 1").get(roleId);
      if (inUse) throw new Error("Nao e possivel inativar cargo em uso por usuario ativo.");
    }
    this.db.prepare("UPDATE roles SET active = @active, updated_at = @updatedAt WHERE id = @id").run({ id: roleId, active, updatedAt: now() });
    const updated = this.getRoleAccountById(roleId)!;
    this.recordAudit(active ? "cargo ativado" : "cargo inativado", this.getCurrentOperatorName(), updated.name);
    return updated;
  }

  resetRoleDefaults(roleId: string): RoleAccount {
    this.assertCurrentPermission("manage_users");
    const role = this.getRoleAccountById(roleId);
    if (!role) throw new Error("Cargo nao encontrado.");
    const seed = roleSeeds.find((item) => item.id === roleId || item.code === role.code);
    if (!seed) throw new Error("Este cargo nao possui padrao para restaurar.");
    this.db
      .prepare("UPDATE roles SET name = @name, code = @code, level = @level, active = 1, updated_at = @updatedAt WHERE id = @id")
      .run({ id: roleId, name: seed.name, code: seed.code, level: seed.level, updatedAt: now() });
    this.replaceRolePermissions(roleId, seed.permissions);
    const updated = this.getRoleAccountById(roleId)!;
    this.recordAudit("permissoes alteradas", this.getCurrentOperatorName(), `Restaurado padrao: ${updated.name}`);
    return updated;
  }

  listAudit(limit = 80): AuditEntry[] {
    this.assertCurrentPermission("access_audit");
    return this.db
      .prepare("SELECT id, action, actor, details, created_at as createdAt FROM audit_logs ORDER BY created_at DESC LIMIT ?")
      .all(limit) as AuditEntry[];
  }

  getBackupState(): BackupState {
    return {
      backupPath: this.getSetting("backup_path") || this.getDefaultBackupDir(),
      automaticBackupEnabled: this.getSetting("automatic_backup_enabled") === "true",
      lastBackupAt: this.getSetting("last_backup_at")
    };
  }

  exportLocalBackup(): BackupState & { filePath: string } {
    this.assertCurrentPermission("export_backup");
    const backupDir = this.getSetting("backup_path") || this.getDefaultBackupDir();
    const filePath = this.writeBackupFile(backupDir, "manual");
    this.setSetting("last_backup_at", now());
    this.recordAudit("backup local exportado", this.getCurrentOperatorName(), filePath);
    return { ...this.getBackupState(), filePath };
  }

  restoreLocalBackup(filePath: string): BackupState {
    this.assertCurrentPermission("restore_backup");
    const resolved = path.resolve(filePath.trim());
    if (!fs.existsSync(resolved)) throw new Error("Arquivo de backup nao encontrado.");
    const bytes = fs.readFileSync(resolved);
    const SQL = this.SQL;
    if (!SQL) throw new Error("Banco local ainda nao foi inicializado.");
    const current = this.db;
    try {
      const sqlJsDb = new SQL.Database(bytes);
      this.db = new SqlJsAdapter(sqlJsDb, () => this.persist());
      this.db.exec("PRAGMA foreign_keys = ON");
      this.createSchema();
      this.migrateSchema();
      this.ensureSecuritySeed();
      this.ensureDefaultSettings();
      this.persist();
      this.recordAudit("backup local restaurado", this.getCurrentOperatorName(), resolved);
      return this.getBackupState();
    } catch (error) {
      this.db = current;
      throw error instanceof Error ? error : new Error("Nao foi possivel restaurar o backup.");
    }
  }

  private getSecuritySettings(): SecuritySettings {
    const readBool = (key: keyof SecuritySettings, fallback: boolean) => {
      const value = this.getSecuritySetting(key);
      return value === undefined ? fallback : toBoolean(value);
    };
    const readNumber = (key: keyof SecuritySettings, fallback: number) => {
      const value = Number(this.getSecuritySetting(key));
      return Number.isFinite(value) && value > 0 ? value : fallback;
    };
    return {
      requireLoginOnStart: readBool("requireLoginOnStart", true),
      allowQuickPin: readBool("allowQuickPin", true),
      requireManagerAuthorization: readBool("requireManagerAuthorization", true),
      allowMultipleOperators: readBool("allowMultipleOperators", true),
      autoLockEnabled: readBool("autoLockEnabled", false),
      autoLockMinutes: readNumber("autoLockMinutes", 15),
      sessionTimeoutMinutes: readNumber("sessionTimeoutMinutes", 480),
      rememberLastOperator: readBool("rememberLastOperator", true)
    };
  }

  private hasActiveOwnerOrAdmin(): boolean {
    const row = this.db
      .prepare("SELECT COUNT(*) as total FROM users WHERE company_id = ? AND active = 1 AND role IN ('owner', 'admin')")
      .get(COMPANY_ID) as { total: number } | undefined;
    return Number(row?.total ?? 0) > 0;
  }

  private isOwnerOnboardingRequired(): boolean {
    if (this.getSetting("owner_onboarding_completed") === "true" && this.hasActiveOwnerOrAdmin()) return false;
    return !this.hasActiveOwnerOrAdmin();
  }

  private getSecuritySetting(key: string): string | undefined {
    return (this.db.prepare("SELECT value FROM security_settings WHERE company_id = ? AND key = ? LIMIT 1").get(COMPANY_ID, key) as { value: string } | undefined)?.value;
  }

  private setSecuritySetting(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO security_settings (company_id, key, value, updated_at)
        VALUES (@companyId, @key, @value, @updatedAt)
        ON CONFLICT(company_id, key) DO UPDATE SET value = @value, updated_at = @updatedAt`
      )
      .run({ companyId: COMPANY_ID, key, value, updatedAt: now() });
  }

  private getActiveSession(): AuthSession | undefined {
    return this.db
      .prepare(
        `SELECT id, user_id as userId, user_name as userName, role, role_name as roleName,
          operator_id as operatorId, operator_name as operatorName, login_at as loginAt,
          logout_at as logoutAt, active, locked
        FROM sessions
        WHERE company_id = ? AND active = 1
        ORDER BY login_at DESC
        LIMIT 1`
      )
      .get(COMPANY_ID) as AuthSession | undefined;
  }

  private getSessionById(sessionId: string): AuthSession | undefined {
    return this.db
      .prepare(
        `SELECT id, user_id as userId, user_name as userName, role, role_name as roleName,
          operator_id as operatorId, operator_name as operatorName, login_at as loginAt,
          logout_at as logoutAt, active, locked
        FROM sessions WHERE company_id = @companyId AND id = @id`
      )
      .get({ companyId: COMPANY_ID, id: sessionId }) as AuthSession | undefined;
  }

  private getRoleById(roleId: string): { id: string; name: string; code: string; level: number; active: boolean } | undefined {
    return this.db.prepare("SELECT id, name, code, level, active FROM roles WHERE company_id = ? AND id = ? LIMIT 1").get(COMPANY_ID, roleId) as
      | { id: string; name: string; code: string; level: number; active: boolean }
      | undefined;
  }

  private getRoleAccountById(roleId: string): RoleAccount | undefined {
    const role = this.getRoleById(roleId);
    if (!role) return undefined;
    return {
      ...role,
      active: toBoolean(role.active),
      permissions: this.getRolePermissions(roleId)
    };
  }

  private getRolePermissions(roleId: string): PermissionKey[] {
    return this.db
      .prepare("SELECT permission_key as permission FROM role_permissions WHERE role_id = ? ORDER BY permission_key")
      .all(roleId)
      .map((row: any) => row.permission) as PermissionKey[];
  }

  private normalizePermissionList(permissions: PermissionKey[]): PermissionKey[] {
    return Array.from(new Set(permissions.filter((permission): permission is PermissionKey => PERMISSIONS.includes(permission))));
  }

  private replaceRolePermissions(roleId: string, permissions: PermissionKey[]): void {
    this.db.prepare("DELETE FROM role_permissions WHERE role_id = ?").run(roleId);
    permissions.forEach((permission) => {
      this.db.prepare("INSERT OR IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, ?)").run(roleId, permission);
    });
  }

  private getUserAccountById(userId: string): UserAccount | undefined {
    const user = this.db
      .prepare(
        `SELECT u.id, u.name, COALESCE(u.username, u.email, '') as username, u.email, u.phone,
          u.role, u.role_id as roleId, COALESCE(r.name, u.role) as roleName,
          COALESCE(u.sector, '') as sector, u.active, u.notes, u.last_access_at as lastAccessAt
        FROM users u
        LEFT JOIN roles r ON r.id = u.role_id
        WHERE u.company_id = @companyId AND u.id = @id
        LIMIT 1`
      )
      .get({ companyId: COMPANY_ID, id: userId }) as UserAccount | undefined;
    return user ? this.withPermissionDetails(user) : undefined;
  }

  private findUserByLogin(login: string): UserAccount | undefined {
    const normalized = normalizeLogin(login);
    const user = this.db
      .prepare(
        `SELECT u.id, u.name, COALESCE(u.username, u.email, '') as username, u.email, u.phone,
          u.role, u.role_id as roleId, COALESCE(r.name, u.role) as roleName,
          COALESCE(u.sector, '') as sector, u.active, u.notes, u.last_access_at as lastAccessAt
        FROM users u
        LEFT JOIN roles r ON r.id = u.role_id
        WHERE u.company_id = @companyId
          AND (lower(COALESCE(u.username, '')) = @login OR lower(COALESCE(u.email, '')) = @login)
        ORDER BY COALESCE(r.level, 0) DESC
        LIMIT 1`
      )
      .get({ companyId: COMPANY_ID, login: normalized }) as UserAccount | undefined;
    return user ? this.withPermissionDetails(user) : undefined;
  }

  private findUserByCredential(input: AuthCredentialInput): UserAccount | undefined {
    if (input.login) {
      const user = this.findUserByLogin(input.login);
      return user && user.active && this.verifyUserCredential(user.id, input) ? user : undefined;
    }
    const passwordHash = input.password ? hashPassword(input.password) : "";
    const legacyPasswordHash = input.password ? legacyHashPassword(input.password) : "";
    const pinHash = input.pin ? hashPin(input.pin) : "";
    const user = this.db
      .prepare(
        `SELECT u.id, u.name, COALESCE(u.username, u.email, '') as username, u.email, u.phone,
          u.role, u.role_id as roleId, COALESCE(r.name, u.role) as roleName,
          COALESCE(u.sector, '') as sector, u.active, u.notes, u.last_access_at as lastAccessAt
        FROM users u
        LEFT JOIN roles r ON r.id = u.role_id
        WHERE u.company_id = @companyId AND u.active = 1
          AND ((@passwordHash <> '' AND (u.password_hash = @passwordHash OR u.password_hash = @legacyPasswordHash))
            OR (@pinHash <> '' AND u.pin_hash = @pinHash))
        ORDER BY COALESCE(r.level, 0) DESC
        LIMIT 1`
      )
      .get({ companyId: COMPANY_ID, passwordHash, legacyPasswordHash, pinHash }) as UserAccount | undefined;
    return user ? this.withPermissionDetails(user) : undefined;
  }

  private verifyUserCredential(userId: string, input: { password?: string; pin?: string }): boolean {
    if (!input.password && !input.pin) return false;
    const passwordHash = input.password ? hashPassword(input.password) : "";
    const legacyPasswordHash = input.password ? legacyHashPassword(input.password) : "";
    const pinHash = input.pin ? hashPin(input.pin) : "";
    const found = this.db
      .prepare(
        `SELECT id FROM users
        WHERE id = @userId AND active = 1
          AND ((@passwordHash <> '' AND (password_hash = @passwordHash OR password_hash = @legacyPasswordHash))
            OR (@pinHash <> '' AND pin_hash = @pinHash))
        LIMIT 1`
      )
      .get({ userId, passwordHash, legacyPasswordHash, pinHash });
    return Boolean(found);
  }

  private requireCredential(input: AuthCredentialInput): UserAccount {
    const user = this.findUserByCredential(input);
    if (!user) throw new Error("PIN ou senha incorretos.");
    return user;
  }

  private withPermissionDetails(user: UserAccount): UserAccount {
    const details = this.getUserPermissionDetails(user.id);
    return {
      ...user,
      permissions: details.effective,
      inheritedPermissions: details.inherited,
      addedPermissions: details.added,
      removedPermissions: details.removed
    };
  }

  private getUserPermissions(userId: string): PermissionKey[] {
    return this.getUserPermissionDetails(userId).effective;
  }

  private getUserPermissionDetails(userId: string): {
    inherited: PermissionKey[];
    added: PermissionKey[];
    removed: PermissionKey[];
    effective: PermissionKey[];
  } {
    const inherited = this.db
      .prepare(
        `SELECT rp.permission_key as permission
        FROM users u
        JOIN role_permissions rp ON rp.role_id = u.role_id
        WHERE u.id = @userId`
      )
      .all({ userId })
      .map((row: any) => row.permission) as PermissionKey[];
    const overrides = this.db
      .prepare("SELECT permission_key as permission, effect FROM user_permission_overrides WHERE user_id = ?")
      .all(userId) as Array<{ permission: PermissionKey; effect: "allow" | "deny" }>;
    const added = overrides.filter((item) => item.effect === "allow").map((item) => item.permission);
    const removed = overrides.filter((item) => item.effect === "deny").map((item) => item.permission);
    const effective = Array.from(new Set([...inherited, ...added])).filter((permission) => !removed.includes(permission));
    return { inherited, added, removed, effective };
  }

  private saveUserPermissionOverrides(userId: string, overrides: Array<{ permission: PermissionKey; effect: "allow" | "deny" }>): void {
    this.db.prepare("DELETE FROM user_permission_overrides WHERE user_id = ?").run(userId);
    const timestamp = now();
    overrides
      .filter((item) => PERMISSIONS.includes(item.permission) && ["allow", "deny"].includes(item.effect))
      .forEach((item) => {
        this.db
          .prepare(
            `INSERT OR REPLACE INTO user_permission_overrides (user_id, permission_key, effect, updated_at)
            VALUES (@userId, @permission, @effect, @updatedAt)`
          )
          .run({ userId, permission: item.permission, effect: item.effect, updatedAt: timestamp });
      });
  }

  private userHasPermission(userId: string, permission: PermissionKey): boolean {
    return this.getUserPermissions(userId).includes(permission);
  }

  private getCurrentOperator(): UserAccount {
    const session = this.getActiveSession();
    const user = session && !session.locked ? this.getUserAccountById(session.operatorId) : undefined;
    return (
      user ?? {
        id: OPERATOR_ID,
        name: OPERATOR_NAME,
        username: "operador",
        email: "operador@nexpdv.com.br",
        role: "cashier",
        roleName: "Operador de Caixa",
        sector: "Caixa",
        active: true,
        permissions: []
      }
    );
  }

  private getCurrentOperatorName(): string {
    return this.getCurrentOperator().name;
  }

  private assertCurrentPermission(permission: PermissionKey): void {
    if (this.getSetting("use_permissions") !== "true") return;
    const user = this.getCurrentOperator();
    if (this.userHasPermission(user.id, permission)) return;
    this.recordAudit("tentativa acao negada", user.name, permission);
    throw new Error("Acao requer autorizacao.");
  }

  private assertDiscountPermission(permission: "apply_discount" | "apply_high_discount", token?: string): void {
    this.assertAuthorizedPermission(
      permission,
      token,
      permission === "apply_high_discount" ? "Desconto acima de 5% requer autorizacao de gerente." : "Desconto requer autorizacao."
    );
  }

  private assertAuthorizedPermission(permission: PermissionKey, token: string | undefined, message: string): void {
    const sensitiveWithoutRbac = permission === "apply_high_discount" || permission === "authorize_store_credit_limit";
    if (this.getSetting("use_permissions") !== "true" && !sensitiveWithoutRbac) return;
    const user = this.getCurrentOperator();
    if (this.userHasPermission(user.id, permission)) return;
    if (this.consumeAuthorizationToken(permission, token)) return;
    this.recordAudit("tentativa acao negada", user.name, permission);
    throw new Error(message);
  }

  private createAuthorizationToken(userId: string, permission: PermissionKey): string {
    const token = uid("authz");
    this.authorizationTokens.set(token, {
      userId,
      permission,
      expiresAt: Date.now() + 15 * 60_000
    });
    return token;
  }

  private consumeAuthorizationToken(permission: PermissionKey, token?: string): boolean {
    if (!token) return false;
    const authorization = this.authorizationTokens.get(token);
    this.authorizationTokens.delete(token);
    return Boolean(authorization && authorization.permission === permission && authorization.expiresAt >= Date.now());
  }

  private recordAuthLog(userId: string | undefined, action: string, success: boolean, details = ""): void {
    this.db
      .prepare(
        `INSERT INTO auth_logs (id, company_id, user_id, action, success, details, ip, machine_id, device_name, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(uid("auth"), COMPANY_ID, userId, action, success, details, "local", "local-machine", "NexPDV Desktop", now());
  }

  private getDefaultBackupDir(): string {
    return path.join(app.getPath("documents"), "NexPDV Backups");
  }

  private writeBackupFile(backupDir: string, prefix: "manual" | "auto"): string {
    fs.mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filePath = path.join(backupDir, `nexpdv-${prefix}-${stamp}.db`);
    fs.writeFileSync(filePath, Buffer.from(this.db.export()));
    return filePath;
  }

  private runAutomaticBackupIfNeeded(): void {
    if (this.getSetting("automatic_backup_enabled") !== "true") return;
    const lastBackupAt = this.getSetting("last_backup_at");
    const today = new Date().toISOString().slice(0, 10);
    if (lastBackupAt?.slice(0, 10) === today) return;
    const backupDir = this.getSetting("backup_path") || this.getDefaultBackupDir();
    const filePath = this.writeBackupFile(backupDir, "auto");
    this.setSetting("last_backup_at", now());
    this.recordAudit("backup automatico criado", this.getCurrentOperatorName(), filePath);
  }

  private pixService(): PixService {
    return new PixService(this.db, COMPANY_ID, (action, actor, details) => this.recordAudit(action, actor ?? this.getCurrentOperatorName(), details));
  }

  private fiscalService(): FiscalService {
    return new FiscalService(this.db, COMPANY_ID, (action, actor, details) => this.recordAudit(action, actor ?? this.getCurrentOperatorName(), details));
  }

  private ensureLicenseStorage(): void {
    const license = this.getLicense() as LocalLicenseRecord | undefined;
    if (!license) return;
    this.saveLicenseRecord(license);
    if (this.getSetting("system_activated") === "true") {
      this.setSetting("cloud_enabled", String(license.features.cloud));
    }
  }

  private saveLicenseRecord(license: LocalLicenseRecord): void {
    this.db.prepare("DELETE FROM licenses WHERE company_id = ?").run(COMPANY_ID);
    this.db
      .prepare(
        `INSERT INTO licenses (
          id, company_id, key, plan, status, valid_until, demo_mode,
          cloud_enabled, fiscal_enabled, pix_enabled, mobile_enabled, intelligence_enabled,
          owner_email, establishment_name, issued_at, activated_at, last_validated_at,
          validation_mode, signature, features_json
        ) VALUES (
          @id, @companyId, @key, @plan, @status, @validUntil, @demoMode,
          @cloudEnabled, @fiscalEnabled, @pixEnabled, @mobileEnabled, @intelligenceEnabled,
          @ownerEmail, @establishmentName, @issuedAt, @activatedAt, @lastValidatedAt,
          @validationMode, @signature, @featuresJson
        )`
      )
      .run({
        id: license.id,
        companyId: COMPANY_ID,
        key: license.key,
        plan: license.plan,
        status: license.status,
        validUntil: license.validUntil,
        demoMode: license.demoMode ? 1 : 0,
        cloudEnabled: license.features.cloud ? 1 : 0,
        fiscalEnabled: license.features.fiscal ? 1 : 0,
        pixEnabled: license.features.pix ? 1 : 0,
        mobileEnabled: license.features.mobile ? 1 : 0,
        intelligenceEnabled: license.features.intelligence ? 1 : 0,
        ownerEmail: license.ownerEmail ?? "",
        establishmentName: license.establishmentName,
        issuedAt: license.issuedAt,
        activatedAt: license.activatedAt,
        lastValidatedAt: license.lastValidatedAt,
        validationMode: license.validationMode,
        signature: license.signature,
        featuresJson: serializeFeatures(license.features)
      });
  }

  private getSetting(key: string): string | undefined {
    return (this.db.prepare("SELECT value FROM settings WHERE company_id = ? AND key = ? LIMIT 1").get(COMPANY_ID, key) as { value: string } | undefined)?.value;
  }

  private setSetting(key: string, value: string): void {
    const existing = this.getSetting(key);
    const timestamp = now();
    if (existing === undefined) {
      this.db
        .prepare("INSERT INTO settings (id, company_id, key, value, updated_at) VALUES (?, ?, ?, ?, ?)")
        .run(uid("set"), COMPANY_ID, key, value, timestamp);
    } else {
      this.db
        .prepare("UPDATE settings SET value = @value, updated_at = @updatedAt WHERE company_id = @companyId AND key = @key")
        .run({ value, updatedAt: timestamp, companyId: COMPANY_ID, key });
    }
  }

  private recordAudit(action: string, actor?: string, details = ""): void {
    this.db
      .prepare("INSERT INTO audit_logs (id, company_id, action, actor, details, ip, machine_id, device_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(uid("aud"), COMPANY_ID, action, actor || this.getCurrentOperatorName(), details, "local", "local-machine", "NexPDV Desktop", now());
  }

  private persist(): void {
    fs.writeFileSync(this.dbPath, Buffer.from(this.db.export()));
  }

  private resolveSqlJsFile(file: string): string {
    const candidates = [
      path.join(process.cwd(), "node_modules", "sql.js", "dist", file),
      path.join(process.cwd(), "..", "..", "node_modules", "sql.js", "dist", file),
      path.join(app.getAppPath(), "node_modules", "sql.js", "dist", file),
      path.join(app.getAppPath(), "..", "node_modules", "sql.js", "dist", file)
    ];
    return candidates.find((candidate) => fs.existsSync(candidate)) ?? file;
  }

  private createSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS companies (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        document TEXT NOT NULL,
        trade_name TEXT,
        legal_name TEXT,
        state_registration TEXT,
        phone TEXT,
        whatsapp TEXT,
        email TEXT,
        address TEXT,
        city TEXT,
        state TEXT,
        zip_code TEXT,
        logo_url TEXT,
        owner_email TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        name TEXT NOT NULL,
        username TEXT,
        email TEXT,
        phone TEXT,
        role TEXT NOT NULL,
        role_id TEXT,
        sector TEXT,
        password_hash TEXT,
        pin_hash TEXT,
        notes TEXT,
        license_key TEXT,
        source TEXT,
        last_access_at TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS roles (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        level INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS permissions (
        key TEXT PRIMARY KEY,
        label TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS role_permissions (
        role_id TEXT NOT NULL,
        permission_key TEXT NOT NULL,
        PRIMARY KEY (role_id, permission_key)
      );

      CREATE TABLE IF NOT EXISTS user_permission_overrides (
        user_id TEXT NOT NULL,
        permission_key TEXT NOT NULL,
        effect TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, permission_key)
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        user_name TEXT NOT NULL,
        role TEXT NOT NULL,
        role_name TEXT NOT NULL,
        operator_id TEXT NOT NULL,
        operator_name TEXT NOT NULL,
        login_at TEXT NOT NULL,
        logout_at TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        locked INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS auth_logs (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        user_id TEXT,
        action TEXT NOT NULL,
        success INTEGER NOT NULL DEFAULT 0,
        details TEXT,
        ip TEXT,
        machine_id TEXT,
        device_name TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS security_settings (
        company_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (company_id, key)
      );

      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        name TEXT NOT NULL,
        barcode TEXT,
        sku TEXT,
        category_id TEXT,
        brand TEXT,
        cost REAL NOT NULL DEFAULT 0,
        price REAL NOT NULL DEFAULT 0,
        margin REAL NOT NULL DEFAULT 0,
        stock REAL NOT NULL DEFAULT 0,
        min_stock REAL NOT NULL DEFAULT 0,
        unit TEXT NOT NULL DEFAULT 'UN',
        expiration_date TEXT,
        location_enabled INTEGER NOT NULL DEFAULT 0,
        aisle TEXT,
        shelf TEXT,
        gondola TEXT,
        sector TEXT,
        image_url TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL,
        sync_status TEXT NOT NULL DEFAULT 'synced'
      );

      CREATE TABLE IF NOT EXISTS product_stock_movements (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        type TEXT NOT NULL,
        quantity REAL NOT NULL,
        previous_stock REAL NOT NULL,
        new_stock REAL NOT NULL,
        reason TEXT,
        operator_name TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        name TEXT NOT NULL,
        document TEXT,
        phone TEXT,
        whatsapp TEXT,
        address TEXT,
        notes TEXT,
        credit_limit REAL NOT NULL DEFAULT 0,
        balance REAL NOT NULL DEFAULT 0,
        lgpd_accepted INTEGER NOT NULL DEFAULT 0,
        lgpd_accepted_at TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        last_purchase_at TEXT,
        updated_at TEXT NOT NULL,
        sync_status TEXT NOT NULL DEFAULT 'synced'
      );

      CREATE TABLE IF NOT EXISTS sales (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        number TEXT NOT NULL,
        operator_id TEXT NOT NULL,
        operator_name TEXT NOT NULL,
        customer_id TEXT,
        customer_name TEXT,
        subtotal REAL NOT NULL,
        discount REAL NOT NULL,
        total REAL NOT NULL,
        profit REAL NOT NULL,
        notes TEXT,
        status TEXT NOT NULL,
        fiscal_status TEXT NOT NULL DEFAULT 'not_issued',
        fiscal_document_id TEXT,
        access_key TEXT,
        xml_path TEXT,
        danfe_url TEXT,
        fiscal_error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        sync_status TEXT NOT NULL DEFAULT 'pending'
      );

      CREATE TABLE IF NOT EXISTS sale_items (
        id TEXT PRIMARY KEY,
        sale_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit_price REAL NOT NULL,
        discount REAL NOT NULL,
        total REAL NOT NULL,
        cost REAL NOT NULL
      );

      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        sale_id TEXT NOT NULL,
        method TEXT NOT NULL,
        amount REAL NOT NULL,
        change REAL NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS cash_registers (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        operator_id TEXT NOT NULL,
        operator_name TEXT NOT NULL,
        opened_at TEXT NOT NULL,
        closed_at TEXT,
        opening_amount REAL NOT NULL,
        expected_amount REAL NOT NULL,
        counted_amount REAL,
        difference REAL,
        closing_notes TEXT,
        status TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS cash_movements (
        id TEXT PRIMARY KEY,
        cash_register_id TEXT NOT NULL,
        type TEXT NOT NULL,
        description TEXT NOT NULL,
        amount REAL NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sync_queue (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        entity TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        payload TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS licenses (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        key TEXT NOT NULL,
        plan TEXT NOT NULL DEFAULT 'OFFLINE',
        status TEXT NOT NULL,
        valid_until TEXT NOT NULL,
        demo_mode INTEGER NOT NULL DEFAULT 1,
        cloud_enabled INTEGER NOT NULL DEFAULT 0,
        fiscal_enabled INTEGER NOT NULL DEFAULT 0,
        pix_enabled INTEGER NOT NULL DEFAULT 0,
        mobile_enabled INTEGER NOT NULL DEFAULT 0,
        intelligence_enabled INTEGER NOT NULL DEFAULT 0,
        owner_email TEXT,
        establishment_name TEXT,
        issued_at TEXT,
        activated_at TEXT,
        last_validated_at TEXT,
        validation_mode TEXT NOT NULL DEFAULT 'local',
        signature TEXT,
        features_json TEXT
      );

      CREATE TABLE IF NOT EXISTS pix_config (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 0,
        mode TEXT NOT NULL DEFAULT 'manual',
        pix_key TEXT,
        key_type TEXT NOT NULL DEFAULT 'random',
        receiver_name TEXT,
        city TEXT,
        provider TEXT,
        environment TEXT NOT NULL DEFAULT 'sandbox',
        api_key TEXT,
        webhook_url TEXT,
        connection_status TEXT NOT NULL DEFAULT 'unknown',
        last_connection_at TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS pix_charges (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        sale_id TEXT,
        amount REAL NOT NULL,
        status TEXT NOT NULL,
        qr_code_payload TEXT NOT NULL,
        provider TEXT,
        provider_status TEXT,
        provider_payment_id TEXT,
        transaction_id TEXT,
        qr_code TEXT,
        payload_pix TEXT,
        paid_at TEXT,
        pix_mode TEXT,
        manual_confirmation INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        expires_at TEXT
      );

      CREATE TABLE IF NOT EXISTS fiscal_config (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 0,
        environment TEXT NOT NULL DEFAULT 'homologation',
        uf TEXT,
        municipality TEXT,
        tax_regime TEXT,
        state_registration TEXT,
        csc TEXT,
        csc_id TEXT,
        series TEXT NOT NULL DEFAULT '1',
        next_number INTEGER NOT NULL DEFAULT 1,
        default_cfop TEXT,
        default_ncm TEXT,
        default_cst_csosn TEXT,
        certificate_path TEXT,
        certificate_password TEXT,
        provider TEXT,
        api_key TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS fiscal_documents (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        sale_id TEXT NOT NULL,
        status TEXT NOT NULL,
        document_number INTEGER,
        series TEXT,
        access_key TEXT,
        xml_path TEXT,
        danfe_url TEXT,
        error_message TEXT,
        environment TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        action TEXT NOT NULL,
        actor TEXT NOT NULL,
        details TEXT,
        ip TEXT,
        machine_id TEXT,
        device_name TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_products_search ON products(name, barcode, sku);
      CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(created_at);
      CREATE INDEX IF NOT EXISTS idx_sync_status ON sync_queue(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_pix_charges_sale ON pix_charges(sale_id);
      CREATE INDEX IF NOT EXISTS idx_fiscal_documents_sale ON fiscal_documents(sale_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(company_id, active, locked);
      CREATE INDEX IF NOT EXISTS idx_auth_logs_created ON auth_logs(created_at);
      CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON product_stock_movements(product_id, created_at);
    `);
  }

  private migrateSchema(): void {
    const addColumn = (table: string, column: string, definition: string) => {
      const columns = this.db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
      if (!columns.some((item) => item.name === column)) {
        this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      }
    };

    addColumn("companies", "legal_name", "TEXT");
    addColumn("companies", "state_registration", "TEXT");
    addColumn("companies", "whatsapp", "TEXT");
    addColumn("companies", "city", "TEXT");
    addColumn("companies", "state", "TEXT");
    addColumn("companies", "zip_code", "TEXT");
    addColumn("companies", "owner_email", "TEXT");

    addColumn("users", "role_id", "TEXT");
    addColumn("users", "sector", "TEXT");
    addColumn("users", "password_hash", "TEXT");
    addColumn("users", "username", "TEXT");
    addColumn("users", "phone", "TEXT");
    addColumn("users", "pin_hash", "TEXT");
    addColumn("users", "notes", "TEXT");
    addColumn("users", "last_access_at", "TEXT");
    addColumn("users", "license_key", "TEXT");
    addColumn("users", "source", "TEXT");

    addColumn("products", "expiration_date", "TEXT");
    addColumn("products", "location_enabled", "INTEGER NOT NULL DEFAULT 0");
    addColumn("products", "aisle", "TEXT");
    addColumn("products", "shelf", "TEXT");
    addColumn("products", "gondola", "TEXT");
    addColumn("products", "sector", "TEXT");

    addColumn("customers", "lgpd_accepted", "INTEGER NOT NULL DEFAULT 0");
    addColumn("customers", "lgpd_accepted_at", "TEXT");
    addColumn("customers", "active", "INTEGER NOT NULL DEFAULT 1");
    addColumn("customers", "last_purchase_at", "TEXT");

    addColumn("sales", "fiscal_status", "TEXT NOT NULL DEFAULT 'not_issued'");
    addColumn("sales", "fiscal_document_id", "TEXT");
    addColumn("sales", "access_key", "TEXT");
    addColumn("sales", "xml_path", "TEXT");
    addColumn("sales", "danfe_url", "TEXT");
    addColumn("sales", "fiscal_error_message", "TEXT");

    addColumn("cash_registers", "closing_notes", "TEXT");

    addColumn("licenses", "cloud_enabled", "INTEGER NOT NULL DEFAULT 0");
    addColumn("licenses", "fiscal_enabled", "INTEGER NOT NULL DEFAULT 0");
    addColumn("licenses", "pix_enabled", "INTEGER NOT NULL DEFAULT 0");
    addColumn("licenses", "mobile_enabled", "INTEGER NOT NULL DEFAULT 0");
    addColumn("licenses", "intelligence_enabled", "INTEGER NOT NULL DEFAULT 0");
    addColumn("licenses", "owner_email", "TEXT");
    addColumn("licenses", "plan", "TEXT NOT NULL DEFAULT 'OFFLINE'");
    addColumn("licenses", "establishment_name", "TEXT");
    addColumn("licenses", "issued_at", "TEXT");
    addColumn("licenses", "last_validated_at", "TEXT");
    addColumn("licenses", "validation_mode", "TEXT NOT NULL DEFAULT 'local'");
    addColumn("licenses", "signature", "TEXT");
    addColumn("licenses", "features_json", "TEXT");

    addColumn("pix_config", "environment", "TEXT NOT NULL DEFAULT 'sandbox'");
    addColumn("pix_config", "connection_status", "TEXT NOT NULL DEFAULT 'unknown'");
    addColumn("pix_config", "last_connection_at", "TEXT");

    addColumn("pix_charges", "provider_status", "TEXT");
    addColumn("pix_charges", "provider_payment_id", "TEXT");
    addColumn("pix_charges", "transaction_id", "TEXT");
    addColumn("pix_charges", "qr_code", "TEXT");
    addColumn("pix_charges", "payload_pix", "TEXT");
    addColumn("pix_charges", "paid_at", "TEXT");
    addColumn("pix_charges", "pix_mode", "TEXT");
    addColumn("pix_charges", "manual_confirmation", "INTEGER NOT NULL DEFAULT 0");
    addColumn("pix_charges", "error_message", "TEXT");

    addColumn("audit_logs", "ip", "TEXT");
    addColumn("audit_logs", "machine_id", "TEXT");
    addColumn("audit_logs", "device_name", "TEXT");
  }

  private ensureDefaultSettings(): void {
    const defaults: Record<string, string> = {
      use_permissions: "false",
      location_control: "false",
      allow_sales_without_cash_register: "false",
      block_negative_stock: "true",
      automatic_backup_enabled: "false",
      backup_path: this.getDefaultBackupDir(),
      receipt_width_mm: "80",
      receipt_printer_name: "",
      receipt_footer_message: "Obrigado pela preferencia.",
      receipt_auto_print: "true"
    };
    Object.entries(defaults).forEach(([key, value]) => {
      if (this.getSetting(key) === undefined) this.setSetting(key, value);
    });
    const securityDefaults: Record<keyof SecuritySettings, string> = {
      requireLoginOnStart: "true",
      allowQuickPin: "true",
      requireManagerAuthorization: "true",
      allowMultipleOperators: "true",
      autoLockEnabled: "false",
      autoLockMinutes: "15",
      sessionTimeoutMinutes: "480",
      rememberLastOperator: "true"
    };
    Object.entries(securityDefaults).forEach(([key, value]) => {
      if (this.getSecuritySetting(key) === undefined) this.setSecuritySetting(key, value);
    });
  }

  private ensureSecuritySeed(): void {
    const timestamp = now();
    const roleDefaultsVersion = "2026-commercial-v2";
    const refreshDefaultPermissions = this.getSetting("role_defaults_version") !== roleDefaultsVersion;
    const upsertRole = this.db.prepare(
      `INSERT INTO roles (id, company_id, name, code, level, active, updated_at)
      VALUES (@id, @companyId, @name, @code, @level, 1, @updatedAt)
      ON CONFLICT(id) DO UPDATE SET name = @name, code = @code, level = @level, updated_at = @updatedAt`
    );
    roleSeeds.forEach((role) => {
      const existed = this.db.prepare("SELECT id FROM roles WHERE id = ? LIMIT 1").get(role.id);
      upsertRole.run({ ...role, companyId: COMPANY_ID, updatedAt: timestamp });
      if (!existed || refreshDefaultPermissions) {
        this.db.prepare("DELETE FROM role_permissions WHERE role_id = ?").run(role.id);
        role.permissions.forEach((permission) => {
          this.db.prepare("INSERT OR IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, ?)").run(role.id, permission);
        });
      }
    });
    if (refreshDefaultPermissions) this.setSetting("role_defaults_version", roleDefaultsVersion);

    Object.entries(permissionLabels).forEach(([key, label]) => {
      this.db.prepare("INSERT OR REPLACE INTO permissions (key, label) VALUES (?, ?)").run(key, label);
    });

    if (desktopDevUsersEnabled()) {
      const upsertUser = this.db.prepare(
        `INSERT INTO users (id, company_id, name, username, email, phone, role, role_id, sector, password_hash, pin_hash, notes, source, active, created_at, updated_at)
        VALUES (@id, @companyId, @name, @username, @email, @phone, @role, @roleId, @sector, @passwordHash, @pinHash, @notes, 'development_seed', 1, @createdAt, @updatedAt)
        ON CONFLICT(id) DO UPDATE SET name = @name, username = COALESCE(NULLIF(username, ''), @username),
          email = COALESCE(NULLIF(email, ''), @email), phone = COALESCE(phone, @phone), role = @role, role_id = @roleId,
          sector = COALESCE(NULLIF(sector, ''), @sector),
          password_hash = CASE WHEN password_hash IS NULL OR password_hash = '' THEN @passwordHash ELSE password_hash END,
          pin_hash = CASE WHEN pin_hash IS NULL OR pin_hash = '' THEN @pinHash ELSE pin_hash END,
          notes = COALESCE(notes, @notes), source = 'development_seed', active = 1, updated_at = @updatedAt`
      );
      userSeeds.forEach((user) => {
        upsertUser.run({
          ...user,
          companyId: COMPANY_ID,
          passwordHash: hashPassword(user.password),
          pinHash: hashPin(user.pin),
          createdAt: timestamp,
          updatedAt: timestamp
        });
      });
    } else {
      this.removeDevelopmentSeedUsers();
    }
    this.db
      .prepare("UPDATE users SET username = lower(replace(coalesce(username, email, name), ' ', '.')) WHERE company_id = ? AND (username IS NULL OR username = '')")
      .run(COMPANY_ID);
  }

  private removeDevelopmentSeedUsers(): void {
    DEV_USER_IDS.forEach((id) => {
      this.db.prepare("DELETE FROM user_permission_overrides WHERE user_id = ?").run(id);
      this.db.prepare("UPDATE sessions SET active = 0, locked = 0, logout_at = COALESCE(logout_at, ?) WHERE company_id = ? AND (user_id = ? OR operator_id = ?)").run(now(), COMPANY_ID, id, id);
      this.db.prepare("DELETE FROM users WHERE company_id = ? AND id = ?").run(COMPANY_ID, id);
    });
    const lastOperator = this.getSecuritySetting("last_operator_login");
    if (lastOperator && ["dono", "admin", "gerente", "operador"].includes(normalizeLogin(lastOperator))) {
      this.setSecuritySetting("last_operator_login", "");
    }
  }

  private seedInitialData(): void {
    const exists = this.db.prepare("SELECT id FROM companies WHERE id = ?").get(COMPANY_ID);
    if (exists) return;

    const timestamp = now();
    this.db.prepare("INSERT INTO companies (id, name, document, trade_name, phone, email, address, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      COMPANY_ID,
      "NexPDV Comercio Demo LTDA",
      "12.345.678/0001-90",
      "NexPDV Store",
      "(11) 4002-2026",
      "contato@nexpdv.com.br",
      "Av. Paulista, 1000 - Sao Paulo/SP",
      timestamp,
      timestamp
    );
    if (desktopDevUsersEnabled()) {
      this.db.prepare("INSERT INTO users (id, company_id, name, username, email, role, role_id, source, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)").run(
        OPERATOR_ID,
        COMPANY_ID,
        OPERATOR_NAME,
        "operador",
        "operador@nexpdv.com.br",
        "cashier",
        "role_cashier",
        "development_seed",
        timestamp,
        timestamp
      );
    }

    const categories = [
      ["cat_bebidas", "Bebidas", "#2563EB"],
      ["cat_padaria", "Padaria", "#16A085"],
      ["cat_mercearia", "Mercearia", "#F59E0B"],
      ["cat_limpeza", "Limpeza", "#8B5CF6"],
      ["cat_higiene", "Higiene", "#EF4444"]
    ];
    const insertCategory = this.db.prepare("INSERT INTO categories (id, company_id, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)");
    categories.forEach(([id, name, color]) => insertCategory.run(id, COMPANY_ID, name, color, timestamp, timestamp));

    const products = [
      ["prd_001", "Cafe Especial 500g", "7891000000011", "CAF-500", "cat_mercearia", "NexFoods", 12.9, 21.9, 38, 8, "UN"],
      ["prd_002", "Acucar Cristal 1kg", "7891000000028", "ACU-1KG", "cat_mercearia", "DoceLar", 3.7, 5.99, 64, 12, "UN"],
      ["prd_003", "Arroz Tipo 1 5kg", "7891000000035", "ARR-5KG", "cat_mercearia", "CampoBom", 19.8, 29.9, 22, 6, "UN"],
      ["prd_004", "Feijao Carioca 1kg", "7891000000042", "FEI-1KG", "cat_mercearia", "CampoBom", 5.8, 9.49, 42, 10, "UN"],
      ["prd_005", "Agua Mineral 500ml", "7891000000059", "AGU-500", "cat_bebidas", "Serra Azul", 0.9, 2.49, 96, 24, "UN"],
      ["prd_006", "Refrigerante Cola 2L", "7891000000066", "REF-2L", "cat_bebidas", "Fizz", 4.9, 8.99, 26, 10, "UN"],
      ["prd_007", "Suco Integral Uva 1L", "7891000000073", "SUC-UVA", "cat_bebidas", "ValeSul", 9.5, 16.9, 18, 6, "UN"],
      ["prd_008", "Pao Frances Kg", "7891000000080", "PAO-FRA", "cat_padaria", "Padaria", 8.5, 15.99, 12, 5, "KG"],
      ["prd_009", "Bolo Caseiro Unidade", "7891000000097", "BOL-CAS", "cat_padaria", "Padaria", 7.2, 14.9, 8, 3, "UN"],
      ["prd_010", "Manteiga 200g", "7891000000103", "MAN-200", "cat_mercearia", "LeiteBom", 6.1, 10.99, 16, 6, "UN"],
      ["prd_011", "Leite Integral 1L", "7891000000110", "LEI-1L", "cat_bebidas", "LeiteBom", 3.6, 5.99, 44, 12, "UN"],
      ["prd_012", "Detergente Neutro 500ml", "7891000000127", "DET-500", "cat_limpeza", "Brilho", 1.6, 3.49, 58, 18, "UN"],
      ["prd_013", "Sabao em Po 1kg", "7891000000134", "SAB-1KG", "cat_limpeza", "Brilho", 7.4, 13.9, 21, 8, "UN"],
      ["prd_014", "Amaciante 2L", "7891000000141", "AMA-2L", "cat_limpeza", "CasaSoft", 5.2, 9.9, 15, 6, "UN"],
      ["prd_015", "Papel Higienico 12 rolos", "7891000000158", "PAP-12", "cat_higiene", "Soft", 13.9, 22.9, 11, 5, "UN"],
      ["prd_016", "Shampoo 350ml", "7891000000165", "SHA-350", "cat_higiene", "Aura", 8.8, 15.9, 9, 4, "UN"],
      ["prd_017", "Creme Dental 90g", "7891000000172", "CRE-90", "cat_higiene", "Sorriso", 2.9, 5.99, 31, 8, "UN"],
      ["prd_018", "Chocolate Barra 90g", "7891000000189", "CHO-90", "cat_mercearia", "CacauSul", 3.1, 6.49, 27, 9, "UN"],
      ["prd_019", "Biscoito Recheado 120g", "7891000000196", "BIS-120", "cat_mercearia", "Croc", 2.0, 4.29, 33, 10, "UN"],
      ["prd_020", "Cerveja Lata 350ml", "7891000000202", "CER-350", "cat_bebidas", "PuroMalte", 2.8, 5.49, 72, 24, "UN"]
    ];
    const insertProduct = this.db.prepare(
      `INSERT INTO products (id, company_id, name, barcode, sku, category_id, brand, cost, price, margin, stock, min_stock, unit, active, updated_at, sync_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'synced')`
    );
    products.forEach((product) => {
      const [id, name, barcode, sku, categoryId, brand, cost, price, stock, minStock, unit] = product;
      insertProduct.run(id, COMPANY_ID, name, barcode, sku, categoryId, brand, cost, price, calculateMargin(Number(cost), Number(price)), stock, minStock, unit, timestamp);
    });

    const customers = [
      ["cus_001", "Maria Oliveira", "123.456.789-09", "(11) 98888-1001", "(11) 98888-1001", "Cliente recorrente", 500, 0],
      ["cus_002", "Joao Santos", "987.654.321-00", "(21) 97777-2202", "(21) 97777-2202", "Prefere contato por WhatsApp", 300, 45.5],
      ["cus_003", "Mercado Central LTDA", "11.222.333/0001-44", "(31) 3333-9090", "(31) 99999-9090", "Cliente PJ", 1200, 0],
      ["cus_004", "Ana Lima", "456.789.123-10", "(41) 96666-3030", "(41) 96666-3030", "", 250, 0],
      ["cus_005", "Carlos Pereira", "321.654.987-88", "(51) 95555-4040", "(51) 95555-4040", "Tem limite fiado reduzido", 150, 20]
    ];
    const insertCustomer = this.db.prepare(
      `INSERT INTO customers (id, company_id, name, document, phone, whatsapp, notes, credit_limit, balance, updated_at, sync_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')`
    );
    customers.forEach((customer) => insertCustomer.run(customer[0], COMPANY_ID, customer[1], customer[2], customer[3], customer[4], customer[5], customer[6], customer[7], timestamp));

    const licenseValidUntil = new Date();
    licenseValidUntil.setFullYear(licenseValidUntil.getFullYear() + 1);
    this.db.prepare("INSERT INTO licenses (id, company_id, key, status, valid_until, demo_mode, cloud_enabled, fiscal_enabled, pix_enabled, mobile_enabled, intelligence_enabled, activated_at) VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 0, ?)").run(
      "lic_demo",
      COMPANY_ID,
      "NEXPDV-2026",
      "active",
      licenseValidUntil.toISOString(),
      timestamp
    );
    this.openCashRegister(100);
  }

  private getProductById(id: string): Product | undefined {
    return this.db
      .prepare(
        `SELECT p.id, p.company_id as companyId, p.name, p.barcode, p.sku, p.category_id as categoryId,
          c.name as categoryName, p.brand, p.cost, p.price, p.margin, p.stock, p.min_stock as minStock,
          p.unit, p.expiration_date as expirationDate, p.location_enabled as locationEnabled,
          p.aisle, p.shelf, p.gondola, p.sector, p.image_url as imageUrl, p.active,
          p.updated_at as updatedAt, p.sync_status as syncStatus
        FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = ?`
      )
      .get(id) as Product | undefined;
  }

  private getCustomerById(id: string): Customer | undefined {
    return this.db
      .prepare(
        `SELECT id, company_id as companyId, name, document, phone, whatsapp, address, notes,
          credit_limit as creditLimit, balance, lgpd_accepted as lgpdAccepted, lgpd_accepted_at as lgpdAcceptedAt, active,
          last_purchase_at as lastPurchaseAt, updated_at as updatedAt, sync_status as syncStatus
        FROM customers WHERE id = ?`
      )
      .get(id) as Customer | undefined;
  }

  private getSaleItems(saleId: string): SaleItem[] {
    return this.db
      .prepare(
        `SELECT id, sale_id as saleId, product_id as productId, product_name as productName,
          quantity, unit_price as unitPrice, discount, total, cost FROM sale_items WHERE sale_id = ?`
      )
      .all(saleId) as SaleItem[];
  }

  private getPayments(saleId: string): Payment[] {
    return this.db
      .prepare("SELECT id, sale_id as saleId, method, amount, change FROM payments WHERE sale_id = ?")
      .all(saleId) as Payment[];
  }

  private ensureCategory(name: string): string {
    const existing = this.db.prepare("SELECT id FROM categories WHERE company_id = ? AND lower(name) = lower(?)").get(COMPANY_ID, name) as { id: string } | undefined;
    if (existing) return existing.id;
    const id = uid("cat");
    this.db.prepare("INSERT INTO categories (id, company_id, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, COMPANY_ID, name, "#2563EB", now(), now());
    return id;
  }

  private ensureOpenCashRegister(): CashRegister {
    const current = this.getCurrentCashRegister();
    if (current) return current;
    if (this.getSetting("allow_sales_without_cash_register") === "true") {
      return this.openCashRegister(0);
    }
    throw new Error("Caixa fechado. Abra o caixa antes de finalizar vendas.");
  }

  private enqueue(entity: SyncQueueItem["entity"], entityId: string, operation: SyncQueueItem["operation"], payload: unknown): void {
    const timestamp = now();
    this.db
      .prepare(
        `INSERT INTO sync_queue (id, company_id, entity, entity_id, operation, payload, attempts, status, created_at, updated_at)
        VALUES (@id, @companyId, @entity, @entityId, @operation, @payload, 0, 'pending', @createdAt, @updatedAt)`
      )
      .run({
        id: uid("sync"),
        companyId: COMPANY_ID,
        entity,
        entityId,
        operation,
        payload: JSON.stringify(payload),
        createdAt: timestamp,
        updatedAt: timestamp
      });
  }

  private createReceiptHtml(sale: Sale): string {
    const company = this.getCompany();
    const widthMm = this.getSetting("receipt_width_mm") === "58" ? 58 : 80;
    const footer = this.getSetting("receipt_footer_message") || "Obrigado pela preferencia.";
    const escape = (value: unknown) =>
      String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    const money = (value: number) => `R$ ${roundMoney(value).toFixed(2).replace(".", ",")}`;
    const paymentLabels: Record<PaymentMethod, string> = {
      cash: "Dinheiro",
      pix: "Pix",
      credit: "Credito",
      debit: "Debito",
      store_credit: "Fiado"
    };
    const rows = sale.items
      .map(
        (item) => `<tr>
          <td>
            <strong>${escape(item.productName)}</strong>
            <span>${item.quantity} ${escape("UN")} x ${money(item.unitPrice)}${item.discount ? ` - desc. ${money(item.discount)}` : ""}</span>
          </td>
          <td>${money(item.total)}</td>
        </tr>`
      )
      .join("");
    const payments = sale.payments
      .map((payment) => `<div class="line"><span>${paymentLabels[payment.method] ?? payment.method}</span><strong>${money(payment.amount)}</strong></div>${payment.change ? `<div class="line muted"><span>Troco</span><strong>${money(payment.change)}</strong></div>` : ""}`)
      .join("");
    const address = [company.address, company.city, company.state, company.zipCode].filter(Boolean).join(" - ");
    return `<!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>Comprovante ${sale.number}</title>
          <style>
            @page { size: ${widthMm}mm auto; margin: 0; }
            * { box-sizing: border-box; }
            body { font-family: "Arial", "Helvetica", sans-serif; width: ${widthMm}mm; margin: 0; padding: ${widthMm === 58 ? 10 : 14}px; color: #111827; font-size: ${widthMm === 58 ? 11 : 12}px; }
            h1 { font-size: ${widthMm === 58 ? 15 : 18}px; margin: 0; text-align: center; letter-spacing: 0; }
            .center { text-align: center; }
            .muted { color: #4B5563; font-size: ${widthMm === 58 ? 10 : 11}px; }
            .sep { border-top: 1px dashed #9CA3AF; margin: 10px 0; }
            .line { display: flex; justify-content: space-between; gap: 10px; padding: 2px 0; }
            table { width: 100%; border-collapse: collapse; margin: 8px 0; }
            td { padding: 6px 0; border-bottom: 1px dashed #D1D5DB; vertical-align: top; }
            td:first-child { width: 68%; }
            td:last-child { text-align: right; font-weight: 700; }
            td span { display: block; margin-top: 2px; color: #4B5563; font-size: ${widthMm === 58 ? 10 : 11}px; }
            .total { border: 1px solid #111827; padding: 8px; margin-top: 8px; text-align: center; }
            .total strong { display: block; font-size: ${widthMm === 58 ? 19 : 24}px; margin-top: 2px; }
            .nonFiscal { margin-top: 10px; text-align: center; font-weight: 800; letter-spacing: 0; }
          </style>
        </head>
        <body>
          <h1>${escape(company.tradeName || company.name || "NexPDV Store")}</h1>
          ${company.document ? `<div class="center muted">CNPJ/CPF: ${escape(company.document)}</div>` : ""}
          ${address ? `<div class="center muted">${escape(address)}</div>` : ""}
          ${company.phone || company.whatsapp ? `<div class="center muted">Tel: ${escape(company.phone || company.whatsapp)}</div>` : ""}
          <div class="sep"></div>
          <div class="line"><span>Comprovante</span><strong>${escape(sale.number)}</strong></div>
          <div class="line"><span>Data/hora</span><strong>${new Date(sale.createdAt).toLocaleString("pt-BR")}</strong></div>
          <div class="line"><span>Operador</span><strong>${escape(sale.operatorName)}</strong></div>
          <div class="line"><span>Cliente</span><strong>${escape(sale.customerName || "Consumidor")}</strong></div>
          <div class="sep"></div>
          <table>${rows}</table>
          <div class="line"><span>Subtotal</span><strong>${money(sale.subtotal)}</strong></div>
          <div class="line"><span>Desconto</span><strong>${money(sale.discount)}</strong></div>
          <div class="total"><span>Total</span><strong>${money(sale.total)}</strong></div>
          <div class="sep"></div>
          ${payments}
          ${sale.notes ? `<div class="sep"></div><div class="muted">Obs.: ${escape(sale.notes)}</div>` : ""}
          <div class="nonFiscal">COMPROVANTE NAO FISCAL</div>
          <p class="center muted">${escape(footer)}</p>
          <p class="center muted">NexPDV</p>
        </body>
      </html>`;
  }
}
