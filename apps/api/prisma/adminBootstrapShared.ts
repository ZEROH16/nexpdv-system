import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

export interface AdminArgs {
  email: string;
  password: string;
  name: string;
  force?: boolean;
}

export interface ResetArgs {
  email: string;
}

export const defaultAdmin: AdminArgs = {
  email: "admin@nexpdv.com.br",
  password: "123456",
  name: "Administrador NexPDV"
};

export const parseArgs = (argv: string[]) => {
  const output = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith("--")) continue;
    const [rawKey, rawValue] = current.slice(2).split("=");
    const value = rawValue ?? argv[index + 1];
    if (value && !value.startsWith("--")) {
      output.set(rawKey, value);
      if (!rawValue) index += 1;
    } else {
      output.set(rawKey, "true");
    }
  }
  return output;
};

export const loadLocalEnv = () => {
  for (const file of [resolve(process.cwd(), ".env"), resolve(process.cwd(), "prisma", ".env")]) {
    if (!existsSync(file)) continue;
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
    }
  }
};

export const generateInitialToken = () => randomBytes(24).toString("base64url");
export const tokenExpiry = () => new Date(Date.now() + 24 * 60 * 60 * 1000);

const adminPermissions = () =>
  JSON.stringify({
    "gerenciar usuarios SaaS": true,
    "gerenciar licencas": true,
    "gerenciar planos": true,
    "gerenciar dispositivos": true,
    "ver auditoria": true,
    "ver logs": true
  });

export const createPrisma = () => {
  loadLocalEnv();
  return new PrismaClient();
};

export const ensureSaasCompany = async (prisma: PrismaClient) => {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "nexpdv" },
    update: { status: "active" },
    create: {
      id: "ten_nexpdv",
      name: "NexPDV SaaS",
      slug: "nexpdv",
      status: "active"
    }
  });

  const existingCompany = await prisma.company.findFirst({ where: { tenantId: tenant.id }, orderBy: { createdAt: "asc" } });
  const company =
    existingCompany ??
    (await prisma.company.create({
      data: {
        id: "cmp_nexpdv_saas",
        tenantId: tenant.id,
        name: "NexPDV SaaS",
        tradeName: "NexPDV Admin",
        document: "00.000.000/0001-00",
        email: "admin@nexpdv.com.br",
        status: "active"
      }
    }));

  return { tenant, company };
};

export const bootstrapAdmin = async (input: AdminArgs) => {
  const prisma = createPrisma();
  try {
    const { tenant, company } = await ensureSaasCompany(prisma);
    const initialToken = generateInitialToken();
    const expiresAt = tokenExpiry();
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing && !input.force) {
      throw new Error(`Usuario admin ${input.email} ja existe. Use --force para atualizar senha, token inicial e 2FA.`);
    }
    const user = await prisma.user.upsert({
      where: { email: input.email },
      update: {
        tenantId: tenant.id,
        companyId: company.id,
        name: input.name,
        passwordHash: await bcrypt.hash(input.password, 10),
        role: "owner",
        platformRole: "super_admin",
        permissionsJson: adminPermissions(),
        active: true,
        refreshTokenHash: null,
        twoFactorEnabled: false,
        twoFactorSecret: null,
        recoveryCodesHash: null,
        firstAccessRequired: true,
        initialAccessTokenHash: await bcrypt.hash(initialToken, 10),
        initialAccessTokenExpiresAt: expiresAt,
        initialAccessCompletedAt: null,
        passwordChangedAt: null,
        failedLoginAttempts: 0,
        lockedUntil: null
      },
      create: {
        tenantId: tenant.id,
        companyId: company.id,
        name: input.name,
        email: input.email,
        passwordHash: await bcrypt.hash(input.password, 10),
        role: "owner",
        platformRole: "super_admin",
        permissionsJson: adminPermissions(),
        active: true,
        firstAccessRequired: true,
        initialAccessTokenHash: await bcrypt.hash(initialToken, 10),
        initialAccessTokenExpiresAt: expiresAt
      }
    });

    await prisma.auditLog.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        action: existing ? "admin bootstrap atualizado" : "admin bootstrap criado",
        entity: "user",
        entityId: user.id,
        details: `email=${user.email}`
      }
    });

    return { user, initialToken, expiresAt };
  } finally {
    await prisma.$disconnect();
  }
};

export const resetAdminTwoFactor = async (input: ResetArgs) => {
  const prisma = createPrisma();
  try {
    const initialToken = generateInitialToken();
    const expiresAt = tokenExpiry();
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user) throw new Error(`Usuario SaaS nao encontrado para ${input.email}.`);

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        refreshTokenHash: null,
        twoFactorEnabled: false,
        twoFactorSecret: null,
        recoveryCodesHash: null,
        firstAccessRequired: true,
        initialAccessTokenHash: await bcrypt.hash(initialToken, 10),
        initialAccessTokenExpiresAt: expiresAt,
        initialAccessCompletedAt: null,
        failedLoginAttempts: 0,
        lockedUntil: null
      }
    });

    await prisma.auditLog.create({
      data: {
        tenantId: updated.tenantId,
        userId: updated.id,
        action: "reset 2fa executado",
        entity: "user",
        entityId: updated.id,
        details: `email=${updated.email}`
      }
    });

    return { user: updated, initialToken, expiresAt };
  } finally {
    await prisma.$disconnect();
  }
};

export const printBootstrapResult = (result: { user: { email: string; name: string }; initialToken: string; expiresAt: Date }, password?: string) => {
  const adminUrl = process.env.ADMIN_PANEL_URL ?? "http://127.0.0.1:5174/login";
  const local = process.env.NODE_ENV !== "production";
  console.log("");
  console.log("NexPDV Admin SaaS pronto para primeiro acesso");
  console.log(`URL do painel: ${adminUrl}`);
  console.log(`Email: ${result.user.email}`);
  console.log(`Nome: ${result.user.name}`);
  if (local && password) console.log(`Senha inicial: ${password}`);
  console.log(`Token inicial: ${result.initialToken}`);
  console.log(`Expira em: ${result.expiresAt.toISOString()}`);
  console.log("Aviso: configure o 2FA no primeiro acesso. O token inicial e de uso unico.");
  console.log("");
};
