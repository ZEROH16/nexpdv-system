import { app, ipcMain, type BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";

type UpdateChannel = "stable" | "beta" | "dev";
type UpdateStatus = "disabled" | "idle" | "checking" | "available" | "not_available" | "downloading" | "downloaded" | "installing" | "error";
const DEFAULT_GH_OWNER = "ZEROH16";
const DEFAULT_GH_REPO = "nexpdv-system";
const UPDATE_INSTALL_DELAY_MS = 2500;

export interface UpdateState {
  enabled: boolean;
  channel: UpdateChannel;
  provider: "github";
  owner: string;
  repo: string;
  currentVersion: string;
  status: UpdateStatus;
  version?: string;
  releaseDate?: string;
  releaseNotes?: string;
  progress?: number;
  message: string;
  checkedAt?: string;
}

interface AutoUpdateOptions {
  window: BrowserWindow;
  log: (message: string, error?: unknown) => void;
  audit: (action: string, details?: string) => void;
}

const parseBool = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
};

const updateChannel = (): UpdateChannel => {
  const channel = (process.env.UPDATE_CHANNEL || (app.isPackaged ? "stable" : "dev")).trim().toLowerCase();
  return channel === "beta" || channel === "dev" ? channel : "stable";
};

const githubOwner = (): string => (process.env.GH_OWNER || process.env.UPDATE_GH_OWNER || DEFAULT_GH_OWNER).trim() || DEFAULT_GH_OWNER;

const githubRepo = (): string => (process.env.GH_REPO || process.env.UPDATE_GH_REPO || DEFAULT_GH_REPO).trim() || DEFAULT_GH_REPO;

const updateInfoChannel = (channel: UpdateChannel): string => (channel === "stable" ? "latest" : channel);

const compareVersions = (left: string, right: string): number => {
  const a = left.split(".").map((item) => Number(item.replace(/\D/g, "")) || 0);
  const b = right.split(".").map((item) => Number(item.replace(/\D/g, "")) || 0);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
};

const stringifyUpdaterMessage = (message: unknown): string => {
  if (message instanceof Error) return `${message.name}: ${message.message}`;
  if (typeof message === "string") return message;
  try {
    return JSON.stringify(message);
  } catch {
    return String(message);
  }
};

const friendlyUpdateError = (error: unknown): string => {
  const message = stringifyUpdaterMessage(error);
  const lower = message.toLowerCase();
  const isNetworkError =
    lower.includes("err_name_not_resolved") ||
    lower.includes("err_internet_disconnected") ||
    lower.includes("enotfound") ||
    lower.includes("eai_again") ||
    lower.includes("etimedout") ||
    lower.includes("econnreset") ||
    lower.includes("err_network_changed") ||
    lower.includes("failed to fetch");

  if (isNetworkError) {
    return "Sem conexao com a internet para verificar atualizacoes. O NexPDV continuara funcionando e tentara novamente depois.";
  }

  if (lower.includes("404") || lower.includes("not found") || lower.includes("channel_file_not_found")) {
    return "Nenhuma atualizacao publicada foi encontrada no GitHub Releases.";
  }

  return "Falha ao verificar atualizacao. Tente novamente em alguns minutos.";
};

