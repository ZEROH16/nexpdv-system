import { randomUUID } from "node:crypto";
import { roundMoney, type PixCharge, type PixChargeStatus, type PixConfig, type PixConnectionStatus, type PixEnvironment, type PixProviderCode } from "@nexpdv/shared";
import { createPixProvider, normalizePixProvider } from "./pixProviders/registry";

interface Statement {
  run: (...args: unknown[]) => void;
  get: <T = unknown>(...args: unknown[]) => T | undefined;
}

interface DatabasePort {
  prepare: (sql: string) => Statement;
}

const CONFIG_ID = "pix_config_local";
const now = () => new Date().toISOString();
const uid = (prefix: string) => `${prefix}_${randomUUID()}`;
const bool = (value: unknown): boolean => value === true || value === 1 || value === "1" || value === "true";
const maskSecret = (value?: string): string => {
  if (!value) return "";
  const visible = value.slice(-4);
  return `••••••••${visible}`;
};
const isMaskedSecret = (value?: string): boolean => Boolean(value && (value.includes("•") || value.startsWith("****")));
const safeError = (error: unknown): string => (error instanceof Error ? error.message : "Falha desconhecida no Pix.");

export class PixService {
  constructor(
    private readonly db: DatabasePort,
    private readonly companyId: string,
    private readonly audit: (action: string, actor?: string, details?: string) => void
  ) {}

  getPixConfig(): PixConfig {
    return this.toPublicConfig(this.getRawPixConfig());
  }

  savePixConfig(input: Partial<PixConfig>): PixConfig {
    const current = this.getRawPixConfig();
    const incomingToken = typeof input.apiKey === "string" ? input.apiKey.trim() : undefined;
    const config: PixConfig = {
      ...current,
      ...input,
      id: CONFIG_ID,
      companyId: this.companyId,
      enabled: input.enabled ?? current.enabled,
      mode: input.mode ?? current.mode,
      key: input.key?.trim() ?? current.key,
      keyType: input.keyType ?? current.keyType,
      receiverName: input.receiverName?.trim() ?? current.receiverName,
      city: input.city?.trim() ?? current.city,
      provider: normalizePixProvider(input.provider ?? current.provider),
      environment: input.environment ?? current.environment ?? "sandbox",
      apiKey: incomingToken === undefined || isMaskedSecret(incomingToken) ? current.apiKey : incomingToken,
      webhookUrl: input.webhookUrl?.trim() ?? current.webhookUrl,
      connectionStatus: input.connectionStatus ?? current.connectionStatus ?? "unknown",
      lastConnectionAt: current.lastConnectionAt,
      updatedAt: now()
    };
    this.db
      .prepare(
        `INSERT INTO pix_config (id, company_id, enabled, mode, pix_key, key_type, receiver_name, city, provider, environment, api_key, webhook_url, connection_status, last_connection_at, updated_at)
        VALUES (@id, @companyId, @enabled, @mode, @key, @keyType, @receiverName, @city, @provider, @environment, @apiKey, @webhookUrl, @connectionStatus, @lastConnectionAt, @updatedAt)
        ON CONFLICT(id) DO UPDATE SET enabled = @enabled, mode = @mode, pix_key = @key, key_type = @keyType,
          receiver_name = @receiverName, city = @city, provider = @provider, environment = @environment,
          api_key = @apiKey, webhook_url = @webhookUrl, connection_status = @connectionStatus,
          last_connection_at = @lastConnectionAt, updated_at = @updatedAt`
      )
      .run(config);
    this.audit("Pix configurado", undefined, `${config.provider} - ${config.environment}`);
    return this.getPixConfig();
  }

  async testConnection(): Promise<{ status: PixConnectionStatus; message: string }> {
    const config = this.getRawPixConfig();
    const provider = createPixProvider({ config, companyId: this.companyId, audit: this.audit });
    const result = await provider.testConnection();
    this.updateConnectionStatus(result.status);
    this.audit("teste Pix executado", undefined, `${config.provider}: ${result.status}`);
    return result;
  }

