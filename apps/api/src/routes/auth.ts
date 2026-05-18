import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audit } from "../services/audit.js";
import { generateTwoFactorSecret, otpauthUrl, qrCodeDataUrl, recoveryCodes, verifyTotp } from "../services/twoFactor.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(4),
  twoFactorCode: z.string().optional(),
  recoveryCode: z.string().optional()
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
const lockMinutes = 15;
const recoverySeparator = "::";

const publicUser = (user: {
  id: string;
  tenantId: string | null;
  companyId: string;
  company: { tradeName: string | null; name: string };
  name: string;
  email: string;
  role: string;
  platformRole: string;
  twoFactorEnabled?: boolean;
}) => ({
  id: user.id,
  tenantId: user.tenantId,
  companyId: user.companyId,
  companyName: user.company.tradeName ?? user.company.name,
  name: user.name,
  email: user.email,
  role: user.role,
  platformRole: user.platformRole,
  twoFactorEnabled: Boolean(user.twoFactorEnabled)
});

const validateRecoveryCode = async (hashList: string | null, code?: string) => {
  if (!hashList || !code) return { ok: false, nextHashList: hashList };
  const hashes = hashList.split(recoverySeparator).filter(Boolean);
  for (let index = 0; index < hashes.length; index += 1) {
    if (await bcrypt.compare(code.trim().toUpperCase(), hashes[index])) {
      hashes.splice(index, 1);
      return { ok: true, nextHashList: hashes.join(recoverySeparator) || null };
    }
  }
  return { ok: false, nextHashList: hashList };
};

export const authRoutes = async (app: FastifyInstance) => {
  app.post("/auth/login", async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const user = await app.prisma.user.findUnique({ where: { email: input.email }, include: { company: true } });
    if (!user || !user.active) {
      await audit(app, { action: "login falhou", details: input.email, request });
      return reply.code(401).send({ message: "Email ou senha invalidos." });
    }
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      await audit(app, { tenantId: user.tenantId, userId: user.id, action: "login bloqueado", entity: "user", entityId: user.id, request });
      return reply.code(423).send({ message: "Usuario temporariamente bloqueado por tentativas invalidas." });
    }
    if (!(await bcrypt.compare(input.password, user.passwordHash))) {
      const attempts = user.failedLoginAttempts + 1;
      await app.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: attempts,
          lockedUntil: attempts >= 5 ? new Date(Date.now() + lockMinutes * 60_000) : null
        }
      });
      await audit(app, { tenantId: user.tenantId, userId: user.id, action: "login falhou", entity: "user", entityId: user.id, details: input.email, request });
      return reply.code(401).send({ message: "Email ou senha invalidos." });
    }
    if (user.twoFactorEnabled) {
      const recovery = await validateRecoveryCode(user.recoveryCodesHash, input.recoveryCode);
      const valid2fa = user.twoFactorSecret && input.twoFactorCode ? verifyTotp(user.twoFactorSecret, input.twoFactorCode) : false;
      if (!valid2fa && !recovery.ok) {
        await audit(app, { tenantId: user.tenantId, userId: user.id, action: "2fa falhou", entity: "user", entityId: user.id, request });
        return reply.code(401).send({ message: "Codigo 2FA invalido.", requiresTwoFactor: true });
      }
      if (recovery.ok) await app.prisma.user.update({ where: { id: user.id }, data: { recoveryCodesHash: recovery.nextHashList } });
    }
    const token = signSession(app, user);
    const refresh = refreshToken();
    await app.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: await bcrypt.hash(refresh, 10), failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() }
    });
    await audit(app, { tenantId: user.tenantId, userId: user.id, action: "login", entity: "user", entityId: user.id, request });
    return {
      token,
      refreshToken: refresh,
      requiresTwoFactorSetup: user.platformRole === "super_admin" && !user.twoFactorEnabled,
      user: publicUser(user)
    };
  });

  app.get("/auth/me", { preHandler: app.authenticate }, async (request, reply) => {
    const current = request.user as { sub: string };
    const user = await app.prisma.user.findUnique({ where: { id: current.sub }, include: { company: true } });
    if (!user || !user.active) return reply.code(401).send({ message: "Sessao invalida." });
    return publicUser(user);
  });

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
      user: publicUser(user)
    };
  });

  app.post("/auth/logout", { preHandler: app.authenticate }, async (request) => {
    const user = request.user as { sub: string; tenantId?: string };
    await app.prisma.user.update({ where: { id: user.sub }, data: { refreshTokenHash: null } });
    await audit(app, { tenantId: user.tenantId, userId: user.sub, action: "logout", entity: "user", entityId: user.sub, request });
    return { ok: true };
  });

  app.post("/auth/2fa/setup", { preHandler: app.authenticate }, async (request) => {
    const current = request.user as { sub: string; tenantId?: string };
    const user = await app.prisma.user.findUniqueOrThrow({ where: { id: current.sub } });
    const secret = generateTwoFactorSecret();
    const uri = otpauthUrl(secret, user.email);
    await app.prisma.user.update({ where: { id: user.id }, data: { twoFactorSecret: secret, twoFactorEnabled: false } });
    await audit(app, { tenantId: current.tenantId, userId: current.sub, action: "2fa setup iniciado", entity: "user", entityId: current.sub, request });
    return { secret, otpauthUrl: uri, qrCodeDataUrl: await qrCodeDataUrl(uri) };
  });

  app.post("/auth/2fa/enable", { preHandler: app.authenticate }, async (request, reply) => {
    const current = request.user as { sub: string; tenantId?: string };
    const input = z.object({ code: z.string().min(6) }).parse(request.body);
    const user = await app.prisma.user.findUniqueOrThrow({ where: { id: current.sub } });
    if (!user.twoFactorSecret || !verifyTotp(user.twoFactorSecret, input.code)) return reply.code(400).send({ message: "Codigo 2FA invalido." });
    const codes = recoveryCodes();
    const hashes = await Promise.all(codes.map((code) => bcrypt.hash(code, 10)));
    await app.prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true, recoveryCodesHash: hashes.join(recoverySeparator) } });
    await audit(app, { tenantId: current.tenantId, userId: current.sub, action: "2fa ativado", entity: "user", entityId: current.sub, request });
    return { recoveryCodes: codes };
  });

  app.post("/auth/2fa/disable", { preHandler: app.authenticate }, async (request) => {
    const current = request.user as { sub: string; tenantId?: string };
    await app.prisma.user.update({ where: { id: current.sub }, data: { twoFactorEnabled: false, twoFactorSecret: null, recoveryCodesHash: null } });
    await audit(app, { tenantId: current.tenantId, userId: current.sub, action: "2fa desativado", entity: "user", entityId: current.sub, request });
    return { ok: true };
  });
};
