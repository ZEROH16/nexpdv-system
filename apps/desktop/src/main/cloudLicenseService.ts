import { createHash } from "node:crypto";
import os from "node:os";
import { app } from "electron";
import type { LicenseActivationInput, LicensePlan, LicenseStatus, LicenseFeatures } from "@nexpdv/shared";
import { createOnlineLicenseActivation, type LocalLicenseRecord } from "./licenseService";
import { getCloudApiBaseUrl } from "./cloudApiConfig";

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
    plan?: LicensePlan;
    planLabel?: string;
    status?: LicenseStatus;
    validUntil?: string;
    demoMode?: boolean;
    features?: Partial<LicenseFeatures>;
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
  const baseUrl = getCloudApiBaseUrl();
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
      throw new Error("API Cloud indisponivel ou demorou para responder. Confira sua internet ou a URL configurada da API.");
    }
    if (error instanceof TypeError) {
      throw new Error("Sem internet ou API Cloud indisponivel. O PDV continua offline apos ativado.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};
