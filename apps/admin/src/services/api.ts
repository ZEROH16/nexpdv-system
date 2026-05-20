const API_URL = import.meta.env.VITE_CLOUD_API_URL ?? "http://localhost:3333";

export interface Session {
  token: string;
  refreshToken?: string;
  requiresTwoFactorSetup?: boolean;
  user: {
    id: string;
    tenantId?: string;
    name: string;
    email: string;
    role: string;
    platformRole?: string;
    companyId: string;
    companyName: string;
    twoFactorEnabled?: boolean;
    firstAccessRequired?: boolean;
  };
}

export interface FirstAccessRequired {
  firstAccessRequired: true;
  email: string;
  name: string;
  message: string;
}

export interface FirstAccessSetup {
  firstAccessSessionToken: string;
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
}

export type LoginResult = Session | FirstAccessRequired;

const request = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
  const token = localStorage.getItem("nexpdv_admin_token");
  const headers: Record<string, string> = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> | undefined)
  };
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const typed = new Error(error.message ?? "Falha na requisicao.") as Error & { status?: number; payload?: unknown };
    typed.status = response.status;
    typed.payload = error;
    throw typed;
  }
  return response.json() as Promise<T>;
};

const persistSession = (session: Session) => {
  localStorage.setItem("nexpdv_admin_token", session.token);
  if (session.refreshToken) localStorage.setItem("nexpdv_admin_refresh", session.refreshToken);
  localStorage.setItem("nexpdv_admin_user", JSON.stringify(session.user));
};

const clearSession = () => {
  localStorage.removeItem("nexpdv_admin_token");
  localStorage.removeItem("nexpdv_admin_refresh");
  localStorage.removeItem("nexpdv_admin_user");
};

const isSession = (result: LoginResult): result is Session => "token" in result;

