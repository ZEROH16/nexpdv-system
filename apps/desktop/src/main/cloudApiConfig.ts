import { accessSync, constants, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { app } from "electron";

export type CloudApiSource = "programData" | "env" | "local" | "default" | "devFallback" | "missing";

export interface CloudApiStatus {
  apiUrl?: string;
  source: CloudApiSource;
  sourceLabel: string;
  programDataPath: string;
  localConfigPath: string;
  productionReady: boolean;
  message: string;
  lastError?: string;
  health?: {
    status?: string;
    product?: string;
    version?: string;
    environment?: string;
    database?: string;
    time?: string;
  };
}

export const DEFAULT_CLOUD_API_URL = "https://nexpdvapi-production.up.railway.app";
const DEFAULT_DEV_API_URL = "http://localhost:3333";
const CONFIG_FILE_NAME = "config.json";
const LOCAL_CONFIG_FILE_NAME = "cloud-api-config.json";

const isDevelopmentRuntime = () => !app.isPackaged || process.env.NODE_ENV === "development" || Boolean(process.env.VITE_DEV_SERVER_URL);

const programDataDirectoryPath = () => path.join(process.env.PROGRAMDATA || "C:\\ProgramData", "NexPDV");
const programDataPath = () => path.join(process.env.PROGRAMDATA || "C:\\ProgramData", "NexPDV", CONFIG_FILE_NAME);
const localConfigPath = () => path.join(app.getPath("userData"), LOCAL_CONFIG_FILE_NAME);
const configFileContents = (apiUrl: string) => `${JSON.stringify({ apiUrl }, null, 2)}\n`;

const ensureWindowsReadWriteAccess = (directoryPath: string): string | undefined => {
  if (process.platform !== "win32") return undefined;

  const result = spawnSync("icacls", [directoryPath, "/grant", "*S-1-5-11:(OI)(CI)M", "/T", "/C"], {
    encoding: "utf8",
    windowsHide: true
  });
  if (result.error) return result.error.message;
  if (result.status !== 0) return (result.stderr || result.stdout || `icacls saiu com codigo ${result.status}.`).trim();

  try {
    accessSync(directoryPath, constants.R_OK | constants.W_OK);
  } catch (error) {
    return error instanceof Error ? error.message : "Sem permissao de leitura/escrita no diretorio da API Cloud.";
  }
  return undefined;
};

const writeProgramDataConfig = (apiUrl: string, overwrite: boolean): string | undefined => {
  const directoryPath = programDataDirectoryPath();
  mkdirSync(directoryPath, { recursive: true });
  writeFileSync(programDataPath(), configFileContents(apiUrl), { encoding: "utf8", flag: overwrite ? "w" : "wx" });
  return ensureWindowsReadWriteAccess(directoryPath);
};

export interface CloudApiBootstrapResult {
  filePath: string;
  created: boolean;
  skipped: boolean;
  permissionError?: string;
  error?: string;
}

export const ensureDefaultCloudApiConfig = (): CloudApiBootstrapResult => {
  const filePath = programDataPath();
  if (isDevelopmentRuntime()) {
    return { filePath, created: false, skipped: true };
  }

  try {
    if (!existsSync(filePath)) {
      const permissionError = writeProgramDataConfig(DEFAULT_CLOUD_API_URL, false);
      return { filePath, created: true, skipped: false, permissionError };
    }

    const permissionError = ensureWindowsReadWriteAccess(programDataDirectoryPath());
    return { filePath, created: false, skipped: false, permissionError };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? (error as { code?: unknown }).code : undefined;
    if (code === "EEXIST") {
      return { filePath, created: false, skipped: false };
    }
    return { filePath, created: false, skipped: false, error: error instanceof Error ? error.message : "Nao foi possivel criar a configuracao da API Cloud." };
  }
};

const readConfigApiUrl = (filePath: string): string | undefined => {
  if (!existsSync(filePath)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as { apiUrl?: unknown };
    return typeof parsed.apiUrl === "string" ? parsed.apiUrl : undefined;
  } catch {
    return undefined;
  }
};

export const normalizeApiUrl = (input: string): string => {
  const value = input.trim().replace(/\/+$/, "");
  if (!value) throw new Error("Informe a URL da API Cloud.");
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("A URL da API Cloud deve iniciar com http:// ou https://.");
  }
  return parsed.toString().replace(/\/$/, "");
};

