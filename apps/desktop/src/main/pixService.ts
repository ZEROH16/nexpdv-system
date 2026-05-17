import { randomUUID } from "node:crypto";
import { roundMoney, type PixCharge, type PixChargeStatus, type PixConfig } from "@nexpdv/shared";

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

export class PixService {
  constructor(
    private readonly db: DatabasePort,
    private readonly companyId: string,
    private readonly audit: (action: string, actor?: string, details?: string) => void
  ) {}

  getPixConfig(): PixConfig {
    const row = this.db
      .prepare(
        `SELECT id, company_id as companyId, enabled, mode, pix_key as key, key_type as keyType,
          receiver_name as receiverName, city, provider, api_key as apiKey, webhook_url as webhookUrl,
          updated_at as updatedAt
        FROM pix_config WHERE company_id = ? LIMIT 1`
      )
      .get(COMPANY_ID_SAFE(this.companyId)) as (PixConfig & { enabled: number | boolean }) | undefined;
    return row ? { ...row, enabled: bool(row.enabled) } : this.defaultConfig();
  }

  savePixConfig(input: Partial<PixConfig>): PixConfig {
    const current = this.getPixConfig();
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
      provider: input.provider?.trim() ?? current.provider,
      apiKey: input.apiKey?.trim() ?? current.apiKey,
      webhookUrl: input.webhookUrl?.trim() ?? current.webhookUrl,
      updatedAt: now()
    };
    this.db
      .prepare(
        `INSERT INTO pix_config (id, company_id, enabled, mode, pix_key, key_type, receiver_name, city, provider, api_key, webhook_url, updated_at)
        VALUES (@id, @companyId, @enabled, @mode, @key, @keyType, @receiverName, @city, @provider, @apiKey, @webhookUrl, @updatedAt)
        ON CONFLICT(id) DO UPDATE SET enabled = @enabled, mode = @mode, pix_key = @key, key_type = @keyType,
          receiver_name = @receiverName, city = @city, provider = @provider, api_key = @apiKey,
          webhook_url = @webhookUrl, updated_at = @updatedAt`
      )
      .run(config);
    this.audit("Pix configurado", undefined, `${config.mode} - ${config.keyType}`);
    return this.getPixConfig();
  }

  createChargeMock(amount: number, saleId?: string): PixCharge {
    const config = this.getPixConfig();
    const chargeId = uid("pix");
    const createdAt = now();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const charge: PixCharge = {
      id: chargeId,
      companyId: this.companyId,
      saleId,
      amount: roundMoney(amount),
      status: "waiting",
      qrCodePayload: this.generateDynamicQrCodeMock(amount, saleId, chargeId),
      provider: config.provider || "mock",
      createdAt,
      updatedAt: createdAt,
      expiresAt
    };
    this.db
      .prepare(
        `INSERT INTO pix_charges (id, company_id, sale_id, amount, status, qr_code_payload, provider, created_at, updated_at, expires_at)
        VALUES (@id, @companyId, @saleId, @amount, @status, @qrCodePayload, @provider, @createdAt, @updatedAt, @expiresAt)`
      )
      .run(charge);
    this.audit("cobranca Pix mock criada", undefined, `${charge.id}: ${charge.amount}`);
    return charge;
  }

  getChargeStatusMock(chargeId: string): PixChargeStatus {
    const row = this.db.prepare("SELECT status FROM pix_charges WHERE id = ?").get<{ status: PixChargeStatus }>(chargeId);
    return row?.status ?? "expired";
  }

  getChargeMock(chargeId: string): PixCharge | undefined {
    const row = this.db
      .prepare(
        `SELECT id, company_id as companyId, sale_id as saleId, amount, status, qr_code_payload as qrCodePayload,
          provider, created_at as createdAt, updated_at as updatedAt, expires_at as expiresAt
        FROM pix_charges WHERE id = ?`
      )
      .get<PixCharge>(chargeId);
    return row;
  }

  confirmChargeMock(chargeId: string): PixCharge {
    return this.updateChargeStatus(chargeId, "paid", "pagamento Pix confirmado manualmente");
  }

  cancelChargeMock(chargeId: string): PixCharge {
    return this.updateChargeStatus(chargeId, "cancelled", "cobranca Pix mock cancelada");
  }

  generateStaticQrCodePayload(config = this.getPixConfig()): string {
    return [
      "NEXPDV_PIX_STATIC_MOCK",
      `KEY=${config.key || "CHAVE_PIX_NAO_CONFIGURADA"}`,
      `TYPE=${config.keyType || "random"}`,
      `NAME=${config.receiverName || "NEXPDV"}`,
      `CITY=${config.city || "SAO PAULO"}`
    ].join("|");
  }

  generateDynamicQrCodeMock(amount: number, saleId?: string, chargeId = uid("pix")): string {
    const config = this.getPixConfig();
    return [
      "NEXPDV_PIX_DYNAMIC_MOCK",
      `ID=${chargeId}`,
      `SALE=${saleId || "SEM_VENDA"}`,
      `AMOUNT=${roundMoney(amount).toFixed(2)}`,
      `KEY=${config.key || "CHAVE_PIX_NAO_CONFIGURADA"}`,
      `NAME=${config.receiverName || "NEXPDV"}`
    ].join("|");
  }

  private updateChargeStatus(chargeId: string, status: PixChargeStatus, auditAction: string): PixCharge {
    const timestamp = now();
    this.db.prepare("UPDATE pix_charges SET status = @status, updated_at = @updatedAt WHERE id = @id").run({ id: chargeId, status, updatedAt: timestamp });
    const charge = this.getChargeMock(chargeId);
    if (!charge) throw new Error("Cobranca Pix nao encontrada.");
    this.audit(auditAction, undefined, `${charge.id}: ${charge.amount}`);
    return charge;
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
      provider: "",
      apiKey: "",
      webhookUrl: "",
      updatedAt: now()
    };
  }
}

const COMPANY_ID_SAFE = (companyId: string) => companyId;
