const API_URL = import.meta.env.VITE_CLOUD_API_URL ?? "http://localhost:3333";

export interface Session {
  token: string;
  refreshToken?: string;
  user: {
    id: string;
    tenantId?: string;
    name: string;
    email: string;
    role: string;
    platformRole?: string;
    companyId: string;
    companyName: string;
  };
}

const request = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
  const token = localStorage.getItem("nexpdv_admin_token");
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message ?? "Falha na requisicao.");
  }
  return response.json() as Promise<T>;
};

export const api = {
  login: async (email: string, password: string) => {
    const session = await request<Session>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    localStorage.setItem("nexpdv_admin_token", session.token);
    if (session.refreshToken) localStorage.setItem("nexpdv_admin_refresh", session.refreshToken);
    localStorage.setItem("nexpdv_admin_user", JSON.stringify(session.user));
    return session;
  },
  restore: () => {
    const token = localStorage.getItem("nexpdv_admin_token");
    const user = localStorage.getItem("nexpdv_admin_user");
    return token && user ? ({ token, user: JSON.parse(user) } as Session) : undefined;
  },
  logout: () => {
    localStorage.removeItem("nexpdv_admin_token");
    localStorage.removeItem("nexpdv_admin_refresh");
    localStorage.removeItem("nexpdv_admin_user");
  },
  dashboard: () => request<any>("/admin/dashboard"),
  companies: () => request<any[]>("/admin/companies"),
  createCompany: (input: any) => request<any>("/companies", { method: "POST", body: JSON.stringify(input) }),
  users: () => request<any[]>("/admin/users"),
  plans: () => request<any[]>("/admin/plans"),
  savePlan: (input: any) => request<any>("/plans", { method: "POST", body: JSON.stringify(input) }),
  subscriptions: () => request<any[]>("/admin/subscriptions"),
  licenses: () => request<any[]>("/admin/licenses"),
  generateLicense: (input: any) => request<any>("/licenses/generate", { method: "POST", body: JSON.stringify(input) }),
  blockLicense: (id: string, reason?: string) => request<any>(`/licenses/${id}/block`, { method: "POST", body: JSON.stringify({ reason }) }),
  renewLicense: (id: string, validUntil: string) => request<any>(`/licenses/${id}/renew`, { method: "POST", body: JSON.stringify({ validUntil }) }),
  changeLicensePlan: (id: string, planCode: string) => request<any>(`/licenses/${id}/plan`, { method: "POST", body: JSON.stringify({ planCode }) }),
  saveLicenseModules: (id: string, features: any) => request<any>(`/licenses/${id}/modules`, { method: "POST", body: JSON.stringify({ features }) }),
  resetActivation: (id: string) => request<any>(`/licenses/${id}/reset-activation`, { method: "POST" }),
  devices: () => request<any[]>("/admin/devices"),
  deactivateDevice: (id: string) => request<any>(`/devices/${id}/deactivate`, { method: "POST" }),
  syncJobs: () => request<any[]>("/admin/sync-jobs"),
  audit: () => request<any[]>("/admin/audit"),
  logs: () => request<any[]>("/admin/logs")
};