const envApiUrl = () =>
  process.env.NEXPDV_API_URL || process.env.NEXPDV_CLOUD_API_URL || process.env.VITE_NEXPDV_API_URL || process.env.VITE_NEXPDV_CLOUD_API_URL;

const sourceLabel = (source: CloudApiSource) => {
  const labels: Record<CloudApiSource, string> = {
    programData: "Config Windows",
    env: "Variavel de ambiente",
    local: "Config local",
    default: "Padrao cloud",
    devFallback: "Localhost dev",
    missing: "Nao configurada"
  };
  return labels[source];
};

const statusFrom = (source: CloudApiSource, apiUrl?: string, lastError?: string): CloudApiStatus => ({
  apiUrl,
  source,
  sourceLabel: sourceLabel(source),
  programDataPath: programDataPath(),
  localConfigPath: localConfigPath(),
  productionReady: Boolean(apiUrl && source !== "devFallback"),
  lastError,
  message: apiUrl ? `API Cloud ativa via ${sourceLabel(source)}.` : "API Cloud nao configurada para producao."
});

const tryStatus = (source: CloudApiSource, apiUrl?: string): CloudApiStatus | undefined => {
  if (!apiUrl) return undefined;
  try {
    return statusFrom(source, normalizeApiUrl(apiUrl));
  } catch (error) {
    return statusFrom(source, undefined, error instanceof Error ? error.message : "URL da API Cloud invalida.");
  }
};

export const getCloudApiStatus = (): CloudApiStatus => {
  const external = tryStatus("programData", readConfigApiUrl(programDataPath()));
  if (external) return external;

  if (!isDevelopmentRuntime()) {
    ensureDefaultCloudApiConfig();
    const ensuredExternal = tryStatus("programData", readConfigApiUrl(programDataPath()));
    if (ensuredExternal) return ensuredExternal;
  }

  const fromEnv = tryStatus("env", envApiUrl());
  if (fromEnv) return fromEnv;

  const local = tryStatus("local", readConfigApiUrl(localConfigPath()));
  if (local) return local;

  if (isDevelopmentRuntime()) return statusFrom("devFallback", DEFAULT_DEV_API_URL);
  return statusFrom("default", DEFAULT_CLOUD_API_URL);
};

export const getCloudApiBaseUrl = (): string | undefined => getCloudApiStatus().apiUrl;

export const saveLocalCloudApiUrl = (apiUrl: string): CloudApiStatus => {
  const normalized = normalizeApiUrl(apiUrl);
  if (!isDevelopmentRuntime()) {
    const permissionError = writeProgramDataConfig(normalized, true);
    if (permissionError) throw new Error(`Configuracao salva, mas nao foi possivel garantir permissao no Windows: ${permissionError}`);
    return getCloudApiStatus();
  }

  const filePath = localConfigPath();
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, configFileContents(normalized), "utf8");
  return getCloudApiStatus();
};

export const resetLocalCloudApiUrl = (): CloudApiStatus => {
  if (!isDevelopmentRuntime()) {
    const permissionError = writeProgramDataConfig(DEFAULT_CLOUD_API_URL, true);
    if (permissionError) throw new Error(`URL padrao restaurada, mas nao foi possivel garantir permissao no Windows: ${permissionError}`);
    return getCloudApiStatus();
  }

  const filePath = localConfigPath();
  if (existsSync(filePath)) rmSync(filePath, { force: true });
  return getCloudApiStatus();
};

export const testCloudApiConnection = async (apiUrl?: string): Promise<CloudApiStatus> => {
  const status = apiUrl ? statusFrom("local", normalizeApiUrl(apiUrl)) : getCloudApiStatus();
  if (!status.apiUrl) {
    return { ...status, message: status.lastError ?? "API Cloud nao configurada." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetch(`${status.apiUrl}/health`, { signal: controller.signal });
    const body = (await response.json().catch(() => ({}))) as CloudApiStatus["health"] & { message?: string };
    return {
      ...status,
      health: body,
      message: response.ok ? "Conexao com API Cloud validada." : body?.message ?? `API respondeu HTTP ${response.status}.`,
      lastError: response.ok ? undefined : body?.message ?? `HTTP ${response.status}`
    };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "API Cloud indisponivel ou demorou para responder."
        : "Sem internet ou API Cloud indisponivel.";
    return { ...status, message, lastError: message };
  } finally {
    clearTimeout(timeout);
  }
};
