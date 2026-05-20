import { createHash } from "node:crypto";
import os from "node:os";
import { app } from "electron";
import type { LicenseActivationInput, LicensePlan, LicenseStatus, LicenseFeatures } from "@nexpdv/shared";
import { createOnlineLicenseActivation, type LocalLicenseRecord } from "./licenseService";

interface ActivationResponse {
  ok: boolean;
  company: {
    id: string;
    name: string;
    ownerEmail?: string;
  };
  license: {
    id: string;
    key: string;
    plan: LicensePlan;
    status: LicenseStatus;
    validUntil: string;
    demoMode?: boolean;
    features: LicenseFeatures;
    activatedAt?: string;
    lastValidatedAt?: string;
    validationMode?: "online";
  };
  device: {
    id: string;
    deviceId: string;
    status: string;
  };
}

const DEFAULT_DEV_CLOUD_API_URL = "http://localhost:3333";

const cloudBaseUrl = (): string | undefined => {
  const fallbackDevUrl = !app.isPackaged || process.env.NODE_ENV === "development" || process.env.VITE_DEV_SERVER_URL ? DEFAULT_DEV_CLOUD_API_URL : "";
  const value = (process.env.NEXPDV_CLOUD_API_URL || process.env.VITE_NEXPDV_CLOUD_API_URL || fallbackDevUrl).trim();
  return value ? value.replace(/\/$/, "") : undefined;
};

const deviceFingerprint = (): string =>
  createHash("sha256")
    .update([os.hostname(), os.platform(), os.arch(), os.userInfo().username].join("|"))
    .digest("hex");

export const getCloudDeviceInfo = () => {
  const fingerprint = deviceFingerprint();
  return {
    deviceId: `dev_${fingerprint.slice(0, 16)}`,
    name: os.hostname() || "NexPDV Desktop",
    hostName: os.hostname(),
    os: `${os.type()} ${os.release()}`,
    fingerprint,
    appVersion: app.getVersion(),
    platform: "desktop"
  };
};

export const activateLicenseOnline = async (input: LicenseActivationInput, companyId: string): Promise<LocalLicenseRecord | undefined> => {
  const baseUrl = cloudBaseUrl();
  if (!baseUrl) return undefined;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetch(`${baseUrl}/activation/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ownerEmail: input.ownerEmail,
        licenseKey: input.licenseKey,
        companyName: input.companyName,
        device: getCloudDeviceInfo()
      }),
      signal: controller.signal
    });
    const body = (await response.json().catch(() => ({}))) as Partial<ActivationResponse> & { code?: string; message?: string; details?: string };
    if (!response.ok || !body.license) {
      const details = body.details ? ` ${body.details}` : "";
      throw new Error(body.message ? `${body.message}${details}` : `Ativacao online falhou: HTTP ${response.status}`);
    }
    return createOnlineLicenseActivation(
      input,
      {
        ...body.license,
        ownerEmail: body.company?.ownerEmail || input.ownerEmail,
        establishmentName: body.company?.name || input.companyName
      },
      companyId
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("API Cloud indisponivel ou demorou para responder. Confira se o servidor SaaS local esta em http://localhost:3333.");
    }
    if (error instanceof TypeError) {
      throw new Error("API Cloud indisponivel. Confira se o servidor SaaS local esta rodando em http://localhost:3333.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};
