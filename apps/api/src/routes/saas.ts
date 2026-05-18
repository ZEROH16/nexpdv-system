import { randomBytes } from "node:crypto";
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
  const user = request.user as { role?: string; platformRole?: string };
  if (!["owner", "admin"].includes(user.role ?? "") && !["super_admin", "support"].includes(user.platformRole ?? "")) {
    return reply.code(403).send({ message: "Acesso SaaS restrito." });
  }
};

const companyInput = z.object({
  name: z.string().min(2),
  tradeName: z.string().optional(),
  document: z.string().min(4),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  status: z.string().default("active")
});

const activationInput = z.object({
  ownerEmail: z.string().email(),
  licenseKey: z.string().min(6),
  companyName: z.string().min(2),
  device: z.object({
    deviceId: z.string().min(4),
    name: z.string().min(2),
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
    const [companies, devicesOnline, salesSynced, licensesActive, syncPending] = await Promise.all([
      app.prisma.company.count({ where: { status: "active" } }),
      app.prisma.device.count({ where: { status: "active", online: true } }),
      app.prisma.sale.count({ where: { syncStatus: "synced" } }),
      app.prisma.license.count({ where: { status: "active", validUntil: { gt: new Date() } } }),
      app.prisma.syncJob.count({ where: { status: { in: ["pending", "failed"] } } })
    ]);
    return { companies, devicesOnline, salesSynced, licensesActive, syncPending, cloudStatus: "operational" };
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

    adminApp.get("/plans", async () => app.prisma.plan.findMany({ orderBy: { price: "asc" } }));

    adminApp.post("/plans", async (request) => {
    const input = z.object({
      code: z.string().min(2).transform((value) => value.toUpperCase()),
      name: z.string().min(2),
      description: z.string().optional(),
      price: z.number().nonnegative(),
      maxStores: z.number().int().positive(),
      maxUsers: z.number().int().positive(),
      maxDevices: z.number().int().positive(),
      features: z.object({ pix: z.boolean(), fiscal: z.boolean(), cloud: z.boolean(), mobile: z.boolean(), intelligence: z.boolean() })
    }).parse(request.body);
    const plan = await app.prisma.plan.upsert({
      where: { code: input.code },
      update: { ...input, featuresJson: featureString(input.features) },
      create: { ...input, featuresJson: featureString(input.features) }
    });
    await audit(app, { userId: (request.user as any).sub, action: "plano salvo", entity: "plan", entityId: plan.id, request });
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
        offlineGraceUntil: addDays(new Date(), config.LICENSE_OFFLINE_GRACE_DAYS),
        demoMode: false,
        featuresJson: plan.featuresJson,
        maxDevices: plan.maxDevices
      },
      include: { company: true, plan: true }
    });
    await audit(app, { userId: (request.user as any).sub, action: "licenca gerada", entity: "license", entityId: license.id, details: license.key, request });
    return license;
  });

    adminApp.post("/licenses/:id/block", async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ reason: z.string().optional() }).parse(request.body ?? {});
    const license = await app.prisma.license.update({ where: { id: params.id }, data: { status: "blocked", blockedReason: body.reason ?? "Bloqueio manual" } });
    await audit(app, { userId: (request.user as any).sub, action: "licenca bloqueada", entity: "license", entityId: license.id, request });
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

    adminApp.get("/devices", async () =>
    app.prisma.device.findMany({ include: { company: true, license: true }, orderBy: { updatedAt: "desc" }, take: 250 })
  );

    adminApp.post("/devices/:id/deactivate", async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const device = await app.prisma.device.update({ where: { id: params.id }, data: { status: "inactive", online: false, deactivatedAt: new Date() } });
    await audit(app, { userId: (request.user as any).sub, action: "dispositivo desativado", entity: "device", entityId: device.id, request });
    return device;
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
      select: { id: true, tenantId: true, companyId: true, name: true, email: true, role: true, platformRole: true, active: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 250
    })
  );
    adminApp.get("/admin/logs", async () => app.prisma.syncLog.findMany({ orderBy: { createdAt: "desc" }, take: 200 }));
    adminApp.get("/admin/devices", async () => app.prisma.device.findMany({ include: { company: true, license: true }, orderBy: { updatedAt: "desc" }, take: 250 }));
    adminApp.get("/admin/licenses", async () => app.prisma.license.findMany({ include: { company: true, plan: true, devices: true }, orderBy: { updatedAt: "desc" }, take: 250 }));
    adminApp.get("/admin/sync-jobs", async () => app.prisma.syncJob.findMany({ include: { company: true, device: true }, orderBy: { createdAt: "desc" }, take: 250 }));
    adminApp.get("/admin/audit", async () => app.prisma.auditLog.findMany({ include: { user: true }, orderBy: { createdAt: "desc" }, take: 250 }));
  });
};
