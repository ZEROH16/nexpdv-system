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

const cloudBaseUrl = (): string | undefined => {
  const value = (process.env.NEXPDV_CLOUD_API_URL || process.env.VITE_NEXPDV_CLOUD_API_URL || "").trim();
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
    const body = (await response.json().catch(() => ({}))) as Partial<ActivationResponse> & { message?: string };
    if (!response.ok || !body.license) {
      throw new Error(body.message || `Ativacao online falhou: HTTP ${response.status}`);
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
  } finally {
    clearTimeout(timeout);
  }
};

