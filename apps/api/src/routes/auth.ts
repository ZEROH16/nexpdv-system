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

const firstAccessStartSchema = z.object({
  email: z.string().email(),
  password: z.string().min(4),
  initialToken: z.string().min(20)
});

const firstAccessCompleteSchema = z.object({
  firstAccessSessionToken: z.string().min(20),
  newPassword: z.string().min(8, "A nova senha deve ter pelo menos 8 caracteres."),
  twoFactorCode: z.string().min(6).max(8)
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

const signFirstAccessSession = (app: FastifyInstance, userId: string) =>
  app.jwt.sign(
    {
      sub: userId,
      purpose: "first_access"
    },
    { expiresIn: "15m" }
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
  firstAccessRequired?: boolean;
}) => ({
  id: user.id,
  tenantId: user.tenantId,
  companyId: user.companyId,
  companyName: user.company.tradeName ?? user.company.name,
  name: user.name,
  email: user.email,
  role: user.role,
  platformRole: user.platformRole,
  twoFactorEnabled: Boolean(user.twoFactorEnabled),
  firstAccessRequired: Boolean(user.firstAccessRequired)
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

const issueSession = async (
  app: FastifyInstance,
  user: {
    id: string;
    tenantId: string | null;
    companyId: string;
    company: { tradeName: string | null; name: string };
    name: string;
    email: string;
    role: string;
    platformRole: string;
    twoFactorEnabled: boolean;
    firstAccessRequired: boolean;
  }
) => {
  const refresh = refreshToken();
  await app.prisma.user.update({
    where: { id: user.id },
    data: {
      refreshTokenHash: await bcrypt.hash(refresh, 10),
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date()
    }
  });
  return {
    token: signSession(app, user),
    refreshToken: refresh,
    requiresTwoFactorSetup: user.platformRole === "super_admin" && !user.twoFactorEnabled,
    user: publicUser(user)
  };
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

    if (user.firstAccessRequired) {
      await app.prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null, refreshTokenHash: null } });
      await audit(app, { tenantId: user.tenantId, userId: user.id, action: "primeiro acesso iniciado", entity: "user", entityId: user.id, request });
      return {
        firstAccessRequired: true,
        email: user.email,
        name: user.name,
        message: "Primeiro acesso pendente. Informe o token inicial para configurar senha definitiva e 2FA."
      };
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

    const session = await issueSession(app, user);
    await audit(app, { tenantId: user.tenantId, userId: user.id, action: user.twoFactorEnabled ? "login com 2fa" : "login", entity: "user", entityId: user.id, request });
    return session;
  });

  app.post("/auth/first-access/start", async (request, reply) => {
    const input = firstAccessStartSchema.parse(request.body);
    const user = await app.prisma.user.findUnique({ where: { email: input.email }, include: { company: true } });
    if (!user || !user.active || !(await bcrypt.compare(input.password, user.passwordHash))) {
      await audit(app, { action: "primeiro acesso falhou", details: input.email, request });
      return reply.code(401).send({ message: "Credenciais invalidas para primeiro acesso." });
    }
    if (!user.firstAccessRequired || !user.initialAccessTokenHash || !user.initialAccessTokenExpiresAt) {
      return reply.code(400).send({ message: "Primeiro acesso nao esta pendente para este usuario." });
    }
    if (user.initialAccessTokenExpiresAt.getTime() <= Date.now()) {
      await audit(app, { tenantId: user.tenantId, userId: user.id, action: "token primeiro acesso expirado", entity: "user", entityId: user.id, request });
      return reply.code(410).send({ message: "Token inicial expirado. Rode o bootstrap/reset 2FA novamente." });
    }
    if (!(await bcrypt.compare(input.initialToken, user.initialAccessTokenHash))) {
      await audit(app, { tenantId: user.tenantId, userId: user.id, action: "token primeiro acesso invalido", entity: "user", entityId: user.id, request });
      return reply.code(401).send({ message: "Token inicial invalido." });
    }

    const secret = generateTwoFactorSecret();
    const uri = otpauthUrl(secret, user.email);
    await app.prisma.user.update({
      where: { id: user.id },
      data: { twoFactorSecret: secret, twoFactorEnabled: false, refreshTokenHash: null, failedLoginAttempts: 0, lockedUntil: null }
    });
    await audit(app, { tenantId: user.tenantId, userId: user.id, action: "primeiro acesso token validado", entity: "user", entityId: user.id, request });

    return {
      firstAccessSessionToken: signFirstAccessSession(app, user.id),
      secret,
      otpauthUrl: uri,
      qrCodeDataUrl: await qrCodeDataUrl(uri)
    };
  });

  app.post("/auth/first-access/complete", async (request, reply) => {
    const input = firstAccessCompleteSchema.parse(request.body);
    let payload: { sub?: string; purpose?: string };
    try {
      payload = app.jwt.verify(input.firstAccessSessionToken) as { sub?: string; purpose?: string };
    } catch {
      return reply.code(401).send({ message: "Sessao de primeiro acesso expirada. Valide o token inicial novamente." });
    }
    if (!payload.sub || payload.purpose !== "first_access") return reply.code(401).send({ message: "Sessao de primeiro acesso invalida." });

    const user = await app.prisma.user.findUnique({ where: { id: payload.sub }, include: { company: true } });
    if (!user || !user.active || !user.firstAccessRequired) return reply.code(400).send({ message: "Primeiro acesso nao esta pendente." });
    if (!user.twoFactorSecret || !verifyTotp(user.twoFactorSecret, input.twoFactorCode)) {
      await audit(app, { tenantId: user.tenantId, userId: user.id, action: "2fa falhou", entity: "user", entityId: user.id, request });
      return reply.code(400).send({ message: "Codigo 2FA invalido." });
    }

    const codes = recoveryCodes();
    const hashes = await Promise.all(codes.map((code) => bcrypt.hash(code, 10)));
    const updated = await app.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(input.newPassword, 10),
        passwordChangedAt: new Date(),
        twoFactorEnabled: true,
        recoveryCodesHash: hashes.join(recoverySeparator),
        firstAccessRequired: false,
        initialAccessTokenHash: null,
        initialAccessTokenExpiresAt: null,
        initialAccessCompletedAt: new Date(),
        refreshTokenHash: null,
        failedLoginAttempts: 0,
        lockedUntil: null
      },
      include: { company: true }
    });

    await audit(app, { tenantId: updated.tenantId, userId: updated.id, action: "senha alterada", entity: "user", entityId: updated.id, request });
    await audit(app, { tenantId: updated.tenantId, userId: updated.id, action: "2fa configurado", entity: "user", entityId: updated.id, request });
    await audit(app, { tenantId: updated.tenantId, userId: updated.id, action: "primeiro acesso concluido", entity: "user", entityId: updated.id, request });

    return {
      ...(await issueSession(app, updated)),
      recoveryCodes: codes
    };
  });

  app.get("/auth/me", { preHandler: app.authenticate }, async (request, reply) => {
    const current = request.user as { sub: string };
    const user = await app.prisma.user.findUnique({ where: { id: current.sub }, include: { company: true } });
    if (!user || !user.active || user.firstAccessRequired) return reply.code(401).send({ message: "Sessao invalida.", firstAccessRequired: Boolean(user?.firstAccessRequired) });
    return publicUser(user);
  });

  app.post("/auth/refresh", async (request, reply) => {
    const input = refreshSchema.parse(request.body);
    const users = await app.prisma.user.findMany({ where: { active: true, firstAccessRequired: false }, include: { company: true } });
    const user = users.find((item) => item.refreshTokenHash && bcrypt.compareSync(input.refreshToken, item.refreshTokenHash));
    if (!user) return reply.code(401).send({ message: "Refresh token invalido." });
    return issueSession(app, user);
  });

  app.post("/auth/logout", { preHandler: app.authenticate }, async (request) => {
    const user = request.user as { sub: string; tenantId?: string };
    await app.prisma.user.update({ where: { id: user.sub }, data: { refreshTokenHash: null } }).catch(() => undefined);
    await audit(app, { tenantId: user.tenantId, userId: user.sub, action: "logout", entity: "user", entityId: user.sub, request });
    return { ok: true };
  });

  app.post("/auth/2fa/setup", { preHandler: app.authenticate }, async (request, reply) => {
    const current = request.user as { sub: string; tenantId?: string };
    const user = await app.prisma.user.findUniqueOrThrow({ where: { id: current.sub } });
    if (user.firstAccessRequired) return reply.code(403).send({ message: "Conclua o primeiro acesso antes de configurar 2FA por sessao normal." });
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
    if (user.firstAccessRequired) return reply.code(403).send({ message: "Conclua o primeiro acesso antes de ativar 2FA por sessao normal." });
    if (!user.twoFactorSecret || !verifyTotp(user.twoFactorSecret, input.code)) return reply.code(400).send({ message: "Codigo 2FA invalido." });
    const codes = recoveryCodes();
    const hashes = await Promise.all(codes.map((code) => bcrypt.hash(code, 10)));
    await app.prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true, recoveryCodesHash: hashes.join(recoverySeparator) } });
    await audit(app, { tenantId: current.tenantId, userId: current.sub, action: "2fa ativado", entity: "user", entityId: current.sub, request });
    return { recoveryCodes: codes };
  });

  app.post("/auth/2fa/disable", { preHandler: app.authenticate }, async (request) => {
    const current = request.user as { sub: string; tenantId?: string };
    await app.prisma.user.update({ where: { id: current.sub }, data: { twoFactorEnabled: false, twoFactorSecret: null, recoveryCodesHash: null, refreshTokenHash: null } });
    await audit(app, { tenantId: current.tenantId, userId: current.sub, action: "2fa desativado", entity: "user", entityId: current.sub, request });
    return { ok: true };
  });
};
