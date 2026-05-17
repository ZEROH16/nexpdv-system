import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(4)
});

export const authRoutes = async (app: FastifyInstance) => {
  app.post("/auth/login", async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const user = await app.prisma.user.findUnique({ where: { email: input.email }, include: { company: true } });
    if (!user || !user.active || !(await bcrypt.compare(input.password, user.passwordHash))) {
      return reply.code(401).send({ message: "Email ou senha invalidos." });
    }
    const token = app.jwt.sign({
      sub: user.id,
      companyId: user.companyId,
      role: user.role,
      name: user.name
    });
    return {
      token,
      user: {
        id: user.id,
        companyId: user.companyId,
        companyName: user.company.tradeName ?? user.company.name,
        name: user.name,
        email: user.email,
        role: user.role
      }
    };
  });

  app.get("/auth/me", { preHandler: app.authenticate }, async (request) => request.user);
};
