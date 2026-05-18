import type { FastifyInstance } from "fastify";

export const adminRoutes = async (app: FastifyInstance) => {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", async (request, reply) => {
    const user = request.user as any;
    if (!["owner", "admin"].includes(user.role)) {
      return reply.code(403).send({ message: "Acesso administrativo restrito." });
    }
  });

  app.get("/admin/companies", async () =>
    app.prisma.company.findMany({
      include: {
        licenses: true,
        subscriptions: { include: { plan: true } },
        _count: { select: { users: true, products: true, sales: true } }
      },
      orderBy: { createdAt: "desc" }
    })
  );

  app.get("/admin/users", async () =>
    app.prisma.user.findMany({
      select: { id: true, companyId: true, name: true, email: true, role: true, active: true, createdAt: true },
      orderBy: { createdAt: "desc" }
    })
  );

  app.get("/admin/plans", async () => app.prisma.plan.findMany({ orderBy: { price: "asc" } }));

  app.get("/admin/subscriptions", async () =>
    app.prisma.subscription.findMany({
      include: { company: true, plan: true },
      orderBy: { createdAt: "desc" }
    })
  );

  app.get("/admin/logs", async () =>
    app.prisma.syncLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 200
    })
  );
};
