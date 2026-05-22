import { z } from "zod";

const boolFromEnv = z
  .union([z.boolean(), z.string()])
  .default(false)
  .transform((value) => (typeof value === "boolean" ? value : ["1", "true", "yes", "on"].includes(value.trim().toLowerCase())));

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().optional(),
  API_PORT: z.coerce.number().optional(),
  API_HOST: z.string().default("0.0.0.0"),
  JWT_SECRET: z.string().optional(),
  JWT_REFRESH_SECRET: z.string().optional(),
  REFRESH_SECRET: z.string().optional(),
  CORS_ORIGIN: z.string().optional(),
  ADMIN_APP_URL: z.string().optional(),
  ADMIN_PANEL_URL: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  LICENSE_OFFLINE_GRACE_DAYS: z.coerce.number().default(7),
  RATE_LIMIT_MAX: z.coerce.number().default(120),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60_000),
  UPDATE_CHANNEL: z.enum(["stable", "beta", "dev"]).default("stable"),
  UPDATE_VERSION: z.string().default("0.1.0"),
  UPDATE_CHANGELOG: z.string().default("Infraestrutura de atualizacao preparada."),
  UPDATE_DOWNLOAD_URL: z.string().default(""),
  UPDATE_MANDATORY: boolFromEnv
});

const parsed = schema.parse(process.env);

export const isProduction = parsed.NODE_ENV === "production";

const devJwtSecret = "nexpdv-dev-secret-change-before-production";
const devRefreshSecret = "nexpdv-refresh-dev-secret-change-before-production";

const isWeakSecret = (value: string | undefined) =>
  !value || value.length < 32 || value.includes("change-me") || value.includes("dev-secret");

if (isProduction && isWeakSecret(parsed.JWT_SECRET)) {
  throw new Error("JWT_SECRET deve ser definido em producao com pelo menos 32 caracteres.");
}

const refreshSecret = parsed.REFRESH_SECRET ?? parsed.JWT_REFRESH_SECRET;
if (isProduction && isWeakSecret(refreshSecret)) {
  throw new Error("REFRESH_SECRET deve ser definido em producao com pelo menos 32 caracteres.");
}

const splitOrigins = (value?: string) =>
  (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

const devOrigins = [
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "http://localhost:5173",
  "http://127.0.0.1:5173"
];

const configuredOrigins = [
  ...splitOrigins(parsed.CORS_ORIGIN),
  ...splitOrigins(parsed.ADMIN_APP_URL),
  ...splitOrigins(parsed.ADMIN_PANEL_URL),
  ...(!isProduction ? devOrigins : [])
].filter((origin) => origin !== "*");

const corsAllowAll = !isProduction && (parsed.CORS_ORIGIN ?? "*") === "*";
const corsOrigins = Array.from(new Set(configuredOrigins.map((origin) => origin.replace(/\/$/, ""))));

if (isProduction && !corsOrigins.length) {
  throw new Error("CORS_ORIGIN ou ADMIN_APP_URL deve apontar para o painel admin em producao.");
}

export const config = {
  ...parsed,
  API_PORT: parsed.PORT ?? parsed.API_PORT ?? 3333,
  JWT_SECRET: parsed.JWT_SECRET ?? devJwtSecret,
  JWT_REFRESH_SECRET: refreshSecret ?? devRefreshSecret,
  CORS_ORIGIN: parsed.CORS_ORIGIN ?? (isProduction ? "" : "*"),
  CORS_ORIGINS: corsOrigins,
  CORS_ALLOW_ALL: corsAllowAll,
  APP_VERSION: process.env.npm_package_version ?? "0.1.0"
};
