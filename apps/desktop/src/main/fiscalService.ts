import { randomUUID } from "node:crypto";
import type { FiscalConfig, FiscalDocument, FiscalStatus, Sale } from "@nexpdv/shared";

interface Statement {
  run: (...args: unknown[]) => void;
  get: <T = unknown>(...args: unknown[]) => T | undefined;
  all: <T = unknown>(...args: unknown[]) => T[];
}

interface DatabasePort {
  prepare: (sql: string) => Statement;
}

const CONFIG_ID = "fiscal_config_local";
const now = () => new Date().toISOString();
const uid = (prefix: string) => `${prefix}_${randomUUID()}`;
const bool = (value: unknown): boolean => value === true || value === 1 || value === "1" || value === "true";

export class FiscalService {
  constructor(
    private readonly db: DatabasePort,
    private readonly companyId: string,
    private readonly audit: (action: string, actor?: string, details?: string) => void
  ) {}

  getFiscalConfig(): FiscalConfig {
    const row = this.db
      .prepare(
        `SELECT id, company_id as companyId, enabled, environment, uf, municipality, tax_regime as taxRegime,
          state_registration as stateRegistration, csc, csc_id as cscId, series, next_number as nextNumber,
          default_cfop as defaultCfop, default_ncm as defaultNcm, default_cst_csosn as defaultCstCsosn,
          certificate_path as certificatePath, certificate_password as certificatePassword,
          provider, api_key as apiKey, updated_at as updatedAt
        FROM fiscal_config WHERE company_id = ? LIMIT 1`
      )
      .get(COMPANY_ID_SAFE(this.companyId)) as (FiscalConfig & { enabled: number | boolean }) | undefined;
    return row ? { ...row, enabled: bool(row.enabled) } : this.defaultConfig();
  }

  saveFiscalConfig(input: Partial<FiscalConfig>): FiscalConfig {
    const current = this.getFiscalConfig();
    const config: FiscalConfig = {
      ...current,
      ...input,
      id: CONFIG_ID,
      companyId: this.companyId,
      enabled: input.enabled ?? current.enabled,
      environment: input.environment ?? current.environment,
      uf: input.uf?.trim().toUpperCase() ?? current.uf,
      municipality: input.municipality?.trim() ?? current.municipality,
      taxRegime: input.taxRegime?.trim() ?? current.taxRegime,
      stateRegistration: input.stateRegistration?.trim() ?? current.stateRegistration,
      csc: input.csc?.trim() ?? current.csc,
      cscId: input.cscId?.trim() ?? current.cscId,
      series: input.series?.trim() ?? current.series,
      nextNumber: Number(input.nextNumber ?? current.nextNumber ?? 1),
      defaultCfop: input.defaultCfop?.trim() ?? current.defaultCfop,
      defaultNcm: input.defaultNcm?.trim() ?? current.defaultNcm,
      defaultCstCsosn: input.defaultCstCsosn?.trim() ?? current.defaultCstCsosn,
      certificatePath: input.certificatePath?.trim() ?? current.certificatePath,
      certificatePassword: input.certificatePassword?.trim() ?? current.certificatePassword,
      provider: input.provider?.trim() ?? current.provider,
      apiKey: input.apiKey?.trim() ?? current.apiKey,
      updatedAt: now()
    };
    this.db
      .prepare(
        `INSERT INTO fiscal_config (id, company_id, enabled, environment, uf, municipality, tax_regime,
          state_registration, csc, csc_id, series, next_number, default_cfop, default_ncm, default_cst_csosn,
          certificate_path, certificate_password, provider, api_key, updated_at)
        VALUES (@id, @companyId, @enabled, @environment, @uf, @municipality, @taxRegime,
          @stateRegistration, @csc, @cscId, @series, @nextNumber, @defaultCfop, @defaultNcm, @defaultCstCsosn,
          @certificatePath, @certificatePassword, @provider, @apiKey, @updatedAt)
        ON CONFLICT(id) DO UPDATE SET enabled = @enabled, environment = @environment, uf = @uf,
          municipality = @municipality, tax_regime = @taxRegime, state_registration = @stateRegistration,
          csc = @csc, csc_id = @cscId, series = @series, next_number = @nextNumber,
          default_cfop = @defaultCfop, default_ncm = @defaultNcm, default_cst_csosn = @defaultCstCsosn,
          certificate_path = @certificatePath, certificate_password = @certificatePassword,
          provider = @provider, api_key = @apiKey, updated_at = @updatedAt`
      )
      .run(config);
    this.audit("Fiscal configurado", undefined, `${config.environment} - ${config.uf}`);
    return this.getFiscalConfig();
  }

