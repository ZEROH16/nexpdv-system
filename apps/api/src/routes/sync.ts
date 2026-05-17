import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { processSyncQueue } from "../services/syncService.js";
import { serializeProduct, serializeSale } from "../services/serializers.js";

export const syncRoutes = async (app: FastifyInstance) => {
  app.post("/sync/push", async (request) => {
    const body = z.object({ items: z.array(z.any()) }).parse(request.body);
    const deviceId = (request.headers["x-device-id"] as string | undefined) ?? "unknown-device";
    return processSyncQueue(app, body.items, deviceId);
  });

  app.get("/sync/pull", async (request) => {
    const query = z.object({ companyId: z.string(), since: z.string().optional() }).parse(request.query);
    const since = query.since ? new Date(query.since) : new Date(0);
    const [products, customers, sales] = await Promise.all([
      app.prisma.product.findMany({ where: { companyId: query.companyId, updatedAt: { gte: since } } }),
      app.prisma.customer.findMany({ where: { companyId: query.companyId, updatedAt: { gte: since } } }),
      app.prisma.sale.findMany({ where: { companyId: query.companyId, updatedAt: { gte: since } }, include: { items: true, payments: true } })
    ]);
    return {
      serverTime: new Date().toISOString(),
      products: products.map(serializeProduct),
      customers,
      sales: sales.map(serializeSale)
    };
  });
};
