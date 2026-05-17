import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const required = [
  "package.json",
  "packages/shared/src/index.ts",
  "apps/desktop/src/main/localDatabase.ts",
  "apps/desktop/src/main/syncEngine.ts",
  "apps/desktop/src/renderer/pages/Pos.tsx",
  "apps/api/prisma/schema.prisma",
  "apps/api/src/routes/sync.ts",
  "apps/mobile/App.tsx",
  "apps/admin/src/App.tsx",
  "README.md"
];

const missing = required.filter((file) => !existsSync(path.join(root, file)));

if (missing.length) {
  console.error("Arquivos obrigatorios ausentes:");
  missing.forEach((file) => console.error(`- ${file}`));
  process.exit(1);
}

console.log("NexPDV estrutura validada.");