  validateFiscalConfig(input: Partial<FiscalConfig> = this.getFiscalConfig()): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!input.uf) errors.push("UF obrigatoria.");
    if (!input.municipality) errors.push("Municipio obrigatorio.");
    if (!input.taxRegime) errors.push("Regime tributario obrigatorio.");
    if (!input.stateRegistration) errors.push("Inscricao estadual obrigatoria.");
    if (!input.series) errors.push("Serie NFC-e obrigatoria.");
    if (!input.defaultCfop) errors.push("CFOP padrao obrigatorio.");
    if (!input.defaultNcm) errors.push("NCM padrao obrigatorio.");
    if (!input.defaultCstCsosn) errors.push("CST/CSOSN padrao obrigatorio.");
    this.audit("teste fiscal executado", undefined, errors.length ? errors.join(" ") : "Configuracao fiscal mock valida.");
    return { valid: errors.length === 0, errors };
  }

  prepareNfcePayload(sale: Sale): unknown {
    const config = this.getFiscalConfig();
    return {
      environment: config.environment,
      companyId: this.companyId,
      saleId: sale.id,
      saleNumber: sale.number,
      total: sale.total,
      customer: { id: sale.customerId, name: sale.customerName },
      items: sale.items.map((item) => ({
        productId: item.productId,
        name: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.total,
        cfop: config.defaultCfop,
        ncm: config.defaultNcm,
        cstCsosn: config.defaultCstCsosn
      }))
    };
  }

  issueNfceMock(saleId: string): FiscalDocument {
    const sale = this.getSale(saleId);
    if (!sale) throw new Error("Venda nao encontrada.");
    const config = this.getFiscalConfig();
    const validation = this.validateFiscalConfig(config);
    const timestamp = now();
    const documentId = uid("nfce");
    const documentNumber = config.nextNumber || 1;
    const status: FiscalStatus = validation.valid ? "authorized" : "rejected";
    const accessKey = validation.valid ? this.createAccessKey(documentNumber, sale.id) : undefined;
    const document: FiscalDocument = {
      id: documentId,
      companyId: this.companyId,
      saleId: sale.id,
      status,
      documentNumber,
      series: config.series,
      accessKey,
      xmlPath: accessKey ? `mock://nfce/${accessKey}.xml` : undefined,
      danfeUrl: accessKey ? `mock://danfe/${accessKey}` : undefined,
      errorMessage: validation.valid ? undefined : validation.errors.join(" "),
      environment: config.environment,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.db
      .prepare(
        `INSERT INTO fiscal_documents (id, company_id, sale_id, status, document_number, series, access_key,
          xml_path, danfe_url, error_message, environment, created_at, updated_at)
        VALUES (@id, @companyId, @saleId, @status, @documentNumber, @series, @accessKey,
          @xmlPath, @danfeUrl, @errorMessage, @environment, @createdAt, @updatedAt)`
      )
      .run(document);
    this.db
      .prepare(
        `UPDATE sales SET fiscal_status = @status, fiscal_document_id = @documentId, access_key = @accessKey,
          xml_path = @xmlPath, danfe_url = @danfeUrl, fiscal_error_message = @errorMessage,
          updated_at = @updatedAt WHERE id = @saleId`
      )
      .run({ ...document, documentId, updatedAt: timestamp });
    if (validation.valid) {
      this.db.prepare("UPDATE fiscal_config SET next_number = next_number + 1, updated_at = @updatedAt WHERE id = @id").run({ id: CONFIG_ID, updatedAt: timestamp });
    }
    this.audit("NFC-e mock emitida", undefined, `${sale.number}: ${status}`);
    return document;
  }

  cancelFiscalDocumentMock(documentId: string): FiscalDocument {
    const document = this.getFiscalDocument(documentId);
    if (!document) throw new Error("Documento fiscal nao encontrado.");
    const timestamp = now();
    this.db.prepare("UPDATE fiscal_documents SET status = 'cancelled', updated_at = @updatedAt WHERE id = @id").run({ id: document.id, updatedAt: timestamp });
    this.db
      .prepare("UPDATE sales SET fiscal_status = 'cancelled', fiscal_error_message = '', updated_at = @updatedAt WHERE id = @saleId")
      .run({ saleId: document.saleId, updatedAt: timestamp });
    const updated = this.getFiscalDocument(document.id)!;
    this.audit("NFC-e mock cancelada", undefined, document.id);
    return updated;
  }

  getFiscalStatusMock(documentId: string): FiscalStatus {
    return this.getFiscalDocument(documentId)?.status ?? "not_issued";
  }

  private getFiscalDocument(documentId: string): FiscalDocument | undefined {
    return this.db
      .prepare(
        `SELECT id, company_id as companyId, sale_id as saleId, status, document_number as documentNumber,
          series, access_key as accessKey, xml_path as xmlPath, danfe_url as danfeUrl,
          error_message as errorMessage, environment, created_at as createdAt, updated_at as updatedAt
        FROM fiscal_documents WHERE id = ?`
      )
      .get<FiscalDocument>(documentId);
  }

  private getSale(saleId: string): Sale | undefined {
    const sale = this.db
      .prepare(
        `SELECT id, company_id as companyId, number, operator_id as operatorId, operator_name as operatorName,
          customer_id as customerId, customer_name as customerName, subtotal, discount, total, profit,
          notes, status, fiscal_status as fiscalStatus, fiscal_document_id as fiscalDocumentId,
          access_key as accessKey, xml_path as xmlPath, danfe_url as danfeUrl,
          fiscal_error_message as fiscalErrorMessage, created_at as createdAt, updated_at as updatedAt,
          sync_status as syncStatus
        FROM sales WHERE id = ?`
      )
      .get<Omit<Sale, "items" | "payments">>(saleId);
    if (!sale) return undefined;
    const items = this.db
      .prepare(
        `SELECT id, sale_id as saleId, product_id as productId, product_name as productName,
          quantity, unit_price as unitPrice, discount, total, cost FROM sale_items WHERE sale_id = ?`
      )
      .all(saleId) as Sale["items"];
    const payments = this.db.prepare("SELECT id, sale_id as saleId, method, amount, change FROM payments WHERE sale_id = ?").all(saleId) as Sale["payments"];
    return { ...sale, items, payments };
  }

  private createAccessKey(documentNumber: number, saleId: string): string {
    const numeric = `${Date.now()}${documentNumber}${saleId.replace(/\D/g, "").slice(0, 8)}`.padEnd(44, "0");
    return numeric.slice(0, 44);
  }

  private defaultConfig(): FiscalConfig {
    return {
      id: CONFIG_ID,
      companyId: this.companyId,
      enabled: false,
      environment: "homologation",
      uf: "",
      municipality: "",
      taxRegime: "",
      stateRegistration: "",
      csc: "",
      cscId: "",
      series: "1",
      nextNumber: 1,
      defaultCfop: "5102",
      defaultNcm: "",
      defaultCstCsosn: "",
      certificatePath: "",
      certificatePassword: "",
      provider: "",
      apiKey: "",
      updatedAt: now()
    };
  }
}

const COMPANY_ID_SAFE = (companyId: string) => companyId;
