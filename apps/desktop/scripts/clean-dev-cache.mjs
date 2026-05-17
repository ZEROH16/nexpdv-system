import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(root, "../..");

const targets = [
  path.resolve(root, "dist/main"),
  path.resolve(root, "node_modules/.vite"),
  path.resolve(repoRoot, "node_modules/.vite")
];

for (const target of targets) {
  const insideDesktop = target.startsWith(root + path.sep);
  const insideRepoNodeModules = target.startsWith(path.resolve(repoRoot, "node_modules") + path.sep);

  if (!insideDesktop && !insideRepoNodeModules) {
    throw new Error(`Refusing to clean path outside allowed dev cache roots: ${target}`);
  }

  fs.rmSync(target, { recursive: true, force: true });
  console.log(`[dev:clean] cleaned ${path.relative(repoRoot, target)}`);
}