  async createCharge(amount: number, saleId?: string): Promise<PixCharge> {
    const config = this.getRawPixConfig();
    if (!config.enabled) throw new Error("Pix nao esta ativo nas configuracoes.");
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Valor Pix invalido.");

    const chargeId = uid("pix");
    const createdAt = now();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const providerCode = normalizePixProvider(config.provider);
    const provider = createPixProvider({ config, companyId: this.companyId, audit: this.audit });

    try {
      const result = await provider.createCharge({
        id: chargeId,
        amount,
        saleId,
        referenceId: `NEXPDV-${chargeId}`.slice(0, 64),
        description: "Venda NexPDV",
        expiresAt,
        mode: config.mode
      });
      const charge = this.insertCharge({
        id: chargeId,
        companyId: this.companyId,
        saleId,
        amount: roundMoney(amount),
        status: result.status,
        qrCodePayload: result.qrCodePayload,
        payloadPix: result.payloadPix || result.qrCodePayload,
        qrCode: result.qrCode,
        provider: result.provider,
        providerStatus: result.providerStatus,
        providerPaymentId: result.providerPaymentId,
        transactionId: result.transactionId,
        pixMode: config.mode,
        manualConfirmation: false,
        errorMessage: result.errorMessage,
        createdAt,
        updatedAt: createdAt,
        expiresAt: result.expiresAt || expiresAt,
        paidAt: result.paidAt
      });
      this.audit(providerCode === "pagbank" ? "Pix criado" : "cobranca Pix mock criada", undefined, `${charge.provider}: ${charge.amount}`);
      return charge;
    } catch (error) {
      const message = safeError(error);
      this.audit("erro integracao Pix", undefined, `${providerCode}: ${message}`);
      if (providerCode !== "pagbank") throw error;

      const fallbackPayload = this.generateDynamicQrCodeMock(amount, saleId, chargeId);
      const fallbackCharge = this.insertCharge({
        id: chargeId,
        companyId: this.companyId,
        saleId,
        amount: roundMoney(amount),
        status: "waiting",
        qrCodePayload: fallbackPayload,
        payloadPix: fallbackPayload,
        provider: "pagbank",
        providerStatus: "OFFLINE_FALLBACK",
        providerPaymentId: chargeId,
        pixMode: config.mode,
        manualConfirmation: false,
        errorMessage: `Fallback manual: ${message}`,
        createdAt,
        updatedAt: createdAt,
        expiresAt
      });
      this.audit("fallback manual Pix", undefined, message);
      return fallbackCharge;
    }
  }

  createChargeMock(amount: number, saleId?: string): PixCharge {
    const config = { ...this.getRawPixConfig(), provider: "mock" as PixProviderCode };
    const chargeId = uid("pix");
    const createdAt = now();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const payload = this.generateDynamicQrCodeMock(amount, saleId, chargeId);
    const charge = this.insertCharge({
      id: chargeId,
      companyId: this.companyId,
      saleId,
      amount: roundMoney(amount),
      status: "waiting",
      qrCodePayload: payload,
      payloadPix: payload,
      provider: "mock",
      providerStatus: "MOCK_WAITING",
      providerPaymentId: chargeId,
      pixMode: config.mode,
      manualConfirmation: false,
      createdAt,
      updatedAt: createdAt,
      expiresAt
    });
    this.audit("cobranca Pix mock criada", undefined, `${charge.id}: ${charge.amount}`);
    return charge;
  }

  getChargeStatusMock(chargeId: string): PixChargeStatus {
    return this.getStoredCharge(chargeId)?.status ?? "expired";
  }

  async getCharge(chargeId: string, refreshProvider = false): Promise<PixCharge> {
    const charge = this.getStoredCharge(chargeId);
    if (!charge) throw new Error("Cobranca Pix nao encontrada.");
    if (!refreshProvider || charge.status !== "waiting") return this.expireIfNeeded(charge);
    if (charge.provider === "pagbank" && charge.providerStatus !== "OFFLINE_FALLBACK") return this.refreshPagBankCharge(charge);
    return this.expireIfNeeded(charge);
  }

  getChargeMock(chargeId: string): PixCharge | undefined {
    return this.getStoredCharge(chargeId);
  }

  confirmChargeMock(chargeId: string): PixCharge {
    return this.updateCharge(chargeId, {
      status: "paid",
      providerStatus: "MANUAL_CONFIRMED",
      manualConfirmation: true,
      paidAt: now(),
      auditAction: "pagamento Pix confirmado manualmente"
    });
  }

