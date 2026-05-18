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
import { config } from "./config.js";
import { registerAuth } from "./plugins/auth.js";
import { registerPrisma } from "./plugins/prisma.js";
import { registerRateLimit } from "./plugins/rateLimit.js";
import { registerRealtime } from "./plugins/realtime.js";

export const buildApp = async () => {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" });

  await app.register(cors, { origin: config.CORS_ORIGIN === "*" ? true : config.CORS_ORIGIN.split(","), credentials: true });
  await registerRateLimit(app);
  await registerPrisma(app);
  await registerAuth(app);
  await registerRealtime(app);

  app.get("/health", async () => ({
    ok: true,
    product: "NexPDV Cloud",
    mode: "saas-central",
    database: "cloud-ready",
    time: new Date().toISOString()
  }));

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
      code: error.code ?? "API_ERROR"
    });
  });

  return app;
};
