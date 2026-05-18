import { createHash } from "node:crypto";
import type { License, LicenseActivationInput, LicenseCheckResult, LicenseFeature, LicenseFeatures, LicensePlan, LicenseStatus } from "@nexpdv/shared";

const LOCAL_LICENSE_SECRET = "nexpdv-local-license-store-v1";
const LIFETIME_VALID_UNTIL = "2099-12-31T23:59:59.000Z";

export type LicensedModule = LicenseFeature;

export interface LicenseRepository {
  getLicense(): (License & { featuresJson?: string }) | undefined;
}

export interface LocalLicenseRecord extends License {
  plan: LicensePlan;
  status: LicenseStatus;
  features: LicenseFeatures;
  establishmentName: string;
  issuedAt: string;
  activatedAt: string;
  lastValidatedAt: string;
  validationMode: "local" | "online_pending" | "online";
  signature: string;
}

export interface OnlineLicenseActivation {
  id?: string;
  key: string;
  plan: LicensePlan;
  status: LicenseStatus;
  validUntil: string;
  demoMode?: boolean;
  features: LicenseFeatures;
  ownerEmail?: string;
  establishmentName?: string;
  activatedAt?: string;
  lastValidatedAt?: string;
}

export const disabledFeatures = (): LicenseFeatures => ({
  pix: false,
  fiscal: false,
  cloud: false,
  mobile: false,
  intelligence: false
});

export const licensePlans: Record<LicensePlan, { label: string; features: LicenseFeatures }> = {
  OFFLINE: {
    label: "Offline",
    features: disabledFeatures()
  },
  CLOUD: {
    label: "Cloud",
    features: {
      ...disabledFeatures(),
      cloud: true,
      mobile: true
    }
  },
  PRO: {
    label: "Pro",
    features: {
      pix: true,
      fiscal: true,
      cloud: true,
      mobile: true,
      intelligence: true
    }
  }
};

const activationKeys: Record<string, { plan: LicensePlan; demoMode: boolean; validUntil: string }> = {
  "NEXPDV-2026": { plan: "OFFLINE", demoMode: false, validUntil: LIFETIME_VALID_UNTIL },
  "NEXPDV-OFFLINE-2026": { plan: "OFFLINE", demoMode: false, validUntil: LIFETIME_VALID_UNTIL },
  "NEXPDV-CLOUD-2026": { plan: "CLOUD", demoMode: false, validUntil: LIFETIME_VALID_UNTIL },
  "NEXPDV-PRO-2026": { plan: "PRO", demoMode: false, validUntil: LIFETIME_VALID_UNTIL }
};

const normalizeKey = (key: string): string => key.trim().toUpperCase();

const validEmail = (email: string): boolean => /^\S+@\S+\.\S+$/.test(email.trim());

export const planForKey = (key: string): LicensePlan | undefined => activationKeys[normalizeKey(key)]?.plan;

export const getPlanFeatures = (plan: LicensePlan): LicenseFeatures => ({ ...licensePlans[plan].features });

export const getPlanLabel = (plan: LicensePlan | "NONE"): string => (plan === "NONE" ? "Nao ativado" : licensePlans[plan].label);

export const serializeFeatures = (features: LicenseFeatures): string => JSON.stringify(features);

const parseFeatures = (value: unknown): LicenseFeatures | undefined => {
  if (!value || typeof value !== "string") return undefined;
  try {
    const parsed = JSON.parse(value) as Partial<Record<LicenseFeature, unknown>>;
    return {
      pix: Boolean(parsed.pix),
      fiscal: Boolean(parsed.fiscal),
      cloud: Boolean(parsed.cloud),
      mobile: Boolean(parsed.mobile),
      intelligence: Boolean(parsed.intelligence)
    };
  } catch {
    return undefined;
  }
};

