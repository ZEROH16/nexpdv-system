const API_URL = import.meta.env.VITE_CLOUD_API_URL ?? "http://localhost:3333";

export interface Session {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
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
    localStorage.removeItem("nexpdv_admin_user");
  },
  companies: () => request<any[]>("/admin/companies"),
  users: () => request<any[]>("/admin/users"),
  plans: () => request<any[]>("/admin/plans"),
  subscriptions: () => request<any[]>("/admin/subscriptions"),
  logs: () => request<any[]>("/admin/logs")
};
