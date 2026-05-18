import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  API_PORT: z.coerce.number().default(3333),
  JWT_SECRET: z.string().min(12).default("nexpdv-dev-secret"),
  JWT_REFRESH_SECRET: z.string().min(12).default("nexpdv-refresh-dev-secret"),
  CORS_ORIGIN: z.string().default("*"),
  LICENSE_OFFLINE_GRACE_DAYS: z.coerce.number().default(7),
  RATE_LIMIT_MAX: z.coerce.number().default(120),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60_000)
});

export const config = schema.parse(process.env);
export const isProduction = config.NODE_ENV === "production";