const deriveLegacyPlan = (license: Partial<License>): LicensePlan => {
  const keyPlan = license.key ? planForKey(license.key) : undefined;
  if (keyPlan) return keyPlan;
  if (license.pixEnabled || license.fiscalEnabled || license.intelligenceEnabled) return "PRO";
  if (license.cloudEnabled || license.mobileEnabled) return "CLOUD";
  return "OFFLINE";
};

const signaturePayload = (license: Omit<LocalLicenseRecord, "signature">): string =>
  [
    "v1",
    license.companyId,
    normalizeKey(license.key),
    license.plan,
    license.status,
    license.validUntil,
    license.ownerEmail?.trim().toLowerCase() ?? "",
    license.establishmentName.trim().toLowerCase(),
    serializeFeatures(license.features)
  ].join("|");

export const signLicense = (license: Omit<LocalLicenseRecord, "signature">): string =>
  createHash("sha256").update(`${LOCAL_LICENSE_SECRET}:${signaturePayload(license)}`).digest("hex");

export const verifyLicenseSeal = (license: LocalLicenseRecord): boolean => {
  const { signature, ...unsigned } = license;
  return signature === signLicense(unsigned);
};

export const normalizeStoredLicense = (license: (License & { featuresJson?: string }) | undefined): LocalLicenseRecord | undefined => {
  if (!license) return undefined;
  const plan = (license.plan as LicensePlan | undefined) ?? deriveLegacyPlan(license);
  const features = parseFeatures(license.featuresJson) ?? license.features ?? getPlanFeatures(plan);
  const activatedAt = license.activatedAt || new Date().toISOString();
  const issuedAt = license.issuedAt || activatedAt;
  const lastValidatedAt = license.lastValidatedAt || activatedAt;
  const unsigned: Omit<LocalLicenseRecord, "signature"> = {
    ...license,
    id: license.id,
    companyId: license.companyId,
    key: normalizeKey(license.key),
    plan,
    status: license.status || "active",
    validUntil: license.validUntil || LIFETIME_VALID_UNTIL,
    demoMode: Boolean(license.demoMode),
    features,
    cloudEnabled: features.cloud,
    fiscalEnabled: features.fiscal,
    pixEnabled: features.pix,
    mobileEnabled: features.mobile,
    intelligenceEnabled: features.intelligence,
    ownerEmail: license.ownerEmail,
    establishmentName: license.establishmentName || "NexPDV Store",
    issuedAt,
    activatedAt,
    lastValidatedAt,
    validationMode: license.validationMode || "local"
  };
  return {
    ...unsigned,
    signature: license.signature || signLicense(unsigned)
  };
};

export const createLocalLicenseActivation = (input: LicenseActivationInput, companyId: string, timestamp = new Date().toISOString()): LocalLicenseRecord => {
  const key = normalizeKey(input.licenseKey);
  const activation = activationKeys[key];
  if (!activation) {
    throw new Error("Chave de ativacao invalida.");
  }
  if (!validEmail(input.ownerEmail)) {
    throw new Error("Informe um email de dono valido.");
  }
  if (!input.companyName.trim()) {
    throw new Error("Informe o nome do estabelecimento.");
  }

  const features = getPlanFeatures(activation.plan);
  const unsigned: Omit<LocalLicenseRecord, "signature"> = {
    id: "lic_local",
    companyId,
    key,
    plan: activation.plan,
    status: "active",
    validUntil: activation.validUntil,
    demoMode: activation.demoMode,
    features,
    cloudEnabled: features.cloud,
    fiscalEnabled: features.fiscal,
    pixEnabled: features.pix,
    mobileEnabled: features.mobile,
    intelligenceEnabled: features.intelligence,
    ownerEmail: input.ownerEmail.trim().toLowerCase(),
    establishmentName: input.companyName.trim(),
    issuedAt: timestamp,
    activatedAt: timestamp,
    lastValidatedAt: timestamp,
    validationMode: "local"
  };

  return {
    ...unsigned,
    signature: signLicense(unsigned)
  };
};

