import { PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";

export const registerPrisma = async (app: FastifyInstance) => {
  const prisma = new PrismaClient();
  app.decorate("prisma", prisma);
  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });
};
