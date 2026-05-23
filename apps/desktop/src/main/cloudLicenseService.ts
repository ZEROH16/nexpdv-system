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

export interface RemoteLicenseValidation {
  valid: boolean;
  code?: string;
  status: string;
  message: string;
  serverTime: string;
  license?: ActivationResponse["license"];
  company?: ActivationResponse["company"];
  device?: ActivationResponse["device"];
}

export class CloudLicenseUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudLicenseUnavailableError";
  }
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

const readJson = async (response: Response) =>
  (await response.json().catch(() => ({}))) as Partial<RemoteLicenseValidation> & Partial<ActivationResponse> & { details?: string };

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
    const body = await readJson(response);
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

export const validateLicenseOnline = async (license: LocalLicenseRecord): Promise<RemoteLicenseValidation> => {
  const baseUrl = getCloudApiBaseUrl();
  if (!baseUrl) throw new CloudLicenseUnavailableError("API Cloud indisponivel para validar a licenca.");

  const device = getCloudDeviceInfo();
  const query = new URLSearchParams({
    licenseKey: license.key,
    deviceId: device.deviceId,
    companyId: license.companyId
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetch(`${baseUrl}/activation/status?${query.toString()}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
    const body = await readJson(response);
    const status = String(body.license?.status ?? body.status ?? (body.valid ? "active" : "invalid"));
    return {
      valid: Boolean(body.valid && response.ok),
      code: body.code,
      status,
      message: body.message ?? (response.ok ? "Licenca validada." : "Licenca invalida."),
      serverTime: body.serverTime ?? new Date().toISOString(),
      license: body.license,
      company: body.company,
      device: body.device
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new CloudLicenseUnavailableError("API Cloud indisponivel ou demorou para responder.");
    }
    if (error instanceof TypeError) {
      throw new CloudLicenseUnavailableError("Sem internet ou API Cloud indisponivel.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};
