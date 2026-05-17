import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(root, "../..");
const nodeBin = process.execPath;
const tscBin = path.join(repoRoot, "node_modules", "typescript", "bin", "tsc");
const watch = process.argv.includes("--watch");
let timer;

const compile = () => {
  const result = spawnSync(nodeBin, [tscBin, "-p", "tsconfig.main.json"], {
    cwd: root,
    stdio: "inherit",
    env: process.env
  });
  if (result.status !== 0) return false;

  const outDir = path.join(root, "dist", "main");
  fs.writeFileSync(path.join(outDir, "package.json"), JSON.stringify({ name: "nexpdv-desktop-main", type: "commonjs", main: "main.cjs" }, null, 2));
  for (const name of ["main", "preload"]) {
    const jsPath = path.join(outDir, `${name}.js`);
    const cjsPath = path.join(outDir, `${name}.cjs`);
    if (fs.existsSync(jsPath)) {
      fs.copyFileSync(jsPath, cjsPath);
    }
  }
  console.log("[main] compiled");
  return true;
};

const schedule = () => {
  clearTimeout(timer);
  timer = setTimeout(compile, 150);
};

compile();

if (watch) {
  fs.watch(path.join(root, "src", "main"), { recursive: true }, schedule);
  process.stdin.resume();
}
