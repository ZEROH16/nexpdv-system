import type { FastifyInstance } from "fastify";
import { z } from "zod";

export const notificationRoutes = async (app: FastifyInstance) => {
  app.addHook("preHandler", app.authenticate);

  app.post("/notifications/register", async (request) => {
    const input = z.object({ token: z.string().min(10), platform: z.string().default("unknown") }).parse(request.body);
    const user = request.user as any;
    return app.prisma.deviceToken.upsert({
      where: { token: input.token },
      update: { active: true, platform: input.platform, userId: user.sub, companyId: user.companyId },
      create: { token: input.token, platform: input.platform, userId: user.sub, companyId: user.companyId }
    });
  });
};
