import { z } from "zod";

const boolFromEnv = z
  .union([z.boolean(), z.string()])
  .default(false)
  .transform((value) => (typeof value === "boolean" ? value : ["1", "true", "yes", "on"].includes(value.trim().toLowerCase())));

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  API_PORT: z.coerce.number().default(3333),
  JWT_SECRET: z.string().min(12).default("nexpdv-dev-secret"),
  JWT_REFRESH_SECRET: z.string().min(12).default("nexpdv-refresh-dev-secret"),
  CORS_ORIGIN: z.string().default("*"),
  LICENSE_OFFLINE_GRACE_DAYS: z.coerce.number().default(7),
  RATE_LIMIT_MAX: z.coerce.number().default(120),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60_000),
  UPDATE_CHANNEL: z.enum(["stable", "beta", "dev"]).default("stable"),
  UPDATE_VERSION: z.string().default("0.1.0"),
  UPDATE_CHANGELOG: z.string().default("Infraestrutura de atualizacao preparada."),
  UPDATE_DOWNLOAD_URL: z.string().default(""),
  UPDATE_MANDATORY: boolFromEnv
});

export const config = schema.parse(process.env);
export const isProduction = config.NODE_ENV === "production";
