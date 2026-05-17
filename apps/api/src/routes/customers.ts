import type { FastifyInstance } from "fastify";
import { z } from "zod";

const customerSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  document: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  whatsapp: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  creditLimit: z.number().default(0),
  balance: z.number().default(0)
});

export const customerRoutes = async (app: FastifyInstance) => {
  app.addHook("preHandler", app.authenticate);

  app.get("/customers", async (request) => {
    const query = z.object({ search: z.string().optional() }).parse(request.query);
    const user = request.user as any;
    return app.prisma.customer.findMany({
      where: {
        companyId: user.companyId,
        ...(query.search
          ? {
              OR: [
                { name: { contains: query.search } },
                { document: { contains: query.search } },
                { phone: { contains: query.search } }
              ]
            }
          : {})
      },
      orderBy: { name: "asc" },
      take: 200
    });
  });

  app.post("/customers", async (request) => {
    const input = customerSchema.parse(request.body);
    const user = request.user as any;
    const { id, ...fields } = input;
    const customer = await app.prisma.customer.upsert({
      where: { id: id ?? "__new__" },
      update: { ...fields, syncStatus: "synced" },
      create: { ...(id ? { id } : {}), ...fields, companyId: user.companyId, syncStatus: "synced" }
    });
    app.broadcast("customer.updated", customer);
    return customer;
  });
};
