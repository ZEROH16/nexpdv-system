import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

const resetMarkerName = ".nexpdv-reset-local-request";
const isInside = (target: string, parent: string): boolean => {
  const relative = path.relative(parent, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

export interface ResetLocalResult {
  removed: Array<{ label: string; path: string }>;
  missing: Array<{ label: string; path: string }>;
  failed: Array<{ label: string; path: string; error: string }>;
}

const appDataDevCandidates = () =>
  [
    process.env.APPDATA ? path.join(process.env.APPDATA, "NexPDV Dev") : undefined,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "NexPDV Dev") : undefined,
    process.env.APPDATA ? path.join(process.env.APPDATA, "nexpdv-desktop-dev") : undefined,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "nexpdv-desktop-dev") : undefined
  ].filter((item): item is string => Boolean(item));

const resetTargets = (root: string, userDataPath: string) => [
  { label: "storage Electron dev, Local Storage, Cache e banco local", path: userDataPath },
  { label: "banco SQLite/sql.js local solto", path: path.join(root, "nexpdv-local.db") },
  { label: "journal SQLite local solto", path: path.join(root, "nexpdv-local.db-journal") },
  { label: "cache temporario de validacao do main", path: path.join(root, ".tmp-main-check") },
  { label: "cache temporario smoke Electron", path: path.join(root, ".electron-smoke") },
  { label: "log local do Electron dev", path: path.join(root, "electron-main.log") },
  ...appDataDevCandidates().map((candidate) => ({ label: "AppData dev NexPDV", path: candidate }))
];

const assertSafeTarget = (root: string, targetPath: string): string => {
  const resolved = path.resolve(targetPath);
  const insideDesktop = isInside(resolved, root);
  const insideKnownDevAppData = appDataDevCandidates().some((candidate) => resolved === path.resolve(candidate));
  if (!insideDesktop && !insideKnownDevAppData) {
    throw new Error(`Recusando remover caminho fora dos alvos dev permitidos: ${resolved}`);
  }
  if (resolved === root || resolved === path.parse(resolved).root) {
    throw new Error(`Recusando remover raiz perigosa: ${resolved}`);
  }
  return resolved;
};

export const resetMarkerPath = (root = process.cwd()): string => path.join(root, resetMarkerName);

export const requestLocalResetOnNextStart = (root = process.cwd()): string => {
  const markerPath = resetMarkerPath(root);
  fs.writeFileSync(markerPath, JSON.stringify({ requestedAt: new Date().toISOString(), source: "desktop-settings" }, null, 2));
  return markerPath;
};

export const resetLocalDataIfRequested = (log: (message: string) => void, root = process.cwd()): ResetLocalResult | undefined => {
  const markerPath = resetMarkerPath(root);
  if (!fs.existsSync(markerPath)) return undefined;

  const result: ResetLocalResult = { removed: [], missing: [], failed: [] };
  const targets = resetTargets(root, app.getPath("userData"));
  for (const target of targets) {
    const safePath = assertSafeTarget(root, target.path);
    if (!fs.existsSync(safePath)) {
      result.missing.push({ label: target.label, path: safePath });
      continue;
    }
    try {
      fs.rmSync(safePath, { recursive: true, force: true });
      result.removed.push({ label: target.label, path: safePath });
    } catch (error) {
      result.failed.push({ label: target.label, path: safePath, error: error instanceof Error ? error.message : String(error) });
    }
  }
  try {
    fs.rmSync(markerPath, { force: true });
    result.removed.push({ label: "marcador de reset local pendente", path: markerPath });
  } catch (error) {
    result.failed.push({ label: "marcador de reset local pendente", path: markerPath, error: error instanceof Error ? error.message : String(error) });
  }

  result.removed.forEach((target) => log(`Reset local removeu: ${target.label} (${target.path})`));
  result.missing.forEach((target) => log(`Reset local ignorou ausente: ${target.label} (${target.path})`));
  result.failed.forEach((target) => log(`Reset local falhou: ${target.label} (${target.path}) - ${target.error}`));
  return result;
};
