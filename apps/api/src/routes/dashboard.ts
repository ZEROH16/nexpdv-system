import type { FastifyInstance } from "fastify";

export const dashboardRoutes = async (app: FastifyInstance) => {
  app.addHook("preHandler", app.authenticate);

  app.get("/dashboard", async (request) => {
    const user = request.user as any;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const month = new Date(today.getFullYear(), today.getMonth(), 1);
    const [daily, monthly, lowStock, pendingLogs, topProducts, openCash] = await Promise.all([
      app.prisma.sale.aggregate({ where: { companyId: user.companyId, status: "completed", createdAt: { gte: today } }, _sum: { total: true, profit: true }, _count: { _all: true } }),
      app.prisma.sale.aggregate({ where: { companyId: user.companyId, status: "completed", createdAt: { gte: month } }, _sum: { total: true } }),
      app.prisma.product.count({ where: { companyId: user.companyId, active: true, stock: { lte: 5 } } }),
      app.prisma.syncLog.count({ where: { companyId: user.companyId, status: { in: ["failed", "pending"] } } }),
      app.prisma.saleItem.groupBy({
        by: ["productName"],
        where: { sale: { companyId: user.companyId, status: "completed" } },
        _sum: { quantity: true, total: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: 5
      }),
      app.prisma.cashRegister.findFirst({ where: { companyId: user.companyId, status: "open" }, orderBy: { openedAt: "desc" } })
    ]);

    const chart = await Promise.all(
      Array.from({ length: 7 }).map(async (_, index) => {
        const date = new Date();
        date.setDate(date.getDate() - (6 - index));
        const start = new Date(date);
        start.setHours(0, 0, 0, 0);
        const end = new Date(date);
        end.setHours(23, 59, 59, 999);
        const value = await app.prisma.sale.aggregate({
          where: { companyId: user.companyId, status: "completed", createdAt: { gte: start, lte: end } },
          _sum: { total: true }
        });
        return { label: `${date.getDate()}/${date.getMonth() + 1}`, value: Number(value._sum.total ?? 0) };
      })
    );

    const dailyRevenue = Number(daily._sum.total ?? 0);
    const salesCount = daily._count._all;
    return {
      dailyRevenue,
      monthlyRevenue: Number(monthly._sum.total ?? 0),
      estimatedProfit: Number(daily._sum.profit ?? 0),
      averageTicket: salesCount ? dailyRevenue / salesCount : 0,
      salesCount,
      lowStockCount: lowStock,
      cashBalance: Number(openCash?.expectedAmount ?? 0),
      syncPending: pendingLogs,
      topProducts: topProducts.map((item) => ({
        name: item.productName,
        quantity: Number(item._sum.quantity ?? 0),
        revenue: Number(item._sum.total ?? 0)
      })),
      salesChart: chart
    };
  });
};
