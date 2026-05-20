import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { audit } from "../services/audit.js";

type FeatureMap = Record<"pix" | "fiscal" | "cloud" | "mobile" | "intelligence", boolean>;

const emptyFeatures = (): FeatureMap => ({ pix: false, fiscal: false, cloud: false, mobile: false, intelligence: false });
const parseFeatures = (value?: string | null): FeatureMap => {
  if (!value) return emptyFeatures();
  try {
    const parsed = JSON.parse(value) as Partial<FeatureMap>;
    return {
      pix: Boolean(parsed.pix),
      fiscal: Boolean(parsed.fiscal),
      cloud: Boolean(parsed.cloud),
      mobile: Boolean(parsed.mobile),
      intelligence: Boolean(parsed.intelligence)
    };
  } catch {
    return emptyFeatures();
  }
};
const featureString = (features: Partial<FeatureMap>) => JSON.stringify({ ...emptyFeatures(), ...features });
const licenseKey = (planCode: string) => `NEXPDV-${planCode}-${randomBytes(3).toString("hex").toUpperCase()}`;
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
const strongDeleteCompany = "EXCLUIR";
const strongDeleteLicense = "EXCLUIR";
const compareVersions = (left: string, right: string): number => {
  const a = left.split(".").map((item) => Number(item.replace(/\D/g, "")) || 0);
  const b = right.split(".").map((item) => Number(item.replace(/\D/g, "")) || 0);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
};

const userFromRequest = (request: FastifyRequest) => request.user as { sub?: string; role?: string; platformRole?: string; tenantId?: string };
const isSuperAdmin = (request: FastifyRequest) => userFromRequest(request).platformRole === "super_admin";
const forbiddenIfNotSuperAdmin = (request: FastifyRequest, reply: any) => {
  if (isSuperAdmin(request)) return false;
  reply.code(403).send({ code: "SUPER_ADMIN_REQUIRED", message: "Acao restrita ao super_admin.", details: "Inative ou bloqueie o registro em vez de excluir definitivamente." });
  return true;
};

const entityHasLinks = (reply: any, message: string, linkedEntities: Record<string, number>, details?: string, extra?: Record<string, unknown>) =>
  reply.code(409).send({
    code: "ENTITY_HAS_LINKS",
    message,
    details,
    linkedEntities,
    ...extra
  });

const backupLevel = (lastBackupAt?: Date | null) => {
  if (!lastBackupAt) return { level: "gray", label: "nunca fez backup", days: null as number | null };
  const days = Math.floor((Date.now() - lastBackupAt.getTime()) / 86_400_000);
  if (days <= 1) return { level: "green", label: "backup em dia", days };
  if (days <= 3) return { level: "amber", label: "backup atrasado", days };
  if (days <= 7) return { level: "orange", label: "backup critico", days };
  return { level: "red", label: "backup vencido", days };
};

const adminGuard = async (request: FastifyRequest, reply: any) => {
  const user = request.user as { sub?: string; role?: string; platformRole?: string };
  if (!["owner", "admin"].includes(user.role ?? "") && !["super_admin", "admin", "suporte", "financeiro", "comercial", "leitura", "support"].includes(user.platformRole ?? "")) {
    return reply.code(403).send({ message: "Acesso SaaS restrito." });
  }
  if (user.sub) {
    const current = await request.server.prisma.user.findUnique({ where: { id: user.sub }, select: { twoFactorEnabled: true, firstAccessRequired: true } });
    if (current?.firstAccessRequired) return reply.code(403).send({ message: "Conclua o primeiro acesso antes de acessar o painel admin.", firstAccessRequired: true });
    if (["super_admin", "admin"].includes(user.platformRole ?? "") && !current?.twoFactorEnabled) {
      return reply.code(403).send({ message: "Configure o 2FA antes de acessar o painel admin.", requiresTwoFactorSetup: true });
    }
  }
};

const companyInput = z.object({
  name: z.string().min(2),
  tradeName: z.string().optional(),
  document: z.string().min(4),
  stateRegistration: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  internalNotes: z.string().optional(),
  accountManager: z.string().optional(),
  backupStartedAt: z.string().optional(),
  lastBackupAt: z.string().optional(),
  lastSyncAt: z.string().optional(),
  backupStatus: z.string().optional(),
  syncStatus: z.string().optional(),
  cloudHealth: z.string().optional(),
  status: z.string().default("active")
});

const featureInput = z.object({ pix: z.boolean(), fiscal: z.boolean(), cloud: z.boolean(), mobile: z.boolean(), intelligence: z.boolean() });

const planInput = z.object({
  code: z.string().min(2).transform((value) => value.toUpperCase()),
  name: z.string().min(2),
  description: z.string().optional(),
  price: z.number().nonnegative(),
  maxStores: z.number().int().positive(),
  maxUsers: z.number().int().positive(),
  maxDevices: z.number().int().positive(),
  billingPeriod: z.enum(["monthly", "annual", "lifetime"]).default("monthly"),
  graceDays: z.number().int().min(0).default(7),
  active: z.boolean().default(true),
  features: featureInput,
  extraFeatures: z.record(z.boolean()).default({})
});

const userInput = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  password: z.string().min(6).optional(),
  platformRole: z.enum(["super_admin", "admin", "suporte", "financeiro", "comercial", "leitura"]),
  active: z.boolean().default(true),
  permissions: z.record(z.boolean()).default({})
});

const activationInput = z.object({
  ownerEmail: z.string().email(),
  licenseKey: z.string().min(6),
  companyName: z.string().min(2),
  device: z.object({
    deviceId: z.string().min(4),
    name: z.string().min(2),
    shortCode: z.string().optional(),
    hostName: z.string().optional(),
    os: z.string().optional(),
    fingerprint: z.string().min(4),
    appVersion: z.string().optional(),
    platform: z.string().default("desktop")
  })
});