export const registerAutoUpdate = ({ window, log, audit }: AutoUpdateOptions): UpdateState => {
  const enabled = parseBool(process.env.AUTO_UPDATE_ENABLED, app.isPackaged);
  const channel = updateChannel();
  const owner = githubOwner();
  const repo = githubRepo();
  const updaterChannel = updateInfoChannel(channel);
  let installTimer: ReturnType<typeof setTimeout> | undefined;
  let state: UpdateState = {
    enabled,
    channel,
    provider: "github",
    owner,
    repo,
    currentVersion: app.getVersion(),
    status: enabled ? "idle" : "disabled",
    message: enabled ? "Atualizacoes prontas para verificacao." : "Atualizacao automatica desabilitada neste ambiente."
  };

  const publish = (patch: Partial<UpdateState>) => {
    state = { ...state, ...patch };
    window.webContents.send("updates:status", state);
  };

  const logUpdater = (level: "info" | "warn" | "error" | "debug", message: unknown, error?: unknown) => {
    const text = stringifyUpdaterMessage(message);
    const prefix = `[updater:${level}] ${text}`;
    log(prefix, error);
  };

  const handleUpdaterError = (context: string, error: unknown): UpdateState => {
    const message = friendlyUpdateError(error);
    const raw = stringifyUpdaterMessage(error);
    logUpdater("error", `${context}: ${raw}`, error);
    audit("erro update", `${context}: ${raw.slice(0, 240)}`);
    publish({ status: "error", checkedAt: new Date().toISOString(), message });
    return state;
  };

  const installDownloadedUpdate = () => {
    if (installTimer) clearTimeout(installTimer);
    installTimer = setTimeout(() => {
      publish({ status: "installing", message: "Instalando atualizacao e reiniciando o NexPDV..." });
      audit("install update automatico", state.version);
      logUpdater("info", `Instalando update ${state.version ?? ""} via quitAndInstall.`);
      autoUpdater.quitAndInstall(true, true);
    }, UPDATE_INSTALL_DELAY_MS);
  };

  if (!enabled) {
    log("Auto update desabilitado.");
  } else {
    autoUpdater.logger = {
      info: (message?: unknown) => logUpdater("info", message),
      warn: (message?: unknown) => logUpdater("warn", message),
      error: (message?: unknown) => logUpdater("error", message),
      debug: (message: string) => logUpdater("debug", message)
    };
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowDowngrade = false;
    autoUpdater.channel = updaterChannel;
    autoUpdater.setFeedURL({
      provider: "github",
      owner,
      repo,
      private: false,
      releaseType: "release",
      channel: updaterChannel
    });
    logUpdater("info", `Feed configurado: github ${owner}/${repo} canal=${channel} arquivo=${updaterChannel}.yml`);

    autoUpdater.on("checking-for-update", () => {
      logUpdater("info", `Verificando atualizacao em GitHub Releases (${owner}/${repo}).`);
      audit("check update", `${owner}/${repo}:${channel}`);
      publish({ status: "checking", checkedAt: new Date().toISOString(), message: "Verificando atualizacao no GitHub Releases..." });
    });
    autoUpdater.on("update-available", (info) => {
      const version = String(info.version ?? "");
      if (version && compareVersions(version, app.getVersion()) < 0) {
        logUpdater("warn", `Atualizacao ignorada por downgrade: ${version}`);
        publish({ status: "not_available", version, message: "Versao remota inferior ignorada." });
        return;
      }
      logUpdater("info", `Atualizacao disponivel: ${version} releaseDate=${info.releaseDate ?? "-"} arquivos=${info.files?.length ?? 0}`);
      audit("update disponivel", version);
      publish({
        status: "available",
        version,
        releaseDate: info.releaseDate,
        releaseNotes: typeof info.releaseNotes === "string" ? info.releaseNotes : undefined,
        message: "Atualizacao disponivel. O download iniciara automaticamente."
      });
    });
    autoUpdater.on("update-not-available", (info) => {
      logUpdater("info", `Nenhuma atualizacao disponivel. Versao remota=${info.version ?? "-"}`);
      publish({ status: "not_available", version: info.version, checkedAt: new Date().toISOString(), message: "NexPDV ja esta atualizado." });
    });
    autoUpdater.on("download-progress", (progress) => {
      const percent = Math.round(progress.percent);
      logUpdater("debug", `Download update ${percent}% (${Math.round(progress.bytesPerSecond ?? 0)} B/s).`);
      publish({ status: "downloading", progress: percent, message: `Baixando atualizacao ${percent}%...` });
    });
    autoUpdater.on("update-downloaded", (info) => {
      logUpdater("info", `Atualizacao baixada: ${info.version}. Instalacao automatica em ${UPDATE_INSTALL_DELAY_MS}ms.`);
      audit("update baixado", info.version);
      publish({ status: "downloaded", version: info.version, progress: 100, message: "Atualizacao baixada. O NexPDV sera reiniciado para instalar." });
      installDownloadedUpdate();
    });
    autoUpdater.on("error", (error) => {
      handleUpdaterError("evento do updater", error);
    });
  }

  ipcMain.handle("updates:status", () => state);
  ipcMain.handle("updates:check", async () => {
    if (!state.enabled) return state;
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      return handleUpdaterError("verificacao manual", error);
    }
    return state;
  });
  ipcMain.handle("updates:download", async () => {
    if (!state.enabled) return state;
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      return handleUpdaterError("download manual", error);
    }
    return state;
  });
  ipcMain.handle("updates:install", () => {
    audit("install update", state.version);
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
    return { ...state, message: "Reiniciando para instalar atualizacao." };
  });
  ipcMain.handle("updates:remind-later", () => {
    if (installTimer) clearTimeout(installTimer);
    publish({ status: "idle", message: "Atualizacao adiada." });
    return state;
  });

  if (enabled) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((error) => {
        handleUpdaterError("verificacao inicial", error);
      });
    }, 3500);
  }

  return state;
};
