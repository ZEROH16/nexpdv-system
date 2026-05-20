import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(root, "../..");
const force = process.argv.includes("--force");
const confirmation = "RESETAR";

const appDataDevCandidates = [
  process.env.APPDATA ? path.join(process.env.APPDATA, "NexPDV Dev") : undefined,
  process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "NexPDV Dev") : undefined,
  process.env.APPDATA ? path.join(process.env.APPDATA, "nexpdv-desktop-dev") : undefined,
  process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "nexpdv-desktop-dev") : undefined
].filter(Boolean);

const targets = [
  { label: "storage Electron dev, Local Storage, Cache e banco local", path: path.join(root, ".nexpdv-user-data") },
  { label: "banco SQLite/sql.js local solto", path: path.join(root, "nexpdv-local.db") },
  { label: "journal SQLite local solto", path: path.join(root, "nexpdv-local.db-journal") },
  { label: "marcador de reset local pendente", path: path.join(root, ".nexpdv-reset-local-request") },
  { label: "cache temporario de validacao do main", path: path.join(root, ".tmp-main-check") },
  { label: "cache temporario smoke Electron", path: path.join(root, ".electron-smoke") },
  { label: "log local do Electron dev", path: path.join(root, "electron-main.log") },
  ...appDataDevCandidates.map((candidate) => ({ label: "AppData dev NexPDV", path: candidate }))
];

const isInside = (target, parent) => {
  const relative = path.relative(parent, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

const assertSafeTarget = (target) => {
  const resolved = path.resolve(target.path);
  const insideDesktop = isInside(resolved, root);
  const insideKnownDevAppData = appDataDevCandidates.some((candidate) => resolved === path.resolve(candidate));
  if (!insideDesktop && !insideKnownDevAppData) {
    throw new Error(`Recusando remover caminho fora dos alvos dev permitidos: ${resolved}`);
  }
  if (resolved === repoRoot || resolved === root || resolved === path.parse(resolved).root) {
    throw new Error(`Recusando remover raiz perigosa: ${resolved}`);
  }
  return resolved;
};

const describeTargets = () =>
  targets.map((target) => {
    const resolved = assertSafeTarget(target);
    return { ...target, path: resolved, exists: fs.existsSync(resolved) };
  });

const askConfirmation = async () => {
  console.log("[desktop:reset-local] Este comando remove somente dados locais de desenvolvimento/teste do Desktop NexPDV.");
  console.log("[desktop:reset-local] API SaaS, painel admin e banco cloud/API nao serao alterados.");
  console.log(`[desktop:reset-local] Digite ${confirmation} para continuar.`);
  const rl = readline.createInterface({ input, output });
  const answer = await rl.question("> ");
  rl.close();
  if (answer.trim() !== confirmation) {
    console.log("[desktop:reset-local] Operacao cancelada.");
    process.exit(0);
  }
};

const reset = () => {
  const planned = describeTargets();
  const removed = [];
  const missing = [];
  const failed = [];

  for (const target of planned) {
    if (!target.exists) {
      missing.push(target);
      continue;
    }
    try {
      fs.rmSync(target.path, { recursive: true, force: true });
      removed.push(target);
    } catch (error) {
      failed.push({ ...target, error: error instanceof Error ? error.message : String(error) });
    }
  }

  console.log("\n[desktop:reset-local] Removidos:");
  if (removed.length) removed.forEach((target) => console.log(`  - ${target.label}: ${path.relative(repoRoot, target.path) || target.path}`));
  else console.log("  - nenhum arquivo existente foi removido.");

  console.log("\n[desktop:reset-local] Nao encontrados:");
  missing.forEach((target) => console.log(`  - ${target.label}: ${path.relative(repoRoot, target.path) || target.path}`));

  if (failed.length) {
    console.log("\n[desktop:reset-local] Falhas:");
    failed.forEach((target) => console.log(`  - ${target.label}: ${target.path} (${target.error})`));
    console.log("\n[desktop:reset-local] Feche o NexPDV Desktop e execute novamente com --force.");
    process.exit(1);
  }

  console.log("\n[desktop:reset-local] Reset concluido. Ao abrir o Desktop, o NexPDV deve voltar para a tela de ativacao.");
};

if (!force) await askConfirmation();
reset();