  async cancelCharge(chargeId: string): Promise<PixCharge> {
    const charge = this.getStoredCharge(chargeId);
    if (!charge) throw new Error("Cobranca Pix nao encontrada.");
    const config = this.getRawPixConfig();
    const provider = createPixProvider({ config, companyId: this.companyId, audit: this.audit });
    const result = charge.provider === "pagbank" ? await provider.cancelCharge(charge) : { status: "cancelled" as const, providerStatus: "CANCELLED" };
    return this.updateCharge(chargeId, {
      status: result.status,
      providerStatus: result.providerStatus,
      errorMessage: result.errorMessage,
      auditAction: result.status === "cancelled" ? "Pix cancelado" : "erro integracao Pix"
    });
  }

  cancelChargeMock(chargeId: string): PixCharge {
    return this.updateCharge(chargeId, { status: "cancelled", providerStatus: "MOCK_CANCELLED", auditAction: "cobranca Pix mock cancelada" });
  }

  linkChargeToSale(chargeId: string | undefined, saleId: string): void {
    if (!chargeId) return;
    this.db.prepare("UPDATE pix_charges SET sale_id = @saleId, updated_at = @updatedAt WHERE id = @id").run({ id: chargeId, saleId, updatedAt: now() });
  }

  generateStaticQrCodePayload(config = this.getRawPixConfig()): string {
    return [
      "NEXPDV_PIX_STATIC_MOCK",
      `KEY=${config.key || "CHAVE_PIX_NAO_CONFIGURADA"}`,
      `TYPE=${config.keyType || "random"}`,
      `NAME=${config.receiverName || "NEXPDV"}`,
      `CITY=${config.city || "SAO PAULO"}`
    ].join("|");
  }

  generateDynamicQrCodeMock(amount: number, saleId?: string, chargeId = uid("pix")): string {
    const config = this.getRawPixConfig();
    return [
      "NEXPDV_PIX_DYNAMIC_MOCK",
      `ID=${chargeId}`,
      `SALE=${saleId || "SEM_VENDA"}`,
      `AMOUNT=${roundMoney(amount).toFixed(2)}`,
      `KEY=${config.key || "CHAVE_PIX_NAO_CONFIGURADA"}`,
      `NAME=${config.receiverName || "NEXPDV"}`
    ].join("|");
  }

  private async refreshPagBankCharge(charge: PixCharge): Promise<PixCharge> {
    const config = this.getRawPixConfig();
    const provider = createPixProvider({ config, companyId: this.companyId, audit: this.audit });
    try {
      const result = await provider.getChargeStatus(charge);
      const updated = this.updateCharge(charge.id, {
        status: result.status,
        providerStatus: result.providerStatus,
        transactionId: result.transactionId,
        paidAt: result.paidAt,
        errorMessage: result.errorMessage
      });
      if (result.status === "paid" && charge.status !== "paid") this.audit("Pix aprovado", undefined, `${charge.id}: ${charge.amount}`);
      if (result.status === "expired" && charge.status !== "expired") this.audit("Pix expirado", undefined, charge.id);
      return updated;
    } catch (error) {
      const message = safeError(error);
      this.audit("falha conexao Pix", undefined, message);
      return this.updateCharge(charge.id, { providerStatus: "OFFLINE", errorMessage: message });
    }
  }

  private expireIfNeeded(charge: PixCharge): PixCharge {
    if (charge.status === "waiting" && charge.expiresAt && new Date(charge.expiresAt).getTime() <= Date.now()) {
      return this.updateCharge(charge.id, { status: "expired", providerStatus: "EXPIRED", auditAction: "Pix expirado" });
    }
    return charge;
  }

  private insertCharge(charge: PixCharge): PixCharge {
    this.db
      .prepare(
        `INSERT INTO pix_charges (id, company_id, sale_id, amount, status, qr_code_payload, provider,
          provider_status, provider_payment_id, transaction_id, qr_code, payload_pix, paid_at, pix_mode,
          manual_confirmation, error_message, created_at, updated_at, expires_at)
        VALUES (@id, @companyId, @saleId, @amount, @status, @qrCodePayload, @provider,
          @providerStatus, @providerPaymentId, @transactionId, @qrCode, @payloadPix, @paidAt, @pixMode,
          @manualConfirmation, @errorMessage, @createdAt, @updatedAt, @expiresAt)`
      )
      .run({ ...charge, manualConfirmation: charge.manualConfirmation ? 1 : 0 });
    return charge;
  }

