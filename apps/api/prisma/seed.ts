import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const margin = (cost: number, price: number) => (price <= 0 ? 0 : Number((((price - cost) / price) * 100).toFixed(2)));
const features = (input: { pix?: boolean; fiscal?: boolean; cloud?: boolean; mobile?: boolean; intelligence?: boolean }) =>
  JSON.stringify({
    pix: Boolean(input.pix),
    fiscal: Boolean(input.fiscal),
    cloud: Boolean(input.cloud),
    mobile: Boolean(input.mobile),
    intelligence: Boolean(input.intelligence)
  });

async function main() {
  const passwordHash = await bcrypt.hash("123456", 10);
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

  const offlinePlan = await prisma.plan.upsert({
    where: { code: "OFFLINE" },
    update: {
      tenantId: tenant.id,
      name: "NexPDV Offline",
      description: "PDV local offline-first sem cloud.",
      price: 79.9,
      maxStores: 1,
      maxUsers: 3,
      maxDevices: 1,
      billingPeriod: "lifetime",
      graceDays: 30,
      featuresJson: features({})
    },
    create: {
      id: "plan_offline",
      tenantId: tenant.id,
      code: "OFFLINE",
      name: "NexPDV Offline",
      description: "PDV local offline-first sem cloud.",
      price: 79.9,
      maxStores: 1,
      maxUsers: 3,
      maxDevices: 1,
      billingPeriod: "lifetime",
      graceDays: 30,
      featuresJson: features({})
    }
  });

  const cloudPlan = await prisma.plan.upsert({
    where: { code: "CLOUD" },
    update: {
      tenantId: tenant.id,
      name: "NexPDV Cloud",
      description: "Cloud, mobile gerencial e sincronizacao.",
      price: 129.9,
      maxStores: 2,
      maxUsers: 10,
      maxDevices: 3,
      billingPeriod: "monthly",
      graceDays: 7,
      featuresJson: features({ cloud: true, mobile: true })
    },
    create: {
      id: "plan_cloud",
      tenantId: tenant.id,
      code: "CLOUD",
      name: "NexPDV Cloud",
      description: "Cloud, mobile gerencial e sincronizacao.",
      price: 129.9,
      maxStores: 2,
      maxUsers: 10,
      maxDevices: 3,
      billingPeriod: "monthly",
      graceDays: 7,
      featuresJson: features({ cloud: true, mobile: true })
    }
  });

  const proPlan = await prisma.plan.upsert({
    where: { code: "PRO" },
    update: {
      tenantId: tenant.id,
      name: "NexPDV Pro",
      description: "Pix, Fiscal mock, Cloud, Mobile e Intelligence.",
      price: 199.9,
      maxStores: 5,
      maxUsers: 25,
      maxDevices: 8,
      billingPeriod: "monthly",
      graceDays: 10,
      featuresJson: features({ pix: true, fiscal: true, cloud: true, mobile: true, intelligence: true })
    },
    create: {
      id: "plan_pro",
      tenantId: tenant.id,
      code: "PRO",
      name: "NexPDV Pro",
      description: "Pix, Fiscal mock, Cloud, Mobile e Intelligence.",
      price: 199.9,
      maxStores: 5,
      maxUsers: 25,
      maxDevices: 8,
      billingPeriod: "monthly",
      graceDays: 10,
      featuresJson: features({ pix: true, fiscal: true, cloud: true, mobile: true, intelligence: true })
    }
  });

  const company = await prisma.company.upsert({
    where: { id: "cmp_nexpdv_demo" },
    update: { tenantId: tenant.id, status: "active", city: "Sao Paulo", state: "SP", zipCode: "01310-100", accountManager: "Comercial NexPDV" },
    create: {
      id: "cmp_nexpdv_demo",
      tenantId: tenant.id,
      name: "NexPDV Comercio Demo LTDA",
      tradeName: "NexPDV Store",
      document: "12.345.678/0001-90",
      phone: "(11) 4002-2026",
      whatsapp: "(11) 94002-2026",
      email: "contato@nexpdv.com.br",
      address: "Av. Paulista, 1000 - Sao Paulo/SP",
      city: "Sao Paulo",
      state: "SP",
      zipCode: "01310-100",
      accountManager: "Comercial NexPDV",
      internalNotes: "Cliente demonstrativo do painel SaaS."
    }
  });

  await prisma.user.upsert({
    where: { email: "admin@nexpdv.com.br" },
    update: { passwordHash, tenantId: tenant.id, platformRole: "super_admin", permissionsJson: JSON.stringify({ "gerenciar usuarios SaaS": true, "gerenciar licencas": true, "gerenciar planos": true }) },
    create: {
      id: "usr_admin_demo",
      tenantId: tenant.id,
      companyId: company.id,
      name: "Administrador NexPDV",
      email: "admin@nexpdv.com.br",
      passwordHash,
      role: "owner",
      platformRole: "super_admin",
      permissionsJson: JSON.stringify({ "gerenciar usuarios SaaS": true, "gerenciar licencas": true, "gerenciar planos": true })
    }
  });

  await prisma.user.upsert({
    where: { email: "operador@nexpdv.com.br" },
    update: { passwordHash, tenantId: tenant.id },
    create: {
      id: "usr_operador_demo",
      tenantId: tenant.id,
      companyId: company.id,
      name: "Operador Caixa",
      email: "operador@nexpdv.com.br",
      passwordHash,
      role: "cashier"
    }
  });

  const categories = [
    ["cat_bebidas", "Bebidas", "#2563EB"],
    ["cat_padaria", "Padaria", "#16A085"],
    ["cat_mercearia", "Mercearia", "#F59E0B"],
    ["cat_limpeza", "Limpeza", "#8B5CF6"],
    ["cat_higiene", "Higiene", "#EF4444"]
  ] as const;

  for (const [id, name, color] of categories) {
    await prisma.category.upsert({
      where: { id },
      update: { name, color },
      create: { id, companyId: company.id, name, color }
    });
  }

  const products = [
    ["prd_001", "Cafe Especial 500g", "7891000000011", "CAF-500", "cat_mercearia", "NexFoods", 12.9, 21.9, 38, 8, "UN"],
    ["prd_002", "Acucar Cristal 1kg", "7891000000028", "ACU-1KG", "cat_mercearia", "DoceLar", 3.7, 5.99, 64, 12, "UN"],
    ["prd_003", "Arroz Tipo 1 5kg", "7891000000035", "ARR-5KG", "cat_mercearia", "CampoBom", 19.8, 29.9, 22, 6, "UN"],
    ["prd_004", "Feijao Carioca 1kg", "7891000000042", "FEI-1KG", "cat_mercearia", "CampoBom", 5.8, 9.49, 42, 10, "UN"],
    ["prd_005", "Agua Mineral 500ml", "7891000000059", "AGU-500", "cat_bebidas", "Serra Azul", 0.9, 2.49, 96, 24, "UN"],
    ["prd_006", "Refrigerante Cola 2L", "7891000000066", "REF-2L", "cat_bebidas", "Fizz", 4.9, 8.99, 26, 10, "UN"],
    ["prd_007", "Suco Integral Uva 1L", "7891000000073", "SUC-UVA", "cat_bebidas", "ValeSul", 9.5, 16.9, 18, 6, "UN"],
    ["prd_008", "Pao Frances Kg", "7891000000080", "PAO-FRA", "cat_padaria", "Padaria", 8.5, 15.99, 12, 5, "KG"],
    ["prd_009", "Bolo Caseiro Unidade", "7891000000097", "BOL-CAS", "cat_padaria", "Padaria", 7.2, 14.9, 8, 3, "UN"],
    ["prd_010", "Manteiga 200g", "7891000000103", "MAN-200", "cat_mercearia", "LeiteBom", 6.1, 10.99, 16, 6, "UN"],
    ["prd_011", "Leite Integral 1L", "7891000000110", "LEI-1L", "cat_bebidas", "LeiteBom", 3.6, 5.99, 44, 12, "UN"],
    ["prd_012", "Detergente Neutro 500ml", "7891000000127", "DET-500", "cat_limpeza", "Brilho", 1.6, 3.49, 58, 18, "UN"],
    ["prd_013", "Sabao em Po 1kg", "7891000000134", "SAB-1KG", "cat_limpeza", "Brilho", 7.4, 13.9, 21, 8, "UN"],
    ["prd_014", "Amaciante 2L", "7891000000141", "AMA-2L", "cat_limpeza", "CasaSoft", 5.2, 9.9, 15, 6, "UN"],
    ["prd_015", "Papel Higienico 12 rolos", "7891000000158", "PAP-12", "cat_higiene", "Soft", 13.9, 22.9, 11, 5, "UN"],
    ["prd_016", "Shampoo 350ml", "7891000000165", "SHA-350", "cat_higiene", "Aura", 8.8, 15.9, 9, 4, "UN"],
    ["prd_017", "Creme Dental 90g", "7891000000172", "CRE-90", "cat_higiene", "Sorriso", 2.9, 5.99, 31, 8, "UN"],
    ["prd_018", "Chocolate Barra 90g", "7891000000189", "CHO-90", "cat_mercearia", "CacauSul", 3.1, 6.49, 27, 9, "UN"],
    ["prd_019", "Biscoito Recheado 120g", "7891000000196", "BIS-120", "cat_mercearia", "Croc", 2.0, 4.29, 33, 10, "UN"],
    ["prd_020", "Cerveja Lata 350ml", "7891000000202", "CER-350", "cat_bebidas", "PuroMalte", 2.8, 5.49, 72, 24, "UN"]
  ] as const;

  for (const [id, name, barcode, sku, categoryId, brand, cost, price, stock, minStock, unit] of products) {
    await prisma.product.upsert({
      where: { id },
      update: { stock, price, cost, margin: margin(cost, price) },
      create: {
        id,
        companyId: company.id,
        categoryId,
        name,
        barcode,
        sku,
        brand,
        cost,
        price,
        margin: margin(cost, price),
        stock,
        minStock,
        unit
      }
    });
  }

  await prisma.license.upsert({
    where: { key: "NEXPDV-2026" },
    update: { status: "active", planId: offlinePlan.id, planCode: "OFFLINE", featuresJson: offlinePlan.featuresJson, maxDevices: offlinePlan.maxDevices },
    create: {
      companyId: company.id,
      planId: offlinePlan.id,
      key: "NEXPDV-2026",
      planCode: "OFFLINE",
      status: "active",
      validUntil: new Date("2027-12-31T23:59:59.000Z"),
      offlineGraceUntil: new Date("2028-01-30T23:59:59.000Z"),
      demoMode: false,
      featuresJson: offlinePlan.featuresJson,
      maxDevices: offlinePlan.maxDevices,
      activatedAt: new Date(),
      lastValidatedAt: new Date(),
      lastSyncedAt: new Date()
    }
  });

  await prisma.license.upsert({
    where: { key: "NEXPDV-CLOUD-2026" },
    update: { status: "active", planId: cloudPlan.id, planCode: "CLOUD", featuresJson: cloudPlan.featuresJson, maxDevices: cloudPlan.maxDevices },
    create: {
      companyId: company.id,
      planId: cloudPlan.id,
      key: "NEXPDV-CLOUD-2026",
      planCode: "CLOUD",
      status: "active",
      validUntil: new Date("2027-12-31T23:59:59.000Z"),
      offlineGraceUntil: new Date("2028-01-30T23:59:59.000Z"),
      demoMode: false,
      featuresJson: cloudPlan.featuresJson,
      maxDevices: cloudPlan.maxDevices,
      activatedAt: new Date()
    }
  });

  await prisma.license.upsert({
    where: { key: "NEXPDV-PRO-2026" },
    update: { status: "active", planId: proPlan.id, planCode: "PRO", featuresJson: proPlan.featuresJson, maxDevices: proPlan.maxDevices },
    create: {
      companyId: company.id,
      planId: proPlan.id,
      key: "NEXPDV-PRO-2026",
      planCode: "PRO",
      status: "active",
      validUntil: new Date("2027-12-31T23:59:59.000Z"),
      offlineGraceUntil: new Date("2028-01-30T23:59:59.000Z"),
      demoMode: false,
      featuresJson: proPlan.featuresJson,
      maxDevices: proPlan.maxDevices,
      activatedAt: new Date()
    }
  });

  await prisma.subscription.upsert({
    where: { id: "sub_demo" },
    update: { status: "active", planId: proPlan.id },
    create: {
      id: "sub_demo",
      companyId: company.id,
      planId: proPlan.id,
      status: "active",
      startsAt: new Date(),
      endsAt: new Date("2027-12-31T23:59:59.000Z")
    }
  });

  await prisma.device.upsert({
    where: { companyId_deviceId: { companyId: company.id, deviceId: "dev_demo_desktop" } },
    update: { status: "active", online: false, lastSeenAt: new Date(), appVersion: "0.1.0" },
    create: {
      id: "dev_demo_desktop",
      companyId: company.id,
      licenseId: (await prisma.license.findUniqueOrThrow({ where: { key: "NEXPDV-PRO-2026" } })).id,
      deviceId: "dev_demo_desktop",
      name: "PDV Caixa Demo",
      fingerprint: "demo-fingerprint",
      appVersion: "0.1.0",
      platform: "desktop",
      status: "active",
      online: false,
      lastSeenAt: new Date()
    }
  });

  await prisma.syncJob.upsert({
    where: { id: "syncjob_seed_products" },
    update: { status: "pending" },
    create: {
      id: "syncjob_seed_products",
      companyId: company.id,
      deviceId: "dev_demo_desktop",
      entity: "products",
      operation: "pull",
      status: "pending",
      payload: JSON.stringify({ reason: "seed" })
    }
  });

  await prisma.auditLog.create({
    data: {
      tenantId: tenant.id,
      userId: "usr_admin_demo",
      action: "seed saas inicial",
      entity: "tenant",
      entityId: tenant.id,
      details: "Estrutura SaaS central NexPDV preparada."
    }
  });
}

main()
  .finally(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
