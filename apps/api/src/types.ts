import type { PrismaClient } from "@prisma/client";

export type UserRole = "owner" | "admin" | "manager" | "cashier";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
    authenticate: (request: import("fastify").FastifyRequest, reply: import("fastify").FastifyReply) => Promise<void>;
    broadcast: (event: string, payload: unknown) => void;
  }
}

export interface AuthUser {
  sub: string;
  companyId: string;
  role: UserRole;
  name: string;
}
