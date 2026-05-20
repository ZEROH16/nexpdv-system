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
  app.post("/activation/activate", async (request, reply) => {
    const input = activationInput.parse(request.body);
    const key = input.licenseKey.trim().toUpperCase();
    const license = await app.prisma.license.findUnique({
      where: { key },
      include: { company: { include: { tenant: true } }, plan: true, devices: true }
    });
    if (!license) {
      await audit(app, { action: "ativacao online falhou", details: `chave inexistente: ${key}`, request });
      return reply.code(404).send({ message: "Licenca nao encontrada." });
    }
    if (license.status !== "active") return reply.code(403).send({ message: "Licenca bloqueada ou inativa." });
    if (license.company.status !== "active") return reply.code(403).send({ message: "Empresa bloqueada." });
    if (license.validUntil.getTime() <= Date.now()) return reply.code(403).send({ message: "Licenca expirada." });

    const existingDevice = license.devices.find((device) => device.deviceId === input.device.deviceId);
    const activeDevices = license.devices.filter((device) => device.status === "active");
    if (!existingDevice && activeDevices.length >= license.maxDevices) {
      await audit(app, { tenantId: license.company.tenantId, action: "limite dispositivos excedido", entity: "license", entityId: license.id, request });
      return reply.code(403).send({ message: "Limite de dispositivos atingido para esta licenca." });
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
        ownerEmail: input.ownerEmail
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
      include: { licenses: true, subscriptions: { include: { plan: true } }, devices: true, _count: { select: { users: true, sales: true, products: true } } },
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

    adminApp.post("/companies/:id/status", async (request) => {
      const params = z.object({ id: z.string() }).parse(request.params);
      const body = z.object({ status: z.enum(["active", "inactive", "blocked"]) }).parse(request.body);
      const company = await app.prisma.company.update({ where: { id: params.id }, data: { status: body.status } });
      await audit(app, { tenantId: company.tenantId, userId: (request.user as any).sub, action: `empresa ${body.status}`, entity: "company", entityId: company.id, request });
      return company;
    });

    adminApp.delete("/companies/:id", async (request, reply) => {
      const params = z.object({ id: z.string() }).parse(request.params);
      const relations = await app.prisma.company.findUnique({
        where: { id: params.id },
        include: { _count: { select: { licenses: true, devices: true, sales: true } } }
      });
      if (!relations) return reply.code(404).send({ message: "Empresa nao encontrada." });
      if (relations._count.licenses || relations._count.devices || relations._count.sales) {
        const company = await app.prisma.company.update({ where: { id: params.id }, data: { status: "inactive" } });
        await audit(app, { tenantId: company.tenantId, userId: (request.user as any).sub, action: "empresa inativada por vinculos", entity: "company", entityId: company.id, request });
        return { ...company, softDeleted: true };
      }
      await app.prisma.company.delete({ where: { id: params.id } });
      await audit(app, { userId: (request.user as any).sub, action: "empresa excluida", entity: "company", entityId: params.id, request });
      return { ok: true };
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

    adminApp.post("/plans/:id/status", async (request) => {
      const params = z.object({ id: z.string() }).parse(request.params);
      const body = z.object({ active: z.boolean() }).parse(request.body);
      const plan = await app.prisma.plan.update({ where: { id: params.id }, data: { active: body.active } });
      await audit(app, { userId: (request.user as any).sub, action: body.active ? "plano ativado" : "plano inativado", entity: "plan", entityId: plan.id, request });
      return plan;
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
          permissionsJson: input.permissions ? JSON.stringify(input.permissions) : undefined,
          active: input.active,
          passwordHash: input.password ? await bcrypt.hash(input.password, 10) : undefined
        },
        select: { id: true, name: true, email: true, platformRole: true, active: true, twoFactorEnabled: true }
      });
      await audit(app, { userId: (request.user as any).sub, action: "usuario saas alterado", entity: "user", entityId: user.id, request });
      return user;
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
      await app.prisma.user.update({ where: { id: params.id }, data: { twoFactorEnabled: false, twoFactorSecret: null, recoveryCodesHash: null } });
      await audit(app, { userId: (request.user as any).sub, action: "2fa de usuario desativado", entity: "user", entityId: params.id, request });
      return { ok: true };
    });
    adminApp.get("/admin/logs", async () => app.prisma.syncLog.findMany({ orderBy: { createdAt: "desc" }, take: 200 }));
    adminApp.get("/admin/devices", async () => app.prisma.device.findMany({ include: { company: true, license: true }, orderBy: { updatedAt: "desc" }, take: 250 }));
    adminApp.get("/admin/licenses", async () => app.prisma.license.findMany({ include: { company: true, plan: true, devices: true }, orderBy: { updatedAt: "desc" }, take: 250 }));
    adminApp.get("/admin/sync-jobs", async () => app.prisma.syncJob.findMany({ include: { company: true, device: true }, orderBy: { createdAt: "desc" }, take: 250 }));
    adminApp.get("/admin/audit", async () => app.prisma.auditLog.findMany({ include: { user: true }, orderBy: { createdAt: "desc" }, take: 250 }));
  });
};
