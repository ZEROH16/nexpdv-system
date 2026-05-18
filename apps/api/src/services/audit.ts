import type { FastifyInstance, FastifyRequest } from "fastify";

export const audit = async (
  app: FastifyInstance,
  input: {
    tenantId?: string | null;
    userId?: string | null;
    action: string;
    entity?: string;
    entityId?: string;
    details?: string;
    request?: FastifyRequest;
  }
) => {
  await app.prisma.auditLog.create({
    data: {
      tenantId: input.tenantId ?? undefined,
      userId: input.userId ?? undefined,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      details: input.details,
      ip: input.request?.ip,
      userAgent: input.request?.headers["user-agent"]
    }
  });
};