export const api = {
  login: async (email: string, password: string, twoFactorCode?: string, recoveryCode?: string) => {
    const result = await request<LoginResult>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, twoFactorCode, recoveryCode })
    });
    if (isSession(result)) persistSession(result);
    else clearSession();
    return result;
  },
  restore: () => {
    const token = localStorage.getItem("nexpdv_admin_token");
    const user = localStorage.getItem("nexpdv_admin_user");
    return token && user ? ({ token, user: JSON.parse(user) } as Session) : undefined;
  },
  me: () => request<Session["user"]>("/auth/me"),
  refresh: async () => {
    const refreshToken = localStorage.getItem("nexpdv_admin_refresh");
    if (!refreshToken) throw new Error("Sessao expirada.");
    const session = await request<Session>("/auth/refresh", { method: "POST", body: JSON.stringify({ refreshToken }) });
    persistSession(session);
    return session;
  },
  logout: async () => {
    await request("/auth/logout", { method: "POST" }).catch(() => undefined);
    clearSession();
  },
  firstAccessStart: (input: { email: string; password: string; initialToken: string }) =>
    request<FirstAccessSetup>("/auth/first-access/start", { method: "POST", body: JSON.stringify(input) }),
  firstAccessComplete: async (input: { firstAccessSessionToken: string; newPassword: string; twoFactorCode: string }) => {
    const session = await request<Session & { recoveryCodes: string[] }>("/auth/first-access/complete", { method: "POST", body: JSON.stringify(input) });
    persistSession(session);
    return session;
  },
  setup2fa: () => request<{ secret: string; otpauthUrl: string; qrCodeDataUrl: string }>("/auth/2fa/setup", { method: "POST", body: JSON.stringify({}) }),
  enable2fa: (code: string) => request<{ recoveryCodes: string[] }>("/auth/2fa/enable", { method: "POST", body: JSON.stringify({ code }) }),
  disable2fa: () => request<{ ok: boolean }>("/auth/2fa/disable", { method: "POST", body: JSON.stringify({}) }),
  dashboard: () => request<any>("/admin/dashboard"),
  companies: () => request<any[]>("/admin/companies"),
  createCompany: (input: any) => request<any>("/companies", { method: "POST", body: JSON.stringify(input) }),
  updateCompany: (id: string, input: any) => request<any>(`/companies/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  companyDetails: (id: string) => request<any>(`/companies/${id}`),
  setCompanyStatus: (id: string, status: string) => request<any>(`/companies/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  deleteCompany: (id: string, options?: { force?: boolean; confirmation?: string }) => request<any>(`/companies/${id}`, { method: "DELETE", body: JSON.stringify(options ?? {}) }),
  users: () => request<any[]>("/admin/users"),
  createUser: (input: any) => request<any>("/admin/users", { method: "POST", body: JSON.stringify(input) }),
  updateUser: (id: string, input: any) => request<any>(`/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  updateUserPermissions: (id: string, permissions: Record<string, boolean>) => request<any>(`/admin/users/${id}/permissions`, { method: "PATCH", body: JSON.stringify({ permissions }) }),
  resetUserPassword: (id: string, password: string) => request<any>(`/admin/users/${id}/reset-password`, { method: "POST", body: JSON.stringify({ password }) }),
  disableUser2fa: (id: string) => request<any>(`/admin/users/${id}/disable-2fa`, { method: "POST" }),
  deleteUser: (id: string) => request<any>(`/admin/users/${id}`, { method: "DELETE", body: JSON.stringify({}) }),
  plans: () => request<any[]>("/admin/plans"),
  savePlan: (input: any) => request<any>("/plans", { method: "POST", body: JSON.stringify(input) }),
  updatePlan: (id: string, input: any) => request<any>(`/plans/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  duplicatePlan: (id: string) => request<any>(`/plans/${id}/duplicate`, { method: "POST" }),
  setPlanStatus: (id: string, active: boolean) => request<any>(`/plans/${id}/status`, { method: "PATCH", body: JSON.stringify({ active }) }),
  deletePlan: (id: string) => request<any>(`/plans/${id}`, { method: "DELETE", body: JSON.stringify({}) }),
  subscriptions: () => request<any[]>("/admin/subscriptions"),
  licenses: () => request<any[]>("/admin/licenses"),
  generateLicense: (input: any) => request<any>("/licenses/generate", { method: "POST", body: JSON.stringify(input) }),
  updateLicense: (id: string, input: any) => request<any>(`/licenses/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  setLicenseStatus: (id: string, status: string, reason?: string) => request<any>(`/licenses/${id}/status`, { method: "PATCH", body: JSON.stringify({ status, reason }) }),
  blockLicense: (id: string, reason?: string) => request<any>(`/licenses/${id}/block`, { method: "POST", body: JSON.stringify({ reason }) }),
  unblockLicense: (id: string) => request<any>(`/licenses/${id}/unblock`, { method: "POST" }),
  cancelLicense: (id: string) => request<any>(`/licenses/${id}/cancel`, { method: "POST" }),
  renewLicense: (id: string, validUntil: string) => request<any>(`/licenses/${id}/renew`, { method: "POST", body: JSON.stringify({ validUntil }) }),
  changeLicensePlan: (id: string, planCode: string) => request<any>(`/licenses/${id}/plan`, { method: "POST", body: JSON.stringify({ planCode }) }),
  saveLicenseModules: (id: string, features: any) => request<any>(`/licenses/${id}/modules`, { method: "POST", body: JSON.stringify({ features }) }),
  resetActivation: (id: string) => request<any>(`/licenses/${id}/reset-activation`, { method: "POST", body: JSON.stringify({}) }),
  deleteLicense: (id: string, options?: { force?: boolean; confirmation?: string }) => request<any>(`/licenses/${id}`, { method: "DELETE", body: JSON.stringify(options ?? {}) }),
  devices: () => request<any[]>("/admin/devices"),
  updateDevice: (id: string, input: any) => request<any>(`/devices/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  deactivateDevice: (id: string) => request<any>(`/devices/${id}/deactivate`, { method: "POST", body: JSON.stringify({}) }),
  blockDevice: (id: string) => request<any>(`/devices/${id}/block`, { method: "POST", body: JSON.stringify({}) }),
  setDeviceStatus: (id: string, status: string) => request<any>(`/devices/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  deleteDevice: (id: string) => request<any>(`/devices/${id}`, { method: "DELETE" }),
  syncJobs: () => request<any[]>("/admin/sync-jobs"),
  cloudHealth: () => request<any>("/cloud/health"),
  cloudBackups: () => request<any[]>("/cloud/backups"),
  markCloudCompanyNotified: (id: string) => request<any>(`/cloud/company/${id}/notified`, { method: "PATCH", body: JSON.stringify({}) }),
  audit: () => request<any[]>("/admin/audit"),
  logs: () => request<any[]>("/admin/logs")
};
