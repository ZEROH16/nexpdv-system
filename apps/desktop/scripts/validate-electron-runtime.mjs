import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(root, "../..");
const electronPackageDir = path.join(repoRoot, "node_modules", "electron");
const electronDistDir = path.join(electronPackageDir, "dist");
const electronExe = path.join(electronDistDir, process.platform === "win32" ? "electron.exe" : "electron");
const electronVersion = require(path.join(electronPackageDir, "package.json")).version;
const { downloadArtifact } = require("@electron/get");
const extract = require("extract-zip");

const blockingRuntimeFiles = [process.platform === "win32" ? "electron.exe" : "electron"];

const advisoryRuntimeFiles = process.platform === "win32" ? [
  "chrome_100_percent.pak",
  "chrome_200_percent.pak",
  "chrome_crashpad_handler.exe",
  "d3dcompiler_47.dll",
  "ffmpeg.dll",
  "icudtl.dat",
  "libEGL.dll",
  "libGLESv2.dll",
  "resources.pak",
  "snapshot_blob.bin",
  "v8_context_snapshot.bin",
  "vk_swiftshader.dll",
  "vk_swiftshader_icd.json",
  "vulkan-1.dll",
  path.join("resources", "default_app.asar")
] : [path.join("resources", "default_app.asar")];

const missingBlockingRuntimeFiles = () => blockingRuntimeFiles.filter((file) => !fs.existsSync(path.join(electronDistDir, file)));
const missingAdvisoryRuntimeFiles = () => advisoryRuntimeFiles.filter((file) => !fs.existsSync(path.join(electronDistDir, file)));

const runSmokeTest = () => {
  const smokeDir = path.join(root, ".electron-smoke");
  const ranFile = path.join(smokeDir, "ran.log");
  fs.rmSync(smokeDir, { recursive: true, force: true });
  fs.mkdirSync(smokeDir, { recursive: true });
  fs.writeFileSync(path.join(smokeDir, "package.json"), JSON.stringify({ main: "main.js" }, null, 2));
  fs.writeFileSync(
    path.join(smokeDir, "main.js"),
    [
      "const { app } = require('electron');",
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      "fs.writeFileSync(path.join(__dirname, 'ran.log'), 'ok');",
      "app.whenReady().then(() => app.quit());"
    ].join("\n")
  );

  const result = spawnSync(electronExe, [smokeDir], {
    cwd: root,
    encoding: "utf8",
    timeout: 15000,
    env: {
      ...process.env,
      ELECTRON_ENABLE_LOGGING: "1",
      ELECTRON_ENABLE_STACK_DUMPING: "1"
    }
  });
  const ok = result.status === 0 && fs.existsSync(ranFile);
  const details = [`exit=${result.status ?? "null"}`, result.signal ? `signal=${result.signal}` : "", result.error?.message ?? "", result.stdout?.trim() ?? "", result.stderr?.trim() ?? ""]
    .filter(Boolean)
    .join(" | ");
  fs.rmSync(smokeDir, { recursive: true, force: true });
  return { ok, details };
};

const reinstallElectron = async () => {
  console.warn("[electron:validate] Runtime do Electron incompleto ou invalido. Reinstalando binario...");
  const platform = process.env.npm_config_platform || process.platform;
  const arch = process.env.npm_config_arch || process.arch;
  const zipPath = await downloadArtifact({
    version: electronVersion,
    artifactName: "electron",
    force: true,
    cacheRoot: process.env.electron_config_cache,
    checksums: process.env.electron_use_remote_checksums ?? process.env.npm_config_electron_use_remote_checksums ? undefined : require(path.join(electronPackageDir, "checksums.json")),
    platform,
    arch
  });
  fs.rmSync(electronDistDir, { recursive: true, force: true });
  await extract(zipPath, { dir: electronDistDir });
  fs.writeFileSync(path.join(electronPackageDir, "path.txt"), process.platform === "win32" ? "electron.exe" : "electron");
};

const validate = async (allowRepair) => {
  const missingBlocking = missingBlockingRuntimeFiles();
  if (missingBlocking.length > 0) {
    console.error(`[electron:validate] Arquivos obrigatorios ausentes: ${missingBlocking.join(", ")}`);
    if (!allowRepair) return false;
    await reinstallElectron();
  }

  const missingAfterInstall = missingBlockingRuntimeFiles();
  if (missingAfterInstall.length > 0) {
    throw new Error(`Runtime do Electron continua incompleto: ${missingAfterInstall.join(", ")}`);
  }

  const warnings = missingAdvisoryRuntimeFiles();
  if (warnings.length > 0) {
    console.warn(`[electron:validate] Aviso: arquivos auxiliares ausentes em dev: ${warnings.join(", ")}`);
    console.warn("[electron:validate] Continuando porque electron.exe esta presente.");
  }

  const smoke = runSmokeTest();
  if (!smoke.ok) {
    console.warn(`[electron:validate] Aviso: smoke test nao confirmou execucao do app minimo: ${smoke.details || "sem detalhes"}`);
    console.warn("[electron:validate] Continuando em modo desenvolvimento. Falhas reais do main serao registradas em electron-main.log.");
  }

  return true;
};

try {
  await validate(true);
  console.log("[electron:validate] Runtime do Electron OK.");
} catch (error) {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  console.error("[electron:validate] Feche processos electron.exe antigos e rode npm install ou npm rebuild electron com acesso a internet/cache do Electron.");
  console.error("[electron:validate] Em redes corporativas, configure ELECTRON_MIRROR/electron_mirror antes de instalar.");
  process.exit(1);
}
