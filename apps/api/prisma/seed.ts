import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const margin = (cost: number, price: number) => (price <= 0 ? 0 : Number((((price - cost) / price) * 100).toFixed(2)));

async function main() {
  const passwordHash = await bcrypt.hash("123456", 10);
  const company = await prisma.company.upsert({
    where: { id: "cmp_nexpdv_demo" },
    update: {},
    create: {
      id: "cmp_nexpdv_demo",
      name: "NexPDV Comercio Demo LTDA",
      tradeName: "NexPDV Store",
      document: "12.345.678/0001-90",
      phone: "(11) 4002-2026",
      email: "contato@nexpdv.com.br",
      address: "Av. Paulista, 1000 - Sao Paulo/SP"
    }
  });

  await prisma.user.upsert({
    where: { email: "admin@nexpdv.com.br" },
    update: { passwordHash },
    create: {
      id: "usr_admin_demo",
      companyId: company.id,
      name: "Administrador NexPDV",
      email: "admin@nexpdv.com.br",
      passwordHash,
      role: "owner"
    }
  });

  await prisma.user.upsert({
    where: { email: "operador@nexpdv.com.br" },
    update: { passwordHash },
    create: {
      id: "usr_operador_demo",
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
    update: { status: "active" },
    create: {
      companyId: company.id,
      key: "NEXPDV-2026",
      status: "active",
      validUntil: new Date("2027-12-31T23:59:59.000Z"),
      demoMode: false,
      activatedAt: new Date()
    }
  });

  const plan = await prisma.plan.upsert({
    where: { id: "plan_pro" },
    update: {},
    create: { id: "plan_pro", name: "NexPDV Pro", price: 149.9, maxStores: 3, maxUsers: 15 }
  });

  await prisma.subscription.upsert({
    where: { id: "sub_demo" },
    update: { status: "active" },
    create: {
      id: "sub_demo",
      companyId: company.id,
      planId: plan.id,
      status: "active",
      startsAt: new Date(),
      endsAt: new Date("2027-12-31T23:59:59.000Z")
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