  private updateCharge(
    chargeId: string,
    input: Partial<PixCharge> & { auditAction?: string }
  ): PixCharge {
    const current = this.getStoredCharge(chargeId);
    if (!current) throw new Error("Cobranca Pix nao encontrada.");
    const updated: PixCharge = {
      ...current,
      ...input,
      updatedAt: now()
    };
    this.db
      .prepare(
        `UPDATE pix_charges SET status = @status, provider_status = @providerStatus, transaction_id = @transactionId,
          paid_at = @paidAt, manual_confirmation = @manualConfirmation, error_message = @errorMessage,
          updated_at = @updatedAt WHERE id = @id`
      )
      .run({
        id: chargeId,
        status: updated.status,
        providerStatus: updated.providerStatus,
        transactionId: updated.transactionId,
        paidAt: updated.paidAt,
        manualConfirmation: updated.manualConfirmation ? 1 : 0,
        errorMessage: updated.errorMessage,
        updatedAt: updated.updatedAt
      });
    if (input.auditAction) this.audit(input.auditAction, undefined, `${updated.id}: ${updated.amount}`);
    return this.getStoredCharge(chargeId) ?? updated;
  }

  private getStoredCharge(chargeId: string): PixCharge | undefined {
    const row = this.db
      .prepare(
        `SELECT id, company_id as companyId, sale_id as saleId, amount, status, qr_code_payload as qrCodePayload,
          provider, provider_status as providerStatus, provider_payment_id as providerPaymentId,
          transaction_id as transactionId, qr_code as qrCode, payload_pix as payloadPix, paid_at as paidAt,
          pix_mode as pixMode, manual_confirmation as manualConfirmation, error_message as errorMessage,
          created_at as createdAt, updated_at as updatedAt, expires_at as expiresAt
        FROM pix_charges WHERE id = ?`
      )
      .get<PixCharge & { manualConfirmation?: number | boolean }>(chargeId);
    return row ? { ...row, manualConfirmation: bool(row.manualConfirmation) } : undefined;
  }

  private getRawPixConfig(): PixConfig {
    const row = this.db
      .prepare(
        `SELECT id, company_id as companyId, enabled, mode, pix_key as key, key_type as keyType,
          receiver_name as receiverName, city, provider, environment, api_key as apiKey, webhook_url as webhookUrl,
          connection_status as connectionStatus, last_connection_at as lastConnectionAt, updated_at as updatedAt
        FROM pix_config WHERE company_id = ? LIMIT 1`
      )
      .get(COMPANY_ID_SAFE(this.companyId)) as (PixConfig & { enabled: number | boolean }) | undefined;
    return row ? { ...row, enabled: bool(row.enabled), provider: normalizePixProvider(row.provider), environment: (row.environment ?? "sandbox") as PixEnvironment } : this.defaultConfig();
  }

  private toPublicConfig(config: PixConfig): PixConfig {
    const envToken =
      config.environment === "production"
        ? process.env.PAGBANK_TOKEN || process.env.PAGSEGURO_TOKEN
        : process.env.PAGBANK_SANDBOX_TOKEN || process.env.PAGSEGURO_SANDBOX_TOKEN || process.env.PAGBANK_TOKEN || process.env.PAGSEGURO_TOKEN;
    return {
      ...config,
      apiKey: maskSecret(config.apiKey || envToken)
    };
  }

  private updateConnectionStatus(status: PixConnectionStatus): void {
    this.db
      .prepare("UPDATE pix_config SET connection_status = @status, last_connection_at = @updatedAt, updated_at = @updatedAt WHERE company_id = @companyId")
      .run({ companyId: this.companyId, status, updatedAt: now() });
  }

  private defaultConfig(): PixConfig {
    return {
      id: CONFIG_ID,
      companyId: this.companyId,
      enabled: false,
      mode: "manual",
      key: "",
      keyType: "random",
      receiverName: "",
      city: "",
      provider: "mock",
      environment: "sandbox",
      apiKey: "",
      webhookUrl: "",
      connectionStatus: "unknown",
      updatedAt: now()
    };
  }
}

const COMPANY_ID_SAFE = (companyId: string) => companyId;
