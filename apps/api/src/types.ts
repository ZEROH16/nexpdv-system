import type { PrismaClient } from "@prisma/client";
import type { FastifyReply, FastifyRequest } from "fastify";

export type UserRole = "owner" | "admin" | "manager" | "cashier";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    broadcast: (event: string, payload: unknown) => void;
  }
}

export interface AuthUser {
  sub: string;
  tenantId?: string;
  companyId: string;
  role: UserRole;
  platformRole?: string;
  name: string;
}
