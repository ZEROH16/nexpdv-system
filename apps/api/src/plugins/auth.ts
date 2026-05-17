import jwt from "@fastify/jwt";
import type { FastifyInstance } from "fastify";

export const registerAuth = async (app: FastifyInstance) => {
  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? "nexpdv-dev-secret"
  });

  app.decorate("authenticate", async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      reply.code(401).send({ message: "Sessao invalida." });
    }
  });
};