export const saasRoutes = async (app: FastifyInstance) => {
  app.get("/updates/latest", async (request) => {
    const query = z
      .object({
        version: z.string().optional(),
        channel: z.enum(["stable", "beta", "dev"]).optional(),
        platform: z.string().optional()
      })
      .parse(request.query);
    const channel = query.channel ?? config.UPDATE_CHANNEL;
    const latestVersion = config.UPDATE_VERSION;
    const currentVersion = query.version ?? "0.0.0";
    const hasDownload = Boolean(config.UPDATE_DOWNLOAD_URL);
    const newer = compareVersions(latestVersion, currentVersion) > 0;
    return {
      product: "NexPDV Desktop",
      channel,
      platform: query.platform ?? "win32",
      currentVersion,
      latestVersion,
      available: hasDownload && newer,
      mandatory: config.UPDATE_MANDATORY,
      changelog: config.UPDATE_CHANGELOG,
      downloadUrl: config.UPDATE_DOWNLOAD_URL || null,
      publishedAt: new Date().toISOString()
    };
  });

  app.post("/activation/activate", async (request, reply) => {
    const input = activationInput.parse(request.body);
    const key = input.licenseKey.trim().toUpperCase();
    const ownerEmail = input.ownerEmail.trim().toLowerCase();
    const license = await app.prisma.license.findUnique({
      where: { key },
      include: { company: { include: { tenant: true } }, plan: true, devices: true }
    });
    if (!license) {
      await audit(app, { action: "ativacao online falhou", details: `chave inexistente: ${key}`, request });
      return reply.code(404).send({
        code: "LICENSE_NOT_FOUND",
        message: "Chave de ativacao inexistente. Confira a chave gerada no Painel Admin."
      });
    }
    if (license.company.email && license.company.email.trim().toLowerCase() !== ownerEmail) {
      await audit(app, { tenantId: license.company.tenantId, action: "ativacao online falhou", entity: "license", entityId: license.id, details: "email nao confere", request });
      return reply.code(403).send({
        code: "OWNER_EMAIL_MISMATCH",
        message: "Email informado nao confere com o email cadastrado na empresa da licenca.",
        details: "Use o email da empresa no Painel Admin ou atualize o cadastro antes de ativar."
      });
    }
    if (license.status !== "active") {
      await audit(app, { tenantId: license.company.tenantId, action: "ativacao online falhou", entity: "license", entityId: license.id, details: `status ${license.status}`, request });
      return reply.code(403).send({
        code: "LICENSE_STATUS_INVALID",
        message: license.status === "blocked" ? "Licenca bloqueada." : "Licenca inativa ou cancelada.",
        details: `Status atual: ${license.status}.`
      });
    }
    if (license.company.status !== "active") {
      await audit(app, { tenantId: license.company.tenantId, action: "ativacao online falhou", entity: "company", entityId: license.companyId, details: `empresa ${license.company.status}`, request });
      return reply.code(403).send({
        code: "COMPANY_BLOCKED",
        message: "Empresa bloqueada ou inativa no Painel Admin.",
        details: `Status atual: ${license.company.status}.`
      });
    }
    if (license.validUntil.getTime() <= Date.now()) {
      await audit(app, { tenantId: license.company.tenantId, action: "ativacao online falhou", entity: "license", entityId: license.id, details: "licenca expirada", request });
      return reply.code(403).send({
        code: "LICENSE_EXPIRED",
        message: "Licenca expirada.",
        details: `Validade: ${license.validUntil.toISOString()}.`
      });
    }

    const existingDevice = license.devices.find((device) => device.deviceId === input.device.deviceId);
    const activeDevices = license.devices.filter((device) => device.status === "active");
    if (!existingDevice && activeDevices.length >= license.maxDevices) {
      await audit(app, { tenantId: license.company.tenantId, action: "limite dispositivos excedido", entity: "license", entityId: license.id, request });
      return reply.code(403).send({
        code: "DEVICE_LIMIT_REACHED",
        message: "Limite de dispositivos atingido para esta licenca.",
        details: "Remova ou resete uma ativacao no Painel Admin antes de ativar outro PDV.",
        linkedEntities: {
          devices: activeDevices.length,
          maxDevices: license.maxDevices
        }
      });
    }

    const device = await app.prisma.device.upsert({
      where: { companyId_deviceId: { companyId: license.companyId, deviceId: input.device.deviceId } },
      update: {
        licenseId: license.id,
        name: input.device.name,
        shortCode: input.device.shortCode,
        hostName: input.device.hostName,
        os: input.device.os,
        fingerprint: input.device.fingerprint,
        appVersion: input.device.appVersion,
        platform: input.device.platform,
        status: "active",
        online: true,
        lastSeenAt: new Date()
      },
      create: {
        companyId: license.companyId,
        licenseId: license.id,
        deviceId: input.device.deviceId,
        name: input.device.name,
        shortCode: input.device.shortCode ?? `DEV-${randomBytes(3).toString("hex").toUpperCase()}`,
        hostName: input.device.hostName,
        os: input.device.os,
        fingerprint: input.device.fingerprint,
        appVersion: input.device.appVersion,
        platform: input.device.platform,
        status: "active",
        online: true,
        lastSeenAt: new Date()
      }
    });

    const now = new Date();
    const updatedLicense = await app.prisma.license.update({
      where: { id: license.id },
      data: {
        activatedAt: license.activatedAt ?? now,
        lastValidatedAt: now,
        lastSyncedAt: now,
        offlineGraceUntil: addDays(now, config.LICENSE_OFFLINE_GRACE_DAYS)
      },
      include: { plan: true, company: true }
    });
    await audit(app, { tenantId: license.company.tenantId, action: "licenca ativada online", entity: "device", entityId: device.id, details: key, request });

    return {
      ok: true,
      serverTime: now.toISOString(),
      company: {
        id: updatedLicense.company.id,
        name: updatedLicense.company.tradeName ?? updatedLicense.company.name,
        document: updatedLicense.company.document,
        ownerEmail: updatedLicense.company.email ?? ownerEmail
      },
      license: {
        id: updatedLicense.id,
        key: updatedLicense.key,
        plan: updatedLicense.planCode,
        status: updatedLicense.status,
        validUntil: updatedLicense.validUntil.toISOString(),
        offlineGraceUntil: updatedLicense.offlineGraceUntil?.toISOString(),
        demoMode: updatedLicense.demoMode,
        maxDevices: updatedLicense.maxDevices,
        features: parseFeatures(updatedLicense.featuresJson),
        activatedAt: updatedLicense.activatedAt?.toISOString(),
        lastValidatedAt: updatedLicense.lastValidatedAt?.toISOString(),
        validationMode: "online"
      },
      device: {
        id: device.id,
        deviceId: device.deviceId,
        status: device.status,
        lastSeenAt: device.lastSeenAt?.toISOString()
      }
    };
  });

  app.post("/activation/validate", async (request, reply) => {
    const input = z.object({ licenseKey: z.string(), deviceId: z.string() }).parse(request.body);
    const license = await app.prisma.license.findUnique({ where: { key: input.licenseKey.toUpperCase() }, include: { company: true, devices: true } });
    if (!license) return reply.code(404).send({ message: "Licenca nao encontrada." });
    const device = license.devices.find((item) => item.deviceId === input.deviceId && item.status === "active");
    if (!device) return reply.code(403).send({ message: "Dispositivo nao autorizado." });
    await app.prisma.device.update({ where: { id: device.id }, data: { online: true, lastSeenAt: new Date() } });
    await app.prisma.license.update({ where: { id: license.id }, data: { lastValidatedAt: new Date(), offlineGraceUntil: addDays(new Date(), config.LICENSE_OFFLINE_GRACE_DAYS) } });
    return { valid: license.status === "active" && license.validUntil.getTime() > Date.now(), status: license.status, features: parseFeatures(license.featuresJson) };
  });

  app.post("/devices/heartbeat", async (request, reply) => {
    const input = z.object({ licenseKey: z.string(), deviceId: z.string(), appVersion: z.string().optional() }).parse(request.body);
    const license = await app.prisma.license.findUnique({ where: { key: input.licenseKey.toUpperCase() } });
    if (!license) return reply.code(404).send({ message: "Licenca nao encontrada." });
    const device = await app.prisma.device.findUnique({ where: { companyId_deviceId: { companyId: license.companyId, deviceId: input.deviceId } } });
    if (!device) return reply.code(404).send({ message: "Dispositivo nao encontrado." });
    await app.prisma.device.update({ where: { id: device.id }, data: { online: true, appVersion: input.appVersion, lastSeenAt: new Date() } });
    return { ok: true, serverTime: new Date().toISOString() };
  });

  await app.register(async (adminApp) => {
    adminApp.addHook("preHandler", app.authenticate);
    adminApp.addHook("preHandler", adminGuard);

    adminApp.get("/admin/dashboard", async () => {
      const now = new Date();
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      const soon = addDays(now, 30);
      const [
        totalCompanies,
        activeCompanies,
        blockedCompanies,
        licensesActive,
        licensesExpiring,
        licensesExpired,
        devicesOnline,
        totalDevices,
        salesSyncedToday,
        revenueToday,
        syncPending,
        recentErrors,
        recentDevices,
        moduleLicenses
      ] = await Promise.all([
        app.prisma.company.count(),
        app.prisma.company.count({ where: { status: "active" } }),
        app.prisma.company.count({ where: { status: { in: ["blocked", "inactive"] } } }),
        app.prisma.license.count({ where: { status: "active", validUntil: { gt: now } } }),
        app.prisma.license.count({ where: { status: "active", validUntil: { gt: now, lte: soon } } }),
        app.prisma.license.count({ where: { OR: [{ status: "expired" }, { validUntil: { lte: now } }] } }),
        app.prisma.device.count({ where: { status: "active", online: true } }),
        app.prisma.device.count({ where: { status: "active" } }),
        app.prisma.sale.count({ where: { syncStatus: "synced", createdAt: { gte: today } } }),
        app.prisma.sale.aggregate({ _sum: { total: true }, where: { syncStatus: "synced", createdAt: { gte: today } } }),
        app.prisma.syncJob.count({ where: { status: { in: ["pending", "failed"] } } }),
        app.prisma.syncJob.findMany({ where: { status: "failed" }, include: { company: true, device: true }, orderBy: { updatedAt: "desc" }, take: 6 }),
        app.prisma.device.findMany({ include: { company: true, license: true }, orderBy: { lastSeenAt: "desc" }, take: 8 }),
        app.prisma.license.findMany({ select: { featuresJson: true }, where: { status: "active" } })
      ]);
      const modules = moduleLicenses.reduce<Record<string, number>>((acc, license) => {
        const parsed = parseFeatures(license.featuresJson);
        for (const [key, enabled] of Object.entries(parsed)) if (enabled) acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {});
      return {
        totalCompanies,
        activeCompanies,
        blockedCompanies,
        licensesActive,
        licensesExpiring,
        licensesExpired,
        devicesOnline,
        devicesOffline: Math.max(totalDevices - devicesOnline, 0),
        salesSyncedToday,
        revenueSyncedToday: revenueToday._sum.total ?? 0,
        syncPending,
        modules,
        recentErrors,
        recentDevices,
        cloudStatus: "operational"
      };
    });

    adminApp.get("/companies", async (request) => {
    const query = z.object({ search: z.string().optional() }).parse(request.query);
    return app.prisma.company.findMany({
      where: query.search
        ? { OR: [{ name: { contains: query.search } }, { tradeName: { contains: query.search } }, { document: { contains: query.search } }] }
        : undefined,
      include: { licenses: true, subscriptions: { include: { plan: true } }, devices: true, _count: { select: { users: true, sales: true, products: true, customers: true, cashRegisters: true, settings: true, syncJobs: true, deviceTokens: true, subscriptions: true } } },
      orderBy: { createdAt: "desc" },
      take: 200
    });
  });

    adminApp.post("/companies", async (request) => {
    const input = companyInput.parse(request.body);
    const tenant = await app.prisma.tenant.findFirst({ where: { slug: "nexpdv" } });
    const company = await app.prisma.company.create({ data: { ...input, tenantId: tenant?.id } });
    await audit(app, { tenantId: tenant?.id, userId: (request.user as any).sub, action: "empresa criada", entity: "company", entityId: company.id, request });
    return company;
  });

    adminApp.patch("/companies/:id", async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const input = companyInput.partial().parse(request.body);
    const company = await app.prisma.company.update({ where: { id: params.id }, data: input });
    await audit(app, { tenantId: company.tenantId, userId: (request.user as any).sub, action: "empresa alterada", entity: "company", entityId: company.id, request });
    return company;
  });

    adminApp.get("/companies/:id", async (request, reply) => {
      const params = z.object({ id: z.string() }).parse(request.params);
      const company = await app.prisma.company.findUnique({
        where: { id: params.id },
        include: {
          licenses: { include: { plan: true, devices: true } },
          subscriptions: { include: { plan: true } },
          devices: true,
          syncJobs: { orderBy: { createdAt: "desc" }, take: 10 },
          _count: { select: { users: true, sales: true, products: true, customers: true } }
        }
      });
      if (!company) return reply.code(404).send({ message: "Empresa nao encontrada." });
      const revenue = await app.prisma.sale.aggregate({ _sum: { total: true }, where: { companyId: company.id, syncStatus: "synced" } });
      const logs = await app.prisma.auditLog.findMany({ where: { entityId: company.id }, orderBy: { createdAt: "desc" }, take: 20 });
      return { ...company, metrics: { revenueSynced: revenue._sum.total ?? 0 }, logs };
    });

    const setCompanyStatus = async (request: FastifyRequest) => {
      const params = z.object({ id: z.string() }).parse(request.params);
      const body = z.object({ status: z.enum(["active", "inactive", "blocked"]) }).parse(request.body);
      const company = await app.prisma.company.update({ where: { id: params.id }, data: { status: body.status } });
      await audit(app, { tenantId: company.tenantId, userId: (request.user as any).sub, action: `empresa ${body.status}`, entity: "company", entityId: company.id, request });
      return company;
    };

    adminApp.post("/companies/:id/status", setCompanyStatus);
    adminApp.patch("/companies/:id/status", setCompanyStatus);

    adminApp.delete("/companies/:id", async (request, reply) => {
      const params = z.object({ id: z.string() }).parse(request.params);
      const body = z.object({ force: z.boolean().default(false), confirmation: z.string().optional() }).parse(request.body ?? {});
      const relations = await app.prisma.company.findUnique({
        where: { id: params.id },
        include: { _count: { select: { licenses: true, devices: true, sales: true, syncJobs: true, users: true, products: true, customers: true, cashRegisters: true, settings: true, subscriptions: true, deviceTokens: true } } }
      });
      if (!relations) return reply.code(404).send({ message: "Empresa nao encontrada." });

      const companyUsers = await app.prisma.user.findMany({ where: { companyId: params.id }, select: { id: true } });
      const companyUserIds = companyUsers.map((user) => user.id);
      const [syncLogs, auditLogs] = await Promise.all([
        app.prisma.syncLog.count({ where: { companyId: params.id } }),
        app.prisma.auditLog.count({ where: { OR: [{ entity: "company", entityId: params.id }, { userId: { in: companyUserIds } }] } })
      ]);
      const linkedEntities = {
        licenses: relations._count.licenses,
        devices: relations._count.devices,
        syncJobs: relations._count.syncJobs,
        logs: syncLogs,
        auditLogs,
        sales: relations._count.sales,
        users: relations._count.users,
        products: relations._count.products,
        customers: relations._count.customers,
        cashRegisters: relations._count.cashRegisters,
        settings: relations._count.settings,
        subscriptions: relations._count.subscriptions,
        deviceTokens: relations._count.deviceTokens
      };
      const linked = Object.values(linkedEntities).some((count) => count > 0);

      if (forbiddenIfNotSuperAdmin(request, reply)) return reply;
      if (!body.force || body.confirmation !== strongDeleteCompany) {
        if (linked) {
          return entityHasLinks(
            reply,
            "Empresa possui licencas, dispositivos, vendas, sync ou outros vinculos. Confirme a exclusao definitiva em cascata como super_admin.",
            linkedEntities,
            `Digite ${strongDeleteCompany} para remover definitivamente a empresa e todos os vinculos.`,
            { canForce: true, confirmation: strongDeleteCompany }
          );
        }
        return reply.code(400).send({
          code: "CONFIRMATION_REQUIRED",
          message: "Exclusao definitiva de empresa exige confirmacao forte.",
          details: `Digite ${strongDeleteCompany} para excluir definitivamente.`,
          confirmation: strongDeleteCompany
        });
      }

      const actorId = userFromRequest(request).sub;
      const auditUserId = actorId && companyUserIds.includes(actorId) ? undefined : actorId;
      await app.prisma.$transaction([
        app.prisma.payment.deleteMany({ where: { sale: { companyId: params.id } } }),
        app.prisma.saleItem.deleteMany({ where: { sale: { companyId: params.id } } }),
        app.prisma.sale.deleteMany({ where: { companyId: params.id } }),
        app.prisma.cashMovement.deleteMany({ where: { cashRegister: { companyId: params.id } } }),
        app.prisma.cashRegister.deleteMany({ where: { companyId: params.id } }),
        app.prisma.product.deleteMany({ where: { companyId: params.id } }),
        app.prisma.category.deleteMany({ where: { companyId: params.id } }),
        app.prisma.customer.deleteMany({ where: { companyId: params.id } }),
        app.prisma.setting.deleteMany({ where: { companyId: params.id } }),
        app.prisma.deviceToken.deleteMany({ where: { companyId: params.id } }),
        app.prisma.syncJob.deleteMany({ where: { companyId: params.id } }),
        app.prisma.syncLog.deleteMany({ where: { companyId: params.id } }),
        app.prisma.device.deleteMany({ where: { companyId: params.id } }),
        app.prisma.subscription.deleteMany({ where: { companyId: params.id } }),
        app.prisma.license.deleteMany({ where: { companyId: params.id } }),
        app.prisma.auditLog.deleteMany({ where: { OR: [{ entity: "company", entityId: params.id }, { userId: { in: companyUserIds } }] } }),
        app.prisma.user.deleteMany({ where: { companyId: params.id } }),
        app.prisma.company.delete({ where: { id: params.id } })
      ]);
      await audit(app, { tenantId: relations.tenantId, userId: auditUserId, action: "empresa excluida definitivamente", entity: "company", entityId: params.id, details: JSON.stringify(linkedEntities), request });
      return { ok: true, hardDeleted: true, linkedEntities };
    });

    adminApp.get("/plans", async () => app.prisma.plan.findMany({ orderBy: { price: "asc" } }));

    adminApp.post("/plans", async (request) => {
    const input = planInput.parse(request.body);
    const { features, extraFeatures, ...planData } = input;
    const plan = await app.prisma.plan.upsert({
      where: { code: input.code },
      update: { ...planData, featuresJson: featureString(features), extraFeaturesJson: JSON.stringify(extraFeatures) },
      create: { ...planData, featuresJson: featureString(features), extraFeaturesJson: JSON.stringify(extraFeatures) }
    });
    await audit(app, { userId: (request.user as any).sub, action: "plano salvo", entity: "plan", entityId: plan.id, request });
    return plan;
  });

    adminApp.patch("/plans/:id", async (request) => {
      const params = z.object({ id: z.string() }).parse(request.params);
      const input = planInput.partial().parse(request.body);
      const { features, extraFeatures, ...planData } = input;
      const plan = await app.prisma.plan.update({
        where: { id: params.id },
        data: {
          ...planData,
          featuresJson: features ? featureString(features) : undefined,
          extraFeaturesJson: extraFeatures ? JSON.stringify(extraFeatures) : undefined
        }
      });
      await audit(app, { userId: (request.user as any).sub, action: "plano alterado", entity: "plan", entityId: plan.id, request });
      return plan;
    });

    adminApp.post("/plans/:id/duplicate", async (request) => {
      const params = z.object({ id: z.string() }).parse(request.params);
      const source = await app.prisma.plan.findUniqueOrThrow({ where: { id: params.id } });
      const plan = await app.prisma.plan.create({
        data: {
          tenantId: source.tenantId,
          code: `${source.code}_COPY_${randomBytes(2).toString("hex").toUpperCase()}`,
          name: `${source.name} Copia`,
          description: source.description,
          price: source.price,
          maxStores: source.maxStores,
          maxUsers: source.maxUsers,
          maxDevices: source.maxDevices,
          billingPeriod: source.billingPeriod,
          graceDays: source.graceDays,
          featuresJson: source.featuresJson,
          extraFeaturesJson: source.extraFeaturesJson,
          active: false
        }
      });
      await audit(app, { userId: (request.user as any).sub, action: "plano duplicado", entity: "plan", entityId: plan.id, request });
      return plan;
    });

    const setPlanStatus = async (request: FastifyRequest) => {
      const params = z.object({ id: z.string() }).parse(request.params);
      const body = z.object({ active: z.boolean() }).parse(request.body);
      const plan = await app.prisma.plan.update({ where: { id: params.id }, data: { active: body.active } });
      await audit(app, { userId: (request.user as any).sub, action: body.active ? "plano ativado" : "plano inativado", entity: "plan", entityId: plan.id, request });
      return plan;
    };

    adminApp.post("/plans/:id/status", setPlanStatus);
    adminApp.patch("/plans/:id/status", setPlanStatus);

    adminApp.delete("/plans/:id", async (request, reply) => {
      const params = z.object({ id: z.string() }).parse(request.params);
      const plan = await app.prisma.plan.findUnique({ where: { id: params.id }, include: { _count: { select: { licenses: true, subscriptions: true } } } });
      if (!plan) return reply.code(404).send({ message: "Plano nao encontrado." });
      if (plan._count.licenses || plan._count.subscriptions) {
        return entityHasLinks(
          reply,
          "Este plano esta vinculado a licencas/empresas. Inative o plano ou migre as licencas antes de excluir.",
          { licenses: plan._count.licenses, subscriptions: plan._count.subscriptions },
          "Planos em uso nao sao excluidos automaticamente para evitar alterar contratos ativos."
        );
      }
      await app.prisma.plan.delete({ where: { id: params.id } });
      await audit(app, { userId: (request.user as any).sub, action: "plano excluido", entity: "plan", entityId: params.id, details: plan.code, request });
      return { ok: true };
    });

    adminApp.get("/licenses", async () =>
    app.prisma.license.findMany({ include: { company: true, plan: true, devices: true }, orderBy: { updatedAt: "desc" }, take: 200 })
  );

    adminApp.post("/licenses/generate", async (request) => {
    const input = z.object({ companyId: z.string(), planCode: z.string(), validUntil: z.string().optional() }).parse(request.body);
    const plan = await app.prisma.plan.findUniqueOrThrow({ where: { code: input.planCode.toUpperCase() } });
    const validUntil = input.validUntil ? new Date(input.validUntil) : addDays(new Date(), 365);
    const license = await app.prisma.license.create({
      data: {
        companyId: input.companyId,
        planId: plan.id,
        key: licenseKey(plan.code),
        planCode: plan.code,
        status: "active",
        validUntil,
        offlineGraceUntil: addDays(validUntil, plan.graceDays ?? config.LICENSE_OFFLINE_GRACE_DAYS),
        demoMode: false,
        featuresJson: plan.featuresJson,
        maxDevices: plan.maxDevices
      },
      include: { company: true, plan: true }
    });
    await audit(app, { userId: (request.user as any).sub, action: "licenca gerada", entity: "license", entityId: license.id, details: license.key, request });
    return license;
  });

    adminApp.patch("/licenses/:id", async (request) => {
      const params = z.object({ id: z.string() }).parse(request.params);
      const body = z.object({
        status: z.enum(["active", "blocked", "cancelled", "expired", "trial"]).optional(),
        validUntil: z.string().optional(),
        maxDevices: z.number().int().positive().optional(),
        internalNotes: z.string().optional(),
        features: featureInput.optional()
      }).parse(request.body);
      const license = await app.prisma.license.update({
        where: { id: params.id },
        data: {
          status: body.status,
          validUntil: body.validUntil ? new Date(body.validUntil) : undefined,
          maxDevices: body.maxDevices,
          internalNotes: body.internalNotes,
          featuresJson: body.features ? featureString(body.features) : undefined
        },
        include: { company: true, plan: true, devices: true }
      });
      await audit(app, { userId: (request.user as any).sub, action: "licenca alterada", entity: "license", entityId: license.id, request });
      return license;
    });

    adminApp.patch("/licenses/:id/status", async (request) => {
      const params = z.object({ id: z.string() }).parse(request.params);
      const body = z.object({ status: z.enum(["active", "blocked", "cancelled", "expired", "trial"]), reason: z.string().optional() }).parse(request.body);
      const license = await app.prisma.license.update({
        where: { id: params.id },
        data: { status: body.status, blockedReason: body.status === "blocked" ? body.reason ?? "Bloqueio manual" : null },
        include: { company: true, plan: true, devices: true }
      });
      await audit(app, { userId: (request.user as any).sub, action: `licenca ${body.status}`, entity: "license", entityId: license.id, details: body.reason, request });
      return license;
    });

    adminApp.delete("/licenses/:id", async (request, reply) => {
      const params = z.object({ id: z.string() }).parse(request.params);
      const body = z.object({ force: z.boolean().default(false), confirmation: z.string().optional() }).parse(request.body ?? {});
      const license = await app.prisma.license.findUnique({ where: { id: params.id }, include: { devices: true } });
      if (!license) return reply.code(404).send({ message: "Licenca nao encontrada." });

      if (forbiddenIfNotSuperAdmin(request, reply)) return reply;
      if (!body.force || body.confirmation !== strongDeleteLicense) {
        if (license.devices.length) {
          return entityHasLinks(
            reply,
            "Licenca possui dispositivos vinculados. Confirme a exclusao definitiva para desvincular e inativar os dispositivos automaticamente.",
            { devices: license.devices.length },
            `Digite ${strongDeleteLicense} para excluir a licenca definitivamente.`,
            { canForce: true, confirmation: strongDeleteLicense }
          );
        }
        return reply.code(400).send({
          code: "CONFIRMATION_REQUIRED",
          message: "Exclusao definitiva de licenca exige confirmacao forte.",
          details: `Digite ${strongDeleteLicense} para excluir definitivamente.`,
          confirmation: strongDeleteLicense
        });
      }
      await app.prisma.$transaction([
        app.prisma.device.updateMany({ where: { licenseId: params.id }, data: { licenseId: null, status: "inactive", online: false, deactivatedAt: new Date() } }),
        app.prisma.license.delete({ where: { id: params.id } })
      ]);
      await audit(app, { userId: (request.user as any).sub, action: "licenca excluida", entity: "license", entityId: params.id, details: license.key, request });
      return { ok: true, detachedDevices: license.devices.length };
    });

    adminApp.post("/licenses/:id/block", async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ reason: z.string().optional() }).parse(request.body ?? {});
    const license = await app.prisma.license.update({ where: { id: params.id }, data: { status: "blocked", blockedReason: body.reason ?? "Bloqueio manual" } });
    await audit(app, { userId: (request.user as any).sub, action: "licenca bloqueada", entity: "license", entityId: license.id, request });
    return license;
  });

    adminApp.post("/licenses/:id/unblock", async (request) => {
      const params = z.object({ id: z.string() }).parse(request.params);
      const license = await app.prisma.license.update({ where: { id: params.id }, data: { status: "active", blockedReason: null } });
      await audit(app, { userId: (request.user as any).sub, action: "licenca desbloqueada", entity: "license", entityId: license.id, request });
      return license;
    });

    adminApp.post("/licenses/:id/cancel", async (request) => {
      const params = z.object({ id: z.string() }).parse(request.params);
      const license = await app.prisma.license.update({ where: { id: params.id }, data: { status: "cancelled", blockedReason: "Cancelamento via painel" } });
      await audit(app, { userId: (request.user as any).sub, action: "licenca cancelada", entity: "license", entityId: license.id, request });
      return license;
    });

    adminApp.post("/licenses/:id/renew", async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ validUntil: z.string() }).parse(request.body);
    const license = await app.prisma.license.update({ where: { id: params.id }, data: { status: "active", validUntil: new Date(body.validUntil), blockedReason: null } });
    await audit(app, { userId: (request.user as any).sub, action: "licenca renovada", entity: "license", entityId: license.id, request });
    return license;
  });

    adminApp.post("/licenses/:id/plan", async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ planCode: z.string() }).parse(request.body);
    const plan = await app.prisma.plan.findUniqueOrThrow({ where: { code: body.planCode.toUpperCase() } });
    const license = await app.prisma.license.update({
      where: { id: params.id },
      data: { planId: plan.id, planCode: plan.code, featuresJson: plan.featuresJson, maxDevices: plan.maxDevices, status: "active" }
    });
    await audit(app, { userId: (request.user as any).sub, action: "plano da licenca alterado", entity: "license", entityId: license.id, details: plan.code, request });
    return license;
  });

    adminApp.post("/licenses/:id/modules", async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ features: z.object({ pix: z.boolean(), fiscal: z.boolean(), cloud: z.boolean(), mobile: z.boolean(), intelligence: z.boolean() }) }).parse(request.body);
    const license = await app.prisma.license.update({ where: { id: params.id }, data: { featuresJson: featureString(body.features) } });
    await audit(app, { userId: (request.user as any).sub, action: "modulos da licenca alterados", entity: "license", entityId: license.id, request });
    return license;
  });

    adminApp.post("/licenses/:id/reset-activation", async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    await app.prisma.device.updateMany({ where: { licenseId: params.id }, data: { status: "inactive", online: false, deactivatedAt: new Date() } });
    await audit(app, { userId: (request.user as any).sub, action: "ativacoes resetadas", entity: "license", entityId: params.id, request });
    return { ok: true };
  });

    adminApp.get("/licenses/:id/history", async (request) => {
      const params = z.object({ id: z.string() }).parse(request.params);
      return app.prisma.auditLog.findMany({ where: { entity: "license", entityId: params.id }, orderBy: { createdAt: "desc" }, take: 50 });
    });

    adminApp.get("/devices", async () =>
    app.prisma.device.findMany({ include: { company: true, license: true }, orderBy: { updatedAt: "desc" }, take: 250 })
  );

    adminApp.post("/devices/:id/deactivate", async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const device = await app.prisma.device.update({ where: { id: params.id }, data: { status: "inactive", online: false, deactivatedAt: new Date() } });
    await audit(app, { userId: (request.user as any).sub, action: "dispositivo desativado", entity: "device", entityId: device.id, request });
    return device;
  });

    adminApp.patch("/devices/:id", async (request) => {
      const params = z.object({ id: z.string() }).parse(request.params);
      const body = z.object({ name: z.string().min(2).optional(), shortCode: z.string().optional(), status: z.enum(["active", "inactive", "blocked"]).optional() }).parse(request.body);
      const device = await app.prisma.device.update({ where: { id: params.id }, data: body });
      await audit(app, { userId: (request.user as any).sub, action: "dispositivo alterado", entity: "device", entityId: device.id, request });
      return device;
    });

    adminApp.patch("/devices/:id/status", async (request) => {
      const params = z.object({ id: z.string() }).parse(request.params);
      const body = z.object({ status: z.enum(["active", "inactive", "blocked"]) }).parse(request.body);
      const device = await app.prisma.device.update({
        where: { id: params.id },
        data: { status: body.status, online: body.status === "active" ? undefined : false, deactivatedAt: body.status === "active" ? null : new Date() }
      });
      await audit(app, { userId: (request.user as any).sub, action: `dispositivo ${body.status}`, entity: "device", entityId: device.id, request });
      return device;
    });

    adminApp.post("/devices/:id/block", async (request) => {
      const params = z.object({ id: z.string() }).parse(request.params);
      const device = await app.prisma.device.update({ where: { id: params.id }, data: { status: "blocked", online: false } });
      await audit(app, { userId: (request.user as any).sub, action: "dispositivo bloqueado", entity: "device", entityId: device.id, request });
      return device;
    });

    adminApp.delete("/devices/:id", async (request) => {
      const params = z.object({ id: z.string() }).parse(request.params);
      await app.prisma.device.delete({ where: { id: params.id } });
      await audit(app, { userId: (request.user as any).sub, action: "dispositivo removido", entity: "device", entityId: params.id, request });
      return { ok: true };
    });

    adminApp.get("/sync/jobs", async () =>
    app.prisma.syncJob.findMany({ include: { company: true, device: true }, orderBy: { createdAt: "desc" }, take: 250 })
  );

    adminApp.get("/cloud/health", async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const companies = await app.prisma.company.findMany({
        include: {
          licenses: { include: { plan: true, devices: true }, orderBy: { updatedAt: "desc" } },
          devices: true,
          syncJobs: { orderBy: { updatedAt: "desc" }, take: 5 }
        },
        orderBy: { updatedAt: "desc" },
        take: 250
      });
      const rows = companies.map((company) => {
        const activeLicense = company.licenses.find((license) => license.status === "active") ?? company.licenses[0];
        const lastDeviceSeenAt = company.devices.reduce<Date | null>((latest, device) => {
          if (!device.lastSeenAt) return latest;
          return !latest || device.lastSeenAt > latest ? device.lastSeenAt : latest;
        }, null);
        const lastJob = company.syncJobs[0];
        const lastSyncAt = company.lastSyncAt ?? lastJob?.processedAt ?? lastJob?.updatedAt ?? lastDeviceSeenAt;
        const lastBackupAt = company.lastBackupAt;
        const backup = backupLevel(lastBackupAt);
        const onlineDevices = company.devices.filter((device) => device.online && device.status === "active").length;
        const failedJobs = company.syncJobs.filter((job) => job.status === "failed" || job.conflict).length;
        const cloudStatus = company.cloudHealth !== "unknown" ? company.cloudHealth : failedJobs ? "erro" : onlineDevices ? "online" : "sem_conexao";
        return {
          id: company.id,
          name: company.tradeName ?? company.name,
          document: company.document,
          status: company.status,
          plan: activeLicense?.plan?.name ?? activeLicense?.planCode ?? "-",
          licenseStatus: activeLicense?.status ?? "sem licenca",
          licenseValidUntil: activeLicense?.validUntil,
          devicesOnline: onlineDevices,
          devicesTotal: company.devices.length,
          lastBackupAt,
          backupStartedAt: company.backupStartedAt,
          backupStatus: company.backupStatus,
          lastSyncAt,
          syncStatus: company.syncStatus !== "unknown" ? company.syncStatus : lastJob?.status ?? "sem sync",
          backupAgeDays: backup.days,
          backupLevel: backup.level,
          backupLabel: backup.label,
          cloudStatus,
          cloudNotifiedAt: company.cloudNotifiedAt,
          recentErrors: failedJobs
        };
      });
      const metrics = {
        activeCompanies: companies.filter((company) => company.status === "active").length,
        onlineCompanies: rows.filter((row) => row.devicesOnline > 0).length,
        companiesWithoutConnection: rows.filter((row) => row.devicesOnline === 0).length,
        backupsToday: rows.filter((row) => row.lastBackupAt && new Date(row.lastBackupAt).getTime() >= today.getTime()).length,
        backupsLate: rows.filter((row) => ["amber", "orange", "red", "gray"].includes(row.backupLevel)).length,
        activeLicenses: companies.flatMap((company) => company.licenses).filter((license) => license.status === "active").length,
        inactiveLicenses: companies.flatMap((company) => company.licenses).filter((license) => license.status !== "active").length,
        syncPending: await app.prisma.syncJob.count({ where: { status: { in: ["pending", "failed"] } } }),
        recentErrors: await app.prisma.syncJob.count({ where: { status: "failed" } })
      };
      return { metrics, companies: rows };
    });

    adminApp.get("/cloud/backups", async () => {
      const companies = await app.prisma.company.findMany({ include: { devices: true }, orderBy: { updatedAt: "desc" }, take: 250 });
      return companies.map((company) => {
        const backup = backupLevel(company.lastBackupAt);
        return {
          id: company.id,
          name: company.tradeName ?? company.name,
          lastBackupAt: company.lastBackupAt,
          backupStartedAt: company.backupStartedAt,
          backupStatus: company.backupStatus,
          backupAgeDays: backup.days,
          backupLevel: backup.level,
          backupLabel: backup.label,
          devicesOnline: company.devices.filter((device) => device.online && device.status === "active").length
        };
      });
    });

    adminApp.patch("/cloud/company/:id/notified", async (request) => {
      const params = z.object({ id: z.string() }).parse(request.params);
      const company = await app.prisma.company.update({ where: { id: params.id }, data: { cloudNotifiedAt: new Date() } });
      await audit(app, { tenantId: company.tenantId, userId: (request.user as any).sub, action: "cliente cloud avisado", entity: "company", entityId: company.id, request });
      return { ok: true, cloudNotifiedAt: company.cloudNotifiedAt };
    });

    adminApp.get("/audit", async () => app.prisma.auditLog.findMany({ include: { user: true }, orderBy: { createdAt: "desc" }, take: 250 }));

    adminApp.get("/admin/companies", async () =>
    app.prisma.company.findMany({
      include: {
        licenses: true,
        subscriptions: { include: { plan: true } },
        devices: true,
        _count: { select: { users: true, products: true, sales: true } }
      },
      orderBy: { createdAt: "desc" }
    })
  );

    adminApp.get("/admin/plans", async () => app.prisma.plan.findMany({ orderBy: { price: "asc" } }));
    adminApp.get("/admin/subscriptions", async () => app.prisma.subscription.findMany({ include: { company: true, plan: true }, orderBy: { createdAt: "desc" } }));
    adminApp.get("/admin/users", async () =>
    app.prisma.user.findMany({
      select: { id: true, tenantId: true, companyId: true, name: true, email: true, phone: true, role: true, platformRole: true, permissionsJson: true, active: true, twoFactorEnabled: true, firstAccessRequired: true, lastLoginAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 250
    })
  );
    adminApp.post("/admin/users", async (request) => {
      const input = userInput.parse(request.body);
      const tenant = await app.prisma.tenant.findFirst({ where: { slug: "nexpdv" } });
      const company = await app.prisma.company.findFirstOrThrow({ where: { tenantId: tenant?.id } });
      const user = await app.prisma.user.create({
        data: {
          tenantId: tenant?.id,
          companyId: company.id,
          name: input.name,
          email: input.email,
          phone: input.phone,
          role: input.platformRole === "super_admin" || input.platformRole === "admin" ? "admin" : "manager",
          platformRole: input.platformRole,
          permissionsJson: JSON.stringify(input.permissions),
          active: input.active,
          passwordHash: await bcrypt.hash(input.password ?? randomBytes(8).toString("base64url"), 10)
        },
        select: { id: true, name: true, email: true, platformRole: true, active: true }
      });
      await audit(app, { tenantId: tenant?.id, userId: (request.user as any).sub, action: "usuario saas criado", entity: "user", entityId: user.id, request });
      return user;
    });
    adminApp.patch("/admin/users/:id", async (request) => {
      const params = z.object({ id: z.string() }).parse(request.params);
      const input = userInput.partial().parse(request.body);
      const user = await app.prisma.user.update({
        where: { id: params.id },
        data: {
          name: input.name,
          email: input.email,
          phone: input.phone,
          platformRole: input.platformRole,
          role: input.platformRole === "super_admin" || input.platformRole === "admin" ? "admin" : input.platformRole ? "manager" : undefined,
          permissionsJson: input.permissions ? JSON.stringify(input.permissions) : undefined,
          active: input.active,
          passwordHash: input.password ? await bcrypt.hash(input.password, 10) : undefined,
          refreshTokenHash: input.password || input.active === false ? null : undefined
        },
        select: { id: true, name: true, email: true, platformRole: true, active: true, twoFactorEnabled: true, permissionsJson: true }
      });
      await audit(app, { userId: (request.user as any).sub, action: "usuario saas alterado", entity: "user", entityId: user.id, request });
      return user;
    });

    adminApp.patch("/admin/users/:id/permissions", async (request) => {
      const params = z.object({ id: z.string() }).parse(request.params);
      const body = z.object({ permissions: z.record(z.boolean()) }).parse(request.body);
      const user = await app.prisma.user.update({ where: { id: params.id }, data: { permissionsJson: JSON.stringify(body.permissions), refreshTokenHash: null } });
      await audit(app, { userId: (request.user as any).sub, action: "permissoes usuario saas alteradas", entity: "user", entityId: user.id, request });
      return { ok: true };
    });

    adminApp.post("/admin/users/:id/reset-password", async (request) => {
      const params = z.object({ id: z.string() }).parse(request.params);
      const body = z.object({ password: z.string().min(6) }).parse(request.body);
      await app.prisma.user.update({ where: { id: params.id }, data: { passwordHash: await bcrypt.hash(body.password, 10), refreshTokenHash: null } });
      await audit(app, { userId: (request.user as any).sub, action: "senha redefinida", entity: "user", entityId: params.id, request });
      return { ok: true };
    });
    adminApp.post("/admin/users/:id/disable-2fa", async (request) => {
      const params = z.object({ id: z.string() }).parse(request.params);
      await app.prisma.user.update({ where: { id: params.id }, data: { twoFactorEnabled: false, twoFactorSecret: null, recoveryCodesHash: null, refreshTokenHash: null } });
      await audit(app, { userId: (request.user as any).sub, action: "2fa de usuario desativado", entity: "user", entityId: params.id, request });
      return { ok: true };
    });

    adminApp.delete("/admin/users/:id", async (request, reply) => {
      if (forbiddenIfNotSuperAdmin(request, reply)) return reply;
      const params = z.object({ id: z.string() }).parse(request.params);
      const current = userFromRequest(request);
      const target = await app.prisma.user.findUnique({ where: { id: params.id }, include: { _count: { select: { sales: true, auditLogs: true } } } });
      if (!target) return reply.code(404).send({ message: "Usuario SaaS nao encontrado." });
      if (target.id === current.sub && target.platformRole === "super_admin") {
        const activeSuperAdmins = await app.prisma.user.count({ where: { platformRole: "super_admin", active: true } });
        if (activeSuperAdmins <= 1) return reply.code(409).send({ message: "Nao e possivel excluir o unico super_admin ativo logado." });
      }
      if (target._count.sales) {
        return reply.code(409).send({ message: "Usuario possui vendas vinculadas. Inative em vez de excluir.", counts: target._count });
      }
      await app.prisma.$transaction([
        app.prisma.deviceToken.deleteMany({ where: { userId: target.id } }),
        app.prisma.auditLog.updateMany({ where: { userId: target.id }, data: { userId: null } }),
        app.prisma.user.delete({ where: { id: target.id } })
      ]);
      await audit(app, { userId: current.sub === target.id ? null : current.sub, action: "usuario saas excluido", entity: "user", entityId: target.id, details: target.email, request });
      return { ok: true };
    });

    adminApp.patch("/users/:id", async (request) => {
      const params = z.object({ id: z.string() }).parse(request.params);
      const input = userInput.partial().parse(request.body);
      const user = await app.prisma.user.update({
        where: { id: params.id },
        data: {
          name: input.name,
          email: input.email,
          phone: input.phone,
          platformRole: input.platformRole,
          role: input.platformRole === "super_admin" || input.platformRole === "admin" ? "admin" : input.platformRole ? "manager" : undefined,
          permissionsJson: input.permissions ? JSON.stringify(input.permissions) : undefined,
          active: input.active,
          passwordHash: input.password ? await bcrypt.hash(input.password, 10) : undefined,
          refreshTokenHash: input.password || input.active === false ? null : undefined
        }
      });
      await audit(app, { userId: (request.user as any).sub, action: "usuario saas alterado", entity: "user", entityId: user.id, request });
      return user;
    });

    adminApp.patch("/users/:id/permissions", async (request) => {
      const params = z.object({ id: z.string() }).parse(request.params);
      const body = z.object({ permissions: z.record(z.boolean()) }).parse(request.body);
      const user = await app.prisma.user.update({ where: { id: params.id }, data: { permissionsJson: JSON.stringify(body.permissions), refreshTokenHash: null } });
      await audit(app, { userId: (request.user as any).sub, action: "permissoes usuario saas alteradas", entity: "user", entityId: user.id, request });
      return { ok: true };
    });

    adminApp.delete("/users/:id", async (request, reply) => {
      if (forbiddenIfNotSuperAdmin(request, reply)) return reply;
      const params = z.object({ id: z.string() }).parse(request.params);
      const current = userFromRequest(request);
      const target = await app.prisma.user.findUnique({ where: { id: params.id }, include: { _count: { select: { sales: true, auditLogs: true } } } });
      if (!target) return reply.code(404).send({ message: "Usuario SaaS nao encontrado." });
      if (target.id === current.sub && target.platformRole === "super_admin") {
        const activeSuperAdmins = await app.prisma.user.count({ where: { platformRole: "super_admin", active: true } });
        if (activeSuperAdmins <= 1) return reply.code(409).send({ message: "Nao e possivel excluir o unico super_admin ativo logado." });
      }
      if (target._count.sales) return reply.code(409).send({ message: "Usuario possui vendas vinculadas. Inative em vez de excluir.", counts: target._count });
      await app.prisma.$transaction([
        app.prisma.deviceToken.deleteMany({ where: { userId: target.id } }),
        app.prisma.auditLog.updateMany({ where: { userId: target.id }, data: { userId: null } }),
        app.prisma.user.delete({ where: { id: target.id } })
      ]);
      await audit(app, { userId: current.sub === target.id ? null : current.sub, action: "usuario saas excluido", entity: "user", entityId: target.id, details: target.email, request });
      return { ok: true };
    });
    adminApp.get("/admin/logs", async () => app.prisma.syncLog.findMany({ orderBy: { createdAt: "desc" }, take: 200 }));
    adminApp.get("/admin/devices", async () => app.prisma.device.findMany({ include: { company: true, license: true }, orderBy: { updatedAt: "desc" }, take: 250 }));
    adminApp.get("/admin/licenses", async () => app.prisma.license.findMany({ include: { company: true, plan: true, devices: true }, orderBy: { updatedAt: "desc" }, take: 250 }));
    adminApp.get("/admin/sync-jobs", async () => app.prisma.syncJob.findMany({ include: { company: true, device: true }, orderBy: { createdAt: "desc" }, take: 250 }));
    adminApp.get("/admin/audit", async () => app.prisma.auditLog.findMany({ include: { user: true }, orderBy: { createdAt: "desc" }, take: 250 }));
  });
};
