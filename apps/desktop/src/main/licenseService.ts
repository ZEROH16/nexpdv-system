import type { LocalDatabase } from "./localDatabase";

export interface LicenseCheck {
  valid: boolean;
  key: string;
  status: string;
  demoMode: boolean;
  validUntil: string;
  cloudEnabled: boolean;
  fiscalEnabled: boolean;
  pixEnabled: boolean;
  mobileEnabled: boolean;
  intelligenceEnabled: boolean;
  ownerEmail?: string;
  message: string;
}

export const checkLocalLicense = (db: LocalDatabase): LicenseCheck => {
  const license = db.getLicense() as {
    key: string;
    status: string;
    validUntil: string;
    demoMode: boolean;
    cloudEnabled?: boolean;
    fiscalEnabled?: boolean;
    pixEnabled?: boolean;
    mobileEnabled?: boolean;
    intelligenceEnabled?: boolean;
    ownerEmail?: string;
  } | undefined;
  if (!license) {
    return {
      valid: false,
      key: "",
      status: "missing",
      demoMode: true,
      validUntil: "",
      cloudEnabled: false,
      fiscalEnabled: false,
      pixEnabled: false,
      mobileEnabled: false,
      intelligenceEnabled: false,
      message: "Licenca nao ativada."
    };
  }
  const validKeys = ["NEXPDV-2026", "NEXPDV-OFFLINE-2026", "NEXPDV-CLOUD-2026"];
  const valid = validKeys.includes(license.key) && license.status === "active" && new Date(license.validUntil).getTime() > Date.now();
  return {
    valid,
    key: license.key,
    status: license.status,
    demoMode: license.demoMode,
    validUntil: license.validUntil,
    cloudEnabled: Boolean(license.cloudEnabled),
    fiscalEnabled: Boolean(license.fiscalEnabled),
    pixEnabled: Boolean(license.pixEnabled),
    mobileEnabled: Boolean(license.mobileEnabled),
    intelligenceEnabled: Boolean(license.intelligenceEnabled),
    ownerEmail: license.ownerEmail,
    message: valid ? "Licenca ativa." : "Licenca expirada ou invalida."
  };
};
