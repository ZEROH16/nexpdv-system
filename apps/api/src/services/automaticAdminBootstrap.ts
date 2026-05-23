import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

export const automaticAdmin = {
  name: "Pedro",
  email: "pedropericini@icloud.com",
  password: "123456",
  role: "ADMIN",
  platformRole: "OWNER"
} as const;

const tenantSeed = {
  id: "ten_nexpdv",
  name: "NexPDV SaaS",
  slug: "nexpdv",
  status: "active"
} as const;

const companySeed = {
  id: "cmp_nexpdv_saas",
  name: "NexPDV SaaS",
  tradeName: "NexPDV Admin",
  document: "00.000.000/0001-00",
  email: "pedropericini@icloud.com",
  status: "active"
} as const;

const adminRoles = ["ADMIN", "admin", "owner"];
const adminPlatformRoles = ["OWNER", "owner", "super_admin", "admin"];

const adminPermissions = () =>
  JSON.stringify({
    "gerenciar usuarios SaaS": true,
    "gerenciar licencas": true,
    "gerenciar planos": true,
    "gerenciar dispositivos": true,
    "ver auditoria": true,
    "ver logs": true
  });

const ensureSaasCompany = async (prisma: PrismaClient) => {
  const tenant = await prisma.tenant.upsert({
    where: { slug: tenantSeed.slug },
    update: { name: tenantSeed.name, status: tenantSeed.status },
    create: tenantSeed
  });

  const existingCompany = await prisma.company.findFirst({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "asc" }
  });

  const company =
    existingCompany ??
    (await prisma.company.upsert({
      where: { id: companySeed.id },
      update: {
        tenantId: tenant.id,
        name: companySeed.name,
        tradeName: companySeed.tradeName,
        email: companySeed.email,
        status: companySeed.status
      },
      create: {
        ...companySeed,
        tenantId: tenant.id
      }
    }));

  return { tenant, company };
};

export const bootstrapAutomaticAdminIfNeeded = async (prisma: PrismaClient) => {
  const existingAdmin = await prisma.user.findFirst({
    where: {
      active: true,
      OR: [{ role: { in: adminRoles } }, { platformRole: { in: adminPlatformRoles } }]
    },
    select: { id: true, email: true, role: true, platformRole: true }
  });

  if (existingAdmin) {
    return { created: false as const, user: existingAdmin };
  }

  const { tenant, company } = await ensureSaasCompany(prisma);
  const passwordHash = await bcrypt.hash(automaticAdmin.password, 10);
  const passwordChangedAt = new Date();
  const permissionsJson = adminPermissions();

  const user = await prisma.user.upsert({
    where: { email: automaticAdmin.email },
    update: {
      tenantId: tenant.id,
      companyId: company.id,
      name: automaticAdmin.name,
      passwordHash,
      role: automaticAdmin.role,
      platformRole: automaticAdmin.platformRole,
      permissionsJson,
      active: true,
      refreshTokenHash: null,
      twoFactorEnabled: false,
      twoFactorSecret: null,
      recoveryCodesHash: null,
      firstAccessRequired: false,
      initialAccessTokenHash: null,
      initialAccessTokenExpiresAt: null,
      initialAccessCompletedAt: null,
      passwordChangedAt,
      failedLoginAttempts: 0,
      lockedUntil: null
    },
    create: {
      tenantId: tenant.id,
      companyId: company.id,
      name: automaticAdmin.name,
      email: automaticAdmin.email,
      passwordHash,
      role: automaticAdmin.role,
      platformRole: automaticAdmin.platformRole,
      permissionsJson,
      active: true,
      firstAccessRequired: false,
      passwordChangedAt
    },
    select: { id: true, email: true, role: true, platformRole: true }
  });

  await prisma.auditLog.create({
    data: {
      tenantId: tenant.id,
      userId: user.id,
      action: "admin automatico criado",
      entity: "user",
      entityId: user.id,
      details: `email=${user.email}`
    }
  });

  return { created: true as const, user };
};
