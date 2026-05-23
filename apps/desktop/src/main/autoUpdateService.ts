import { app, ipcMain, type BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";

type UpdateChannel = "stable" | "beta" | "dev";
type UpdateStatus = "disabled" | "idle" | "checking" | "available" | "not_available" | "downloading" | "downloaded" | "error";
const DEFAULT_UPDATE_PROVIDER_URL = "https://updates.nexpdv.com.br/desktop/stable";

export interface UpdateState {
  enabled: boolean;
  channel: UpdateChannel;
  providerUrl?: string;
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

const compareVersions = (left: string, right: string): number => {
  const a = left.split(".").map((item) => Number(item.replace(/\D/g, "")) || 0);
  const b = right.split(".").map((item) => Number(item.replace(/\D/g, "")) || 0);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
};

export const registerAutoUpdate = ({ window, log, audit }: AutoUpdateOptions): UpdateState => {
  const enabled = parseBool(process.env.AUTO_UPDATE_ENABLED, app.isPackaged);
  const channel = updateChannel();
  const providerUrl = (process.env.UPDATE_PROVIDER_URL || (app.isPackaged ? DEFAULT_UPDATE_PROVIDER_URL : "")).trim().replace(/\/$/, "");
  let state: UpdateState = {
    enabled,
    channel,
    providerUrl: providerUrl || undefined,
    currentVersion: app.getVersion(),
    status: enabled ? "idle" : "disabled",
    message: enabled ? "Atualizacoes prontas para verificacao." : "Atualizacao automatica desabilitada neste ambiente."
  };

  const publish = (patch: Partial<UpdateState>) => {
    state = { ...state, ...patch };
    window.webContents.send("updates:status", state);
  };

  if (!enabled) {
    log("Auto update desabilitado.");
  } else if (!providerUrl) {
    publish({ status: "disabled", enabled: false, message: "UPDATE_PROVIDER_URL nao configurado." });
    log("Auto update sem UPDATE_PROVIDER_URL. Verificacao ignorada.");
  } else {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowDowngrade = false;
    autoUpdater.channel = channel;
    autoUpdater.setFeedURL({ provider: "generic", url: providerUrl, channel });

    autoUpdater.on("checking-for-update", () => {
      log("Verificando atualizacao.");
      audit("check update", channel);
      publish({ status: "checking", checkedAt: new Date().toISOString(), message: "Verificando atualizacao..." });
    });
    autoUpdater.on("update-available", (info) => {
      const version = String(info.version ?? "");
      if (version && compareVersions(version, app.getVersion()) < 0) {
        log(`Atualizacao ignorada por downgrade: ${version}`);
        publish({ status: "not_available", version, message: "Versao remota inferior ignorada." });
        return;
      }
      log(`Atualizacao disponivel: ${version}`);
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
      log("Nenhuma atualizacao disponivel.");
      publish({ status: "not_available", version: info.version, checkedAt: new Date().toISOString(), message: "NexPDV ja esta atualizado." });
    });
    autoUpdater.on("download-progress", (progress) => {
      const percent = Math.round(progress.percent);
      publish({ status: "downloading", progress: percent, message: `Baixando atualizacao ${percent}%...` });
    });
    autoUpdater.on("update-downloaded", (info) => {
      log(`Atualizacao baixada: ${info.version}`);
      audit("update baixado", info.version);
      publish({ status: "downloaded", version: info.version, progress: 100, message: "Atualizacao pronta para instalar." });
    });
    autoUpdater.on("error", (error) => {
      log("Erro no auto update.", error);
      audit("erro update", error.message);
      publish({ status: "error", message: error.message || "Falha ao verificar atualizacao." });
    });
  }

  ipcMain.handle("updates:status", () => state);
  ipcMain.handle("updates:check", async () => {
    if (!state.enabled || !providerUrl) return state;
    await autoUpdater.checkForUpdates();
    return state;
  });
  ipcMain.handle("updates:download", async () => {
    if (!state.enabled || !providerUrl) return state;
    await autoUpdater.downloadUpdate();
    return state;
  });
  ipcMain.handle("updates:install", () => {
    audit("install update", state.version);
    setImmediate(() => autoUpdater.quitAndInstall(false, true));
    return { ...state, message: "Reiniciando para instalar atualizacao." };
  });
  ipcMain.handle("updates:remind-later", () => {
    publish({ status: "idle", message: "Atualizacao adiada." });
    return state;
  });

  if (enabled && providerUrl) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((error) => {
        log("Falha na verificacao inicial de update.", error);
      });
    }, 3500);
  }

  return state;
};