export const createOnlineLicenseActivation = (
  input: LicenseActivationInput,
  online: OnlineLicenseActivation,
  companyId: string,
  timestamp = new Date().toISOString()
): LocalLicenseRecord => {
  if (!validEmail(input.ownerEmail)) throw new Error("Informe um email de dono valido.");
  const features = {
    ...disabledFeatures(),
    ...online.features
  };
  const unsigned: Omit<LocalLicenseRecord, "signature"> = {
    id: online.id || "lic_online",
    companyId,
    key: normalizeKey(online.key),
    plan: online.plan,
    status: online.status,
    validUntil: online.validUntil,
    demoMode: Boolean(online.demoMode),
    features,
    cloudEnabled: features.cloud,
    fiscalEnabled: features.fiscal,
    pixEnabled: features.pix,
    mobileEnabled: features.mobile,
    intelligenceEnabled: features.intelligence,
    ownerEmail: online.ownerEmail || input.ownerEmail.trim().toLowerCase(),
    establishmentName: online.establishmentName || input.companyName.trim(),
    issuedAt: timestamp,
    activatedAt: online.activatedAt || timestamp,
    lastValidatedAt: online.lastValidatedAt || timestamp,
    validationMode: "online"
  };
  return {
    ...unsigned,
    signature: signLicense(unsigned)
  };
};

export const checkStoredLicense = (license: (License & { featuresJson?: string }) | undefined): LicenseCheckResult => {
  const normalized = normalizeStoredLicense(license);
  if (!normalized) {
    return {
      valid: false,
      key: "",
      plan: "NONE",
      planLabel: getPlanLabel("NONE"),
      status: "missing",
      demoMode: true,
      validUntil: "",
      features: disabledFeatures(),
      cloudEnabled: false,
      fiscalEnabled: false,
      pixEnabled: false,
      mobileEnabled: false,
      intelligenceEnabled: false,
      validationMode: "local",
      message: "Licenca nao ativada."
    };
  }

  const knownKey = Boolean(activationKeys[normalizeKey(normalized.key)]);
  const notExpired = new Date(normalized.validUntil).getTime() > Date.now();
  const sealValid = verifyLicenseSeal(normalized);
  const valid = knownKey && normalized.status === "active" && notExpired && sealValid;
  const enabledFeatures = valid ? normalized.features : disabledFeatures();

  return {
    valid,
    key: normalized.key,
    plan: normalized.plan,
    planLabel: getPlanLabel(normalized.plan),
    status: valid ? normalized.status : notExpired ? "invalid" : "expired",
    demoMode: normalized.demoMode,
    validUntil: normalized.validUntil,
    expiresAt: normalized.validUntil,
    features: enabledFeatures,
    cloudEnabled: enabledFeatures.cloud,
    fiscalEnabled: enabledFeatures.fiscal,
    pixEnabled: enabledFeatures.pix,
    mobileEnabled: enabledFeatures.mobile,
    intelligenceEnabled: enabledFeatures.intelligence,
    ownerEmail: normalized.ownerEmail,
    establishmentName: normalized.establishmentName,
    lastValidatedAt: normalized.lastValidatedAt,
    validationMode: normalized.validationMode,
    message: valid ? `Licenca ${getPlanLabel(normalized.plan)} ativa.` : "Licenca expirada, adulterada ou invalida."
  };
};

export const checkLocalLicense = (repository: LicenseRepository): LicenseCheckResult => checkStoredLicense(repository.getLicense());

export const assertLicensedModule = (repository: LicenseRepository, module: LicensedModule): LicenseCheckResult => {
  const check = checkLocalLicense(repository);
  if (!check.valid) {
    throw new Error(check.message);
  }
  if (!check.features[module]) {
    throw new Error(`Recurso ${module} nao esta disponivel no plano ${check.planLabel}.`);
  }
  return check;
};
