import type { PixCharge, PixConnectionStatus, PixConfig, PixConfigMode, PixProviderCode } from "@nexpdv/shared";

export interface PixProviderContext {
  config: PixConfig;
  companyId: string;
  audit: (action: string, actor?: string, details?: string) => void;
}

export interface PixCreateChargeInput {
  id: string;
  amount: number;
  saleId?: string;
  referenceId: string;
  description: string;
  expiresAt: string;
  mode: PixConfigMode;
}

export interface PixProviderResult {
  provider: PixProviderCode | string;
  status: PixCharge["status"];
  qrCodePayload: string;
  payloadPix?: string;
  qrCode?: string;
  providerPaymentId?: string;
  providerStatus?: string;
  transactionId?: string;
  expiresAt?: string;
  paidAt?: string;
  errorMessage?: string;
}

export interface PixProviderStatusResult {
  status: PixCharge["status"];
  providerStatus?: string;
  transactionId?: string;
  paidAt?: string;
  errorMessage?: string;
}

export interface PixProviderClient {
  code: PixProviderCode | string;
  createCharge(input: PixCreateChargeInput): Promise<PixProviderResult>;
  getChargeStatus(charge: PixCharge): Promise<PixProviderStatusResult>;
  cancelCharge(charge: PixCharge): Promise<PixProviderStatusResult>;
  testConnection(): Promise<{ status: PixConnectionStatus; message: string }>;
}

