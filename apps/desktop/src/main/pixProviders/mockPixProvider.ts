import { roundMoney } from "@nexpdv/shared";
import type { PixProviderClient, PixProviderContext, PixCreateChargeInput, PixProviderResult, PixProviderStatusResult } from "./types";

export class MockPixProvider implements PixProviderClient {
  readonly code = "mock";

  constructor(private readonly context: PixProviderContext) {}

  async createCharge(input: PixCreateChargeInput): Promise<PixProviderResult> {
    const payload = [
      "NEXPDV_PIX_DYNAMIC_MOCK",
      `ID=${input.id}`,
      `SALE=${input.saleId || "SEM_VENDA"}`,
      `AMOUNT=${roundMoney(input.amount).toFixed(2)}`,
      `KEY=${this.context.config.key || "CHAVE_PIX_NAO_CONFIGURADA"}`,
      `NAME=${this.context.config.receiverName || "NEXPDV"}`
    ].join("|");

    return {
      provider: this.code,
      status: "waiting",
      qrCodePayload: payload,
      payloadPix: payload,
      providerPaymentId: input.id,
      providerStatus: "MOCK_WAITING",
      expiresAt: input.expiresAt
    };
  }

  async getChargeStatus(charge: { status: PixProviderStatusResult["status"] }): Promise<PixProviderStatusResult> {
    return { status: charge.status, providerStatus: `MOCK_${charge.status.toUpperCase()}` };
  }

  async cancelCharge(): Promise<PixProviderStatusResult> {
    return { status: "cancelled", providerStatus: "MOCK_CANCELLED" };
  }

  async testConnection(): Promise<{ status: "connected"; message: string }> {
    return { status: "connected", message: "Provider mock pronto para uso offline." };
  }
}

