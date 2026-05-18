import type { PixCharge, PixConfig } from "@nexpdv/shared";
import { renderQrSvgDataUrl } from "../qrCodeRenderer";
import type { PixProviderClient, PixProviderContext, PixCreateChargeInput, PixProviderResult, PixProviderStatusResult } from "./types";

interface PagBankOrderResponse {
  id?: string;
  reference_id?: string;
  qr_codes?: Array<{
    id?: string;
    text?: string;
    expiration_date?: string;
    links?: Array<{ rel?: string; href?: string; media?: string; type?: string }>;
  }>;
  charges?: Array<{ id?: string; status?: string; paid_at?: string; payment_response?: { reference?: string; code?: string } }>;
}

const amountToCents = (amount: number): number => Math.round(Number(amount || 0) * 100);

const baseUrlFor = (config: PixConfig): string =>
  config.environment === "production" ? "https://api.pagseguro.com" : "https://sandbox.api.pagseguro.com";

const getToken = (config: PixConfig): string =>
  (config.apiKey || process.env.PAGBANK_SANDBOX_TOKEN || process.env.PAGSEGURO_SANDBOX_TOKEN || process.env.PAGBANK_TOKEN || process.env.PAGSEGURO_TOKEN || "").trim();

const logDev = (message: string, details?: unknown): void => {
  if (!process.env.VITE_DEV_SERVER_URL) return;
  console.log(`[pix:pagbank] ${message}`, details ?? "");
};

const mapPagBankStatus = (order: PagBankOrderResponse, fallbackExpiresAt?: string): PixProviderStatusResult => {
  const paidCharge = order.charges?.find((charge) => charge.status === "PAID");
  if (paidCharge) {
    return {
      status: "paid",
      providerStatus: paidCharge.status,
      transactionId: paidCharge.payment_response?.reference || paidCharge.id,
      paidAt: paidCharge.paid_at || new Date().toISOString()
    };
  }

  const declined = order.charges?.find((charge) => ["DECLINED", "CANCELED", "CANCELLED"].includes(charge.status ?? ""));
  if (declined) {
    return { status: declined.status === "DECLINED" ? "error" : "cancelled", providerStatus: declined.status, errorMessage: declined.status };
  }

  if (fallbackExpiresAt && new Date(fallbackExpiresAt).getTime() <= Date.now()) {
    return { status: "expired", providerStatus: "EXPIRED" };
  }

  return { status: "waiting", providerStatus: order.charges?.[0]?.status || "WAITING" };
};

export class PagBankPixProvider implements PixProviderClient {
  readonly code = "pagbank";

  constructor(private readonly context: PixProviderContext) {}

