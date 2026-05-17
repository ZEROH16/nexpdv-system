import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { calculateSaleTotals, saleNumber } from "@nexpdv/shared";
import { serializeSale } from "../services/serializers.js";

const saleSchema = z.object({
  number: z.string().optional(),
  customerId: z.string().optional(),
  notes: z.string().optional(),
  discount: z.number().default(0),
  items: z.array(z.object({ productId: z.string(), quantity: z.number().positive(), discount: z.number().default(0) })).min(1),
  payments: z.array(z.object({ method: z.enum(["cash", "pix", "credit", "debit", "store_credit"]), amount: z.number().positive() })).min(1)
});

export const saleRoutes = async (app: FastifyInstance) => {
  app.addHook("preHandler", app.authenticate);

  app.get("/sales", async (request) => {
    const query = z.object({ start: z.string().optional(), end: z.string().optional(), search: z.string().optional() }).parse(request.query);
    const user = request.user as any;
    const createdAt = query.start || query.end ? { ...(query.start ? { gte: new Date(query.start) } : {}), ...(query.end ? { lte: new Date(query.end) } : {}) } : undefined;
    const sales = await app.prisma.sale.findMany({
      where: {
        companyId: user.companyId,
        ...(createdAt ? { createdAt } : {}),
        ...(query.search
          ? {
              OR: [
                { number: { contains: query.search } },
                { customerName: { contains: query.search } },
                { operatorName: { contains: query.search } }
              ]
            }
          : {})
      },
      include: { items: true, payments: true },
      orderBy: { createdAt: "desc" },
      take: 200
    });
    return sales.map(serializeSale);
  });

  app.post("/sales", async (request) => {
    const input = saleSchema.parse(request.body);
    const user = request.user as any;
    const sale = await app.prisma.$transaction(async (tx) => {
      const products = await tx.product.findMany({ where: { companyId: user.companyId, id: { in: input.items.map((item) => item.productId) } } });
      const items = input.items.map((item) => {
        const product = products.find((candidate) => candidate.id === item.productId);
        if (!product || Number(product.stock) < item.quantity || !product.active) throw new Error("Produto indisponivel.");
        return {
          productId: product.id,
          productName: product.name,
          quantity: item.quantity,
          unitPrice: Number(product.price),
          discount: item.discount,
          total: Number(product.price) * item.quantity - item.discount,
          cost: Number(product.cost)
        };
      });
      const totals = calculateSaleTotals(
        items.map((item) => ({ ...item, id: "", saleId: "" })),
        input.payments.map((payment) => ({ ...payment, id: "", saleId: "" })),
        input.discount
      );
      if (totals.paid < totals.total) throw new Error("Pagamento insuficiente.");
      const customer = input.customerId ? await tx.customer.findFirst({ where: { id: input.customerId, companyId: user.companyId } }) : null;
      const storeCreditAmount = input.payments.filter((payment) => payment.method === "store_credit").reduce((sum, payment) => sum + payment.amount, 0);
      if (storeCreditAmount > 0) {
        if (!customer) throw new Error("Cliente obrigatorio para venda fiado.");
        if (Number(customer.balance) + storeCreditAmount > Number(customer.creditLimit)) throw new Error("Limite fiado insuficiente.");
      }
      const created = await tx.sale.create({
        data: {
          companyId: user.companyId,
          number: input.number ?? saleNumber(),
          operatorId: user.sub,
          operatorName: user.name,
          customerId: customer?.id,
          customerName: customer?.name,
          subtotal: totals.subtotal,
          discount: input.discount,
          total: totals.total,
          profit: totals.profit,
          notes: input.notes,
          status: "completed",
          syncStatus: "synced",
          items: { create: items },
          payments: { create: input.payments.map((payment) => ({ ...payment, change: payment.method === "cash" ? totals.change : 0 })) }
        },
        include: { items: true, payments: true }
      });
      await Promise.all(input.items.map((item) => tx.product.update({ where: { id: item.productId }, data: { stock: { decrement: item.quantity } } })));
      if (customer && storeCreditAmount > 0) {
        await tx.customer.update({ where: { id: customer.id }, data: { balance: { increment: storeCreditAmount } } });
      }
      return created;
    });
    const payload = serializeSale(sale);
    app.broadcast("sale.created", payload);
    return payload;
  });

  app.post("/sales/:id/cancel", async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const user = request.user as any;
    const sale = await app.prisma.$transaction(async (tx) => {
      const existing = await tx.sale.findFirst({ where: { id: params.id, companyId: user.companyId }, include: { items: true, payments: true } });
      if (!existing) throw new Error("Venda nao encontrada.");
      if (existing.status === "completed") {
        await Promise.all(existing.items.map((item) => tx.product.update({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } })));
        const storeCreditAmount = existing.payments.filter((payment) => payment.method === "store_credit").reduce((sum, payment) => sum + Number(payment.amount), 0);
        if (existing.customerId && storeCreditAmount > 0) {
          const customer = await tx.customer.findUnique({ where: { id: existing.customerId } });
          await tx.customer.update({ where: { id: existing.customerId }, data: { balance: Math.max(Number(customer?.balance ?? 0) - storeCreditAmount, 0) } });
        }
        const cash = await tx.cashRegister.findFirst({ where: { companyId: user.companyId, status: "open" }, orderBy: { openedAt: "desc" } });
        if (cash) {
          await tx.cashMovement.create({ data: { cashRegisterId: cash.id, type: "expense", description: `Cancelamento ${existing.number}`, amount: -Number(existing.total) } });
          await tx.cashRegister.update({ where: { id: cash.id }, data: { expectedAmount: { decrement: existing.total } } });
        }
      }
      return tx.sale.update({ where: { id: params.id }, data: { status: "cancelled" }, include: { items: true, payments: true } });
    });
    const payload = serializeSale(sale);
    app.broadcast("sale.cancelled", payload);
    return payload;
  });
};
