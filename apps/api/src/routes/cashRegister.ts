import type { FastifyInstance } from "fastify";
import { z } from "zod";

export const cashRegisterRoutes = async (app: FastifyInstance) => {
  app.addHook("preHandler", app.authenticate);

  app.get("/cash-register/current", async (request) => {
    const user = request.user as any;
    return app.prisma.cashRegister.findFirst({
      where: { companyId: user.companyId, status: "open" },
      orderBy: { openedAt: "desc" },
      include: { movements: { orderBy: { createdAt: "desc" }, take: 50 } }
    });
  });

  app.post("/cash-register/open", async (request) => {
    const input = z.object({ openingAmount: z.number().default(0) }).parse(request.body);
    const user = request.user as any;
    const existing = await app.prisma.cashRegister.findFirst({ where: { companyId: user.companyId, status: "open" } });
    if (existing) return existing;
    const cash = await app.prisma.cashRegister.create({
      data: {
        companyId: user.companyId,
        operatorId: user.sub,
        operatorName: user.name,
        openingAmount: input.openingAmount,
        expectedAmount: input.openingAmount,
        status: "open",
        movements: { create: { type: "opening", description: "Abertura de caixa", amount: input.openingAmount } }
      }
    });
    app.broadcast("cash.opened", cash);
    return cash;
  });

  app.post("/cash-register/movements", async (request) => {
    const input = z.object({ type: z.enum(["income", "expense", "withdrawal"]), description: z.string(), amount: z.number().positive() }).parse(request.body);
    const user = request.user as any;
    const cash = await app.prisma.cashRegister.findFirst({ where: { companyId: user.companyId, status: "open" } });
    if (!cash) throw new Error("Caixa aberto nao encontrado.");
    const signedAmount = input.type === "income" ? input.amount : -input.amount;
    await app.prisma.cashMovement.create({ data: { cashRegisterId: cash.id, type: input.type, description: input.description, amount: signedAmount } });
    const updated = await app.prisma.cashRegister.update({ where: { id: cash.id }, data: { expectedAmount: { increment: signedAmount } } });
    app.broadcast("cash.movement", updated);
    return updated;
  });

  app.post("/cash-register/close", async (request) => {
    const input = z.object({ cashRegisterId: z.string(), countedAmount: z.number() }).parse(request.body);
    const cash = await app.prisma.cashRegister.findUnique({ where: { id: input.cashRegisterId } });
    if (!cash || cash.status !== "open") throw new Error("Caixa aberto nao encontrado.");
    const difference = input.countedAmount - Number(cash.expectedAmount);
    const updated = await app.prisma.cashRegister.update({
      where: { id: cash.id },
      data: { countedAmount: input.countedAmount, difference, closedAt: new Date(), status: "closed" }
    });
    await app.prisma.cashMovement.create({ data: { cashRegisterId: cash.id, type: "closing", description: "Fechamento de caixa", amount: input.countedAmount } });
    app.broadcast("cash.closed", updated);
    return updated;
  });
};