  async createCharge(input: PixCreateChargeInput): Promise<PixProviderResult> {
    const token = getToken(this.context.config);
    if (!token) throw new Error("Token PagBank nao configurado. Informe o token em Configuracoes > Pix ou via variavel PAGBANK_SANDBOX_TOKEN.");

    const payload = {
      reference_id: input.referenceId,
      customer: {
        name: "Cliente NexPDV",
        email: "cliente@nexpdv.local",
        tax_id: "12345678909"
      },
      items: [
        {
          reference_id: input.referenceId,
          name: input.description.slice(0, 64),
          quantity: 1,
          unit_amount: amountToCents(input.amount)
        }
      ],
      qr_codes: [
        {
          amount: {
            value: amountToCents(input.amount)
          },
          expiration_date: input.expiresAt
        }
      ],
      notification_urls: this.context.config.webhookUrl ? [this.context.config.webhookUrl] : undefined
    };

    const response = await fetch(`${baseUrlFor(this.context.config)}/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-idempotency-key": input.referenceId
      },
      body: JSON.stringify(payload)
    });

    const body = (await response.json().catch(() => ({}))) as PagBankOrderResponse & { error_messages?: Array<{ description?: string }>; message?: string };
    if (!response.ok) {
      const message = body.error_messages?.map((item) => item.description).filter(Boolean).join(" ") || body.message || `PagBank HTTP ${response.status}`;
      throw new Error(`PagBank: ${message}`);
    }

    const qrCode = body.qr_codes?.[0];
    const qrCodePayload = qrCode?.text ?? "";
    if (!body.id || !qrCodePayload) throw new Error("PagBank nao retornou QR Code Pix valido.");

    const qrCodeImage = (await this.fetchQrCodeImage(qrCode?.links ?? [], token)) ?? this.renderPayloadFallback(qrCodePayload);

    return {
      provider: this.code,
      status: "waiting",
      qrCodePayload,
      payloadPix: qrCodePayload,
      qrCode: qrCodeImage,
      providerPaymentId: body.id,
      providerStatus: "WAITING",
      transactionId: qrCode?.id,
      expiresAt: qrCode?.expiration_date || input.expiresAt
    };
  }

  async getChargeStatus(charge: PixCharge): Promise<PixProviderStatusResult> {
    const token = getToken(this.context.config);
    if (!token) throw new Error("Token PagBank nao configurado.");
    if (!charge.providerPaymentId) return { status: charge.status, providerStatus: charge.providerStatus };

    const response = await fetch(`${baseUrlFor(this.context.config)}/orders/${encodeURIComponent(charge.providerPaymentId)}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      }
    });
    const body = (await response.json().catch(() => ({}))) as PagBankOrderResponse;
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "Token PagBank invalido." : `Falha ao consultar PagBank: HTTP ${response.status}`);
    return mapPagBankStatus(body, charge.expiresAt);
  }

  async cancelCharge(charge: PixCharge): Promise<PixProviderStatusResult> {
    return { status: "cancelled", providerStatus: charge.providerPaymentId ? "LOCAL_CANCELLED" : "CANCELLED" };
  }

  async testConnection(): Promise<{ status: "connected" | "invalid" | "offline" | "sandbox"; message: string }> {
    const token = getToken(this.context.config);
    if (!token) return { status: "invalid", message: "Token PagBank nao configurado." };

    try {
      const response = await fetch(`${baseUrlFor(this.context.config)}/orders/ORDE_NEXPDV_HEALTHCHECK`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json"
        }
      });
      if (response.status === 401 || response.status === 403) return { status: "invalid", message: "Token PagBank recusado." };
      if (response.status >= 500) return { status: "offline", message: `PagBank indisponivel no momento: HTTP ${response.status}.` };
      return {
        status: this.context.config.environment === "sandbox" ? "sandbox" : "connected",
        message: this.context.config.environment === "sandbox" ? "Conexao sandbox PagBank validada." : "Conexao PagBank validada."
      };
    } catch {
      return { status: "offline", message: "Nao foi possivel conectar ao PagBank." };
    }
  }

  private async fetchQrCodeImage(links: Array<{ rel?: string; href?: string; media?: string }>, token: string): Promise<string | undefined> {
    logDev("links QR recebidos", links.map((link) => ({ rel: link.rel, media: link.media, hasHref: Boolean(link.href) })));
    const normalizes = (value?: string) => (value ?? "").toLowerCase();
    const base64Link = links.find((link) => normalizes(link.rel).includes("base64") || normalizes(link.media).includes("text/plain"));
    const pngLink = links.find((link) => normalizes(link.rel).includes("png") || normalizes(link.media).includes("image/png"));
    const link = base64Link || pngLink;
    if (!link?.href) {
      logDev("API nao retornou href de QR. Usando fallback local.");
      return undefined;
    }

    try {
      const response = await fetch(link.href, { headers: { Authorization: `Bearer ${token}`, Accept: link.media || "*/*" } });
      if (!response.ok) {
        logDev("Falha ao baixar QR do PagBank", { status: response.status, media: link.media, rel: link.rel });
        return undefined;
      }
      if (base64Link) {
        const text = (await response.text()).trim();
        logDev("QR base64 carregado pelo link PagBank.");
        return text.startsWith("data:") ? text : `data:image/png;base64,${text}`;
      }
      const arrayBuffer = await response.arrayBuffer();
      logDev("QR PNG carregado pelo link PagBank.");
      return `data:image/png;base64,${Buffer.from(arrayBuffer).toString("base64")}`;
    } catch {
      logDev("Erro ao carregar link do QR PagBank. Usando fallback local.");
      return undefined;
    }
  }

  private renderPayloadFallback(payload: string): string | undefined {
    try {
      logDev("Gerando QR local a partir do payload Pix.");
      return renderQrSvgDataUrl(payload);
    } catch (error) {
      logDev("Falha ao gerar QR local.", error instanceof Error ? error.message : String(error));
      return undefined;
    }
  }
}
