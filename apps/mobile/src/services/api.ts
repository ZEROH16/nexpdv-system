import AsyncStorage from "@react-native-async-storage/async-storage";
import type { DashboardMetrics, Product, Sale } from "@nexpdv/shared";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3333";

export interface Session {
  token: string;
  user: {
    id: string;
    companyId: string;
    companyName: string;
    name: string;
    email: string;
    role: string;
  };
}

const request = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
  const token = await AsyncStorage.getItem("nexpdv_token");
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
    throw new Error(error.message ?? "Falha de comunicacao.");
  }
  return response.json() as Promise<T>;
};

export const api = {
  login: async (email: string, password: string) => {
    const session = await request<Session>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    await AsyncStorage.setItem("nexpdv_token", session.token);
    await AsyncStorage.setItem("nexpdv_user", JSON.stringify(session.user));
    return session;
  },
  restoreSession: async () => {
    const [token, user] = await Promise.all([AsyncStorage.getItem("nexpdv_token"), AsyncStorage.getItem("nexpdv_user")]);
    return token && user ? ({ token, user: JSON.parse(user) } as Session) : undefined;
  },
  logout: async () => {
    await AsyncStorage.multiRemove(["nexpdv_token", "nexpdv_user"]);
  },
  dashboard: () => request<DashboardMetrics>("/dashboard"),
  sales: () => request<Sale[]>("/sales"),
  products: () => request<Product[]>("/products"),
  cashRegister: () => request<unknown>("/cash-register/current"),
  registerPushToken: (input: { token: string; platform: string }) =>
    request("/notifications/register", { method: "POST", body: JSON.stringify(input) })
};

export const wsUrl = process.env.EXPO_PUBLIC_WS_URL ?? "ws://localhost:3333/realtime";
