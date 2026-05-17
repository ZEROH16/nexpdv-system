import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { calculateMargin } from "@nexpdv/shared";
import { serializeProduct } from "../services/serializers.js";

const productSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  barcode: z.string().optional().nullable(),
  sku: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  brand: z.string().optional().nullable(),
  cost: z.number().default(0),
  price: z.number().default(0),
  stock: z.number().default(0),
  minStock: z.number().default(0),
  unit: z.string().default("UN"),
  imageUrl: z.string().optional().nullable(),
  active: z.boolean().default(true)
});

export const productRoutes = async (app: FastifyInstance) => {
  app.addHook("preHandler", app.authenticate);

  app.get("/products", async (request) => {
    const query = z.object({ search: z.string().optional(), lowStock: z.coerce.boolean().optional() }).parse(request.query);
    const user = request.user as any;
    const products = await app.prisma.product.findMany({
      where: {
        companyId: user.companyId,
        ...(query.search
          ? {
              OR: [
                { name: { contains: query.search } },
                { barcode: { contains: query.search } },
                { sku: { contains: query.search } }
              ]
            }
          : {}),
      },
      include: { category: true },
      orderBy: { name: "asc" },
      take: 200
    });
    const visibleProducts = query.lowStock ? products.filter((product) => Number(product.stock) <= Number(product.minStock)) : products;
    return visibleProducts.map((product) => ({ ...serializeProduct(product), categoryName: product.category?.name }));
  });

  app.post("/products", async (request) => {
    const input = productSchema.parse(request.body);
    const user = request.user as any;
    const { id, ...fields } = input;
    const data = { ...fields, companyId: user.companyId, margin: calculateMargin(input.cost, input.price), syncStatus: "synced" as const };
    const product = await app.prisma.product.upsert({
      where: { id: id ?? "__new__" },
      update: data,
      create: { ...(id ? { id } : {}), ...data }
    });
    app.broadcast("product.updated", serializeProduct(product));
    return serializeProduct(product);
  });
};
