import type { FastifyInstance } from "fastify";
import type { SyncQueueItem, SyncResult } from "@nexpdv/shared";

const date = (value?: string) => (value ? new Date(value) : new Date());

export const processSyncQueue = async (
  app: FastifyInstance,
  items: SyncQueueItem[],
  deviceId: string
): Promise<SyncResult> => {
  const accepted: string[] = [];
  const rejected: Array<{ id: string; reason: string }> = [];
  const conflicts: SyncResult["conflicts"] = [];

  for (const item of items) {
    try {
      const payload = item.payload as any;
      if (item.operation === "update" && ["product", "customer"].includes(item.entity) && payload.updatedAt) {
        const current =
          item.entity === "product"
            ? await app.prisma.product.findUnique({ where: { id: item.entityId }, select: { updatedAt: true } })
            : await app.prisma.customer.findUnique({ where: { id: item.entityId }, select: { updatedAt: true } });
        if (current && current.updatedAt.getTime() > new Date(payload.updatedAt).getTime()) {
          conflicts.push({ id: item.id, strategy: "cloud_wins", cloudPayload: current });
          await app.prisma.syncLog.create({
            data: {
              companyId: item.companyId,
              deviceId,
              entity: item.entity,
              entityId: item.entityId,
              operation: item.operation,
              status: "conflict",
              message: "Registro cloud mais recente.",
              payload: JSON.stringify(payload)
            }
          });
          continue;
        }
      }

      await app.prisma.$transaction(async (tx) => {
        if (item.entity === "product") {
          const categoryExists = payload.categoryId
            ? await tx.category.findFirst({ where: { id: payload.categoryId, companyId: item.companyId } })
            : null;
          await tx.product.upsert({
            where: { id: item.entityId },
            update: {
              name: payload.name,
              barcode: payload.barcode,
              sku: payload.sku,
              categoryId: categoryExists?.id,
              brand: payload.brand,
              cost: payload.cost,
              price: payload.price,
              margin: payload.margin,
              stock: payload.stock,
              minStock: payload.minStock,
              unit: payload.unit,
              imageUrl: payload.imageUrl,
              active: payload.active,
              syncStatus: "synced"
            },
            create: {
              id: item.entityId,
              companyId: item.companyId,
              name: payload.name,
              barcode: payload.barcode,
              sku: payload.sku,
              categoryId: categoryExists?.id,
              brand: payload.brand,
              cost: payload.cost,
              price: payload.price,
              margin: payload.margin,
              stock: payload.stock,
              minStock: payload.minStock,
              unit: payload.unit,
              imageUrl: payload.imageUrl,
              active: payload.active,
              syncStatus: "synced"
            }
          });
        }

        if (item.entity === "customer") {
          await tx.customer.upsert({
            where: { id: item.entityId },
            update: {
              name: payload.name,
              document: payload.document,
              phone: payload.phone,
              whatsapp: payload.whatsapp,
              address: payload.address,
              notes: payload.notes,
              creditLimit: payload.creditLimit,
              balance: payload.balance,
              syncStatus: "synced"
            },
            create: {
              id: item.entityId,
              companyId: item.companyId,
              name: payload.name,
              document: payload.document,
              phone: payload.phone,
              whatsapp: payload.whatsapp,
              address: payload.address,
              notes: payload.notes,
              creditLimit: payload.creditLimit,
              balance: payload.balance,
              syncStatus: "synced"
            }
          });
        }

        if (item.entity === "sale") {
          const existing = await tx.sale.findUnique({ where: { id: item.entityId } });
          if (existing) {
            await tx.sale.update({ where: { id: item.entityId }, data: { status: payload.status, syncStatus: "synced" } });
          } else {
            await tx.sale.create({
              data: {
                id: item.entityId,
                companyId: item.companyId,
                number: payload.number,
                operatorId: payload.operatorId,
                operatorName: payload.operatorName,
                customerId: payload.customerId,
                customerName: payload.customerName,
                subtotal: payload.subtotal,
                discount: payload.discount,
                total: payload.total,
                profit: payload.profit,
                notes: payload.notes,
                status: payload.status,
                syncStatus: "synced",
                createdAt: date(payload.createdAt),
                updatedAt: date(payload.updatedAt),
                items: {
                  create: payload.items.map((saleItem: any) => ({
                    id: saleItem.id,
                    productId: saleItem.productId,
                    productName: saleItem.productName,
                    quantity: saleItem.quantity,
                    unitPrice: saleItem.unitPrice,
                    discount: saleItem.discount,
                    total: saleItem.total,
                    cost: saleItem.cost
                  }))
                },
                payments: {
                  create: payload.payments.map((payment: any) => ({
                    id: payment.id,
                    method: payment.method,
                    amount: payment.amount,
                    change: payment.change ?? 0
                  }))
                }
              }
            });
          }
          app.broadcast("sale.synced", payload);
        }

        if (item.entity === "cash_register") {
          await tx.cashRegister.upsert({
            where: { id: item.entityId },
            update: {
              closedAt: payload.closedAt ? date(payload.closedAt) : undefined,
              openingAmount: payload.openingAmount,
              expectedAmount: payload.expectedAmount,
              countedAmount: payload.countedAmount,
              difference: payload.difference,
              status: payload.status
            },
            create: {
              id: item.entityId,
              companyId: item.companyId,
              operatorId: payload.operatorId,
              operatorName: payload.operatorName,
              openedAt: date(payload.openedAt),
              closedAt: payload.closedAt ? date(payload.closedAt) : undefined,
              openingAmount: payload.openingAmount,
              expectedAmount: payload.expectedAmount,
              countedAmount: payload.countedAmount,
              difference: payload.difference,
              status: payload.status
            }
          });
        }

        await tx.syncLog.create({
          data: {
            companyId: item.companyId,
            deviceId,
            entity: item.entity,
            entityId: item.entityId,
            operation: item.operation,
            status: "synced",
            payload: JSON.stringify(payload)
          }
        });
      });
      accepted.push(item.id);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Erro desconhecido";
      rejected.push({ id: item.id, reason });
      await app.prisma.syncLog.create({
        data: {
          companyId: item.companyId,
          deviceId,
          entity: item.entity,
          entityId: item.entityId,
          operation: item.operation,
          status: "failed",
          message: reason,
          payload: JSON.stringify(item.payload)
        }
      });
    }
  }

  return {
    accepted,
    rejected,
    conflicts,
    serverTime: new Date().toISOString()
  };
};
