import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audit } from "../services/audit.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(4)
});

const refreshSchema = z.object({
  refreshToken: z.string().min(20)
});

const signSession = (app: FastifyInstance, user: { id: string; tenantId: string | null; companyId: string; role: string; platformRole: string; name: string }) =>
  app.jwt.sign(
    {
      sub: user.id,
      tenantId: user.tenantId ?? undefined,
      companyId: user.companyId,
      role: user.role,
      platformRole: user.platformRole,
      name: user.name
    },
    { expiresIn: "8h" }
  );

const refreshToken = () => randomBytes(48).toString("base64url");

export const authRoutes = async (app: FastifyInstance) => {
  app.post("/auth/login", async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const user = await app.prisma.user.findUnique({ where: { email: input.email }, include: { company: true } });
    if (!user || !user.active || !(await bcrypt.compare(input.password, user.passwordHash))) {
      await audit(app, { action: "login falhou", details: input.email, request });
      return reply.code(401).send({ message: "Email ou senha invalidos." });
    }
    const token = signSession(app, user);
    const refresh = refreshToken();
    await app.prisma.user.update({ where: { id: user.id }, data: { refreshTokenHash: await bcrypt.hash(refresh, 10) } });
    await audit(app, { tenantId: user.tenantId, userId: user.id, action: "login", entity: "user", entityId: user.id, request });
    return {
      token,
      refreshToken: refresh,
      user: {
        id: user.id,
        tenantId: user.tenantId,
        companyId: user.companyId,
        companyName: user.company.tradeName ?? user.company.name,
        name: user.name,
        email: user.email,
        role: user.role,
        platformRole: user.platformRole
      }
    };
  });

  app.get("/auth/me", { preHandler: app.authenticate }, async (request) => request.user);

  app.post("/auth/refresh", async (request, reply) => {
    const input = refreshSchema.parse(request.body);
    const users = await app.prisma.user.findMany({ where: { active: true }, include: { company: true } });
    const user = users.find((item) => item.refreshTokenHash && bcrypt.compareSync(input.refreshToken, item.refreshTokenHash));
    if (!user) return reply.code(401).send({ message: "Refresh token invalido." });
    const refresh = refreshToken();
    await app.prisma.user.update({ where: { id: user.id }, data: { refreshTokenHash: await bcrypt.hash(refresh, 10) } });
    return {
      token: signSession(app, user),
      refreshToken: refresh,
      user: {
        id: user.id,
        tenantId: user.tenantId,
        companyId: user.companyId,
        companyName: user.company.tradeName ?? user.company.name,
        name: user.name,
        email: user.email,
        role: user.role,
        platformRole: user.platformRole
      }
    };
  });

  app.post("/auth/logout", { preHandler: app.authenticate }, async (request) => {
    const user = request.user as { sub: string; tenantId?: string };
    await app.prisma.user.update({ where: { id: user.sub }, data: { refreshTokenHash: null } });
    await audit(app, { tenantId: user.tenantId, userId: user.sub, action: "logout", entity: "user", entityId: user.sub, request });
    return { ok: true };
  });
};
