import jwt from "@fastify/jwt";
import type { FastifyInstance } from "fastify";
import { config } from "../config.js";

export const registerAuth = async (app: FastifyInstance) => {
  await app.register(jwt, {
    secret: config.JWT_SECRET
  });

  app.decorate("authenticate", async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      reply.code(401).send({ message: "Sessao invalida." });
    }
  });
};
