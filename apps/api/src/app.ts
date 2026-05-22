import cors from "@fastify/cors";
import Fastify from "fastify";
import { authRoutes } from "./routes/auth.js";
import { cashRegisterRoutes } from "./routes/cashRegister.js";
import { customerRoutes } from "./routes/customers.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { productRoutes } from "./routes/products.js";
import { saleRoutes } from "./routes/sales.js";
import { syncRoutes } from "./routes/sync.js";
import { saasRoutes } from "./routes/saas.js";
import { notificationRoutes } from "./routes/notifications.js";
import { config, isProduction } from "./config.js";
import { registerAuth } from "./plugins/auth.js";
import { registerPrisma } from "./plugins/prisma.js";
import { registerRateLimit } from "./plugins/rateLimit.js";
import { registerRealtime } from "./plugins/realtime.js";

export const buildApp = async () => {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" });

  await app.register(cors, {
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With"],
    exposedHeaders: ["x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset"],
    maxAge: 86400,
    optionsSuccessStatus: 204,
    strictPreflight: false,
    preflight: true,
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      const normalizedOrigin = origin.replace(/\/$/, "");
      const allowed = config.CORS_ALLOW_ALL || config.CORS_ORIGINS.includes(normalizedOrigin);
      callback(null, allowed);
    }
  });
  await registerRateLimit(app);
  await registerPrisma(app);
  await registerAuth(app);
  await registerRealtime(app);

  app.get("/health", async (_request, reply) => {
    try {
      await app.prisma.$queryRaw`SELECT 1`;
      return {
        status: "ok",
        product: "NexPDV Cloud",
        version: config.APP_VERSION,
        environment: config.NODE_ENV,
        database: "connected",
        time: new Date().toISOString()
      };
    } catch (error) {
      app.log.error(error, "healthcheck database failed");
      reply.code(503);
      return {
        status: "degraded",
        product: "NexPDV Cloud",
        version: config.APP_VERSION,
        environment: config.NODE_ENV,
        database: "disconnected",
        time: new Date().toISOString()
      };
    }
  });

  await app.register(authRoutes);
  await app.register(syncRoutes);
  await app.register(productRoutes);
  await app.register(customerRoutes);
  await app.register(saleRoutes);
  await app.register(cashRegisterRoutes);
  await app.register(dashboardRoutes);
  await app.register(notificationRoutes);
  await app.register(saasRoutes);

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    reply.code(error.statusCode ?? 400).send({
      message: error.message ?? "Erro inesperado.",
      code: error.code ?? "API_ERROR",
      ...(isProduction ? {} : { details: error.stack })
    });
  });

  return app;
};
