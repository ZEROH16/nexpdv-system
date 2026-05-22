import { BrowserWindow, app, nativeTheme } from "electron";
import fs from "node:fs";
import path from "node:path";
import { LocalDatabase } from "./localDatabase";
import { registerIpcHandlers } from "./ipc";
import { SyncEngine } from "./syncEngine";
import { resetLocalDataIfRequested } from "./devResetLocal";
import { registerAutoUpdate } from "./autoUpdateService";
import { ensureDefaultCloudApiConfig } from "./cloudApiConfig";

const bootstrapLogPath = path.join(process.cwd(), "electron-main.log");
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

if (isDev) {
  app.setPath("userData", path.join(process.cwd(), ".nexpdv-user-data"));
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch("disable-gpu");
  app.commandLine.appendSwitch("disable-gpu-compositing");
  app.commandLine.appendSwitch("disable-gpu-sandbox");
  app.commandLine.appendSwitch("disable-software-rasterizer");
  app.commandLine.appendSwitch("in-process-gpu");
}

const stringifyError = (error: unknown): string => {
  if (error instanceof Error) return `${error.name}: ${error.message}\n${error.stack ?? ""}`;
  return String(error);
};

const logMain = (message: string, error?: unknown): void => {
  const line = `[${new Date().toISOString()}] ${message}${error ? `\n${stringifyError(error)}` : ""}`;
  console.log(`[main] ${message}`);
  if (error) console.error(error);
  try {
    fs.appendFileSync(bootstrapLogPath, `${line}\n`);
  } catch {
    // Logging must never be the reason Electron fails to start.
  }
};

const getMainDir = (): string => {
  if (typeof __dirname === "string") return __dirname;
  return path.join(app.getAppPath(), "dist", "main");
};

const getAppRoot = (): string => path.resolve(getMainDir(), "../..");
const getPreloadPath = (): string => path.join(getMainDir(), "preload.cjs");
const getSplashPath = (): string => path.join(getAppRoot(), "build", "splash.html");
const getRendererIndexPath = (): string => path.join(getAppRoot(), "dist", "renderer", "index.html");

let mainWindow: BrowserWindow | undefined;
let splashWindow: BrowserWindow | undefined;
let syncEngine: SyncEngine | undefined;

const ensureFile = (label: string, filePath: string): void => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} nao encontrado: ${filePath}`);
  }
};

const createWindow = async (): Promise<void> => {
  logMain(`Bootstrap iniciado. cwd=${process.cwd()} mainDir=${getMainDir()}`);
  const cloudApiConfig = ensureDefaultCloudApiConfig();
  if (cloudApiConfig.error) {
    logMain(`Configuracao padrao da API Cloud nao foi criada: ${cloudApiConfig.filePath}`, cloudApiConfig.error);
  } else if (cloudApiConfig.permissionError) {
    logMain(`Configuracao da API Cloud criada/validada com alerta de permissao: ${cloudApiConfig.filePath}`, cloudApiConfig.permissionError);
  } else if (cloudApiConfig.created) {
    logMain(`Configuracao padrao da API Cloud criada: ${cloudApiConfig.filePath}`);
  }
  ensureFile("Preload", getPreloadPath());
  logMain(`Preload OK: ${getPreloadPath()}`);

  splashWindow = new BrowserWindow({
    width: 420,
    height: 320,
    frame: false,
    resizable: false,
    backgroundColor: "#111827",
    show: true
  });
  await splashWindow.loadFile(getSplashPath()).catch((error) => logMain(`Splash ignorado: ${getSplashPath()}`, error));

  nativeTheme.themeSource = "system";
  resetLocalDataIfRequested(logMain);
  logMain("Inicializando banco local.");
  const db = new LocalDatabase();
  await db.initialize();
  logMain("Banco local inicializado.");
  syncEngine = new SyncEngine(db);
  registerIpcHandlers(db, syncEngine);
  logMain("IPC registrado.");

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1180,
    minHeight: 760,
    title: "NexPDV",
    backgroundColor: "#F7F8FA",
    show: false,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    logMain(`Falha ao carregar renderer (${errorCode}) ${validatedURL}: ${errorDescription}`);
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    logMain(`Renderer encerrado: ${details.reason} exitCode=${details.exitCode}`);
  });
  mainWindow.webContents.on("preload-error", (_event, preloadPath, error) => {
    logMain(`Erro no preload: ${preloadPath}`, error);
  });

  mainWindow.once("ready-to-show", () => {
    splashWindow?.close();
    mainWindow?.show();
    logMain("Janela principal exibida.");
  });

  registerAutoUpdate({
    window: mainWindow,
    log: logMain,
    audit: (action, details) => db.recordAuditEvent({ action, actor: "Sistema", details })
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    logMain(`Carregando Vite dev server: ${process.env.VITE_DEV_SERVER_URL}`);
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    ensureFile("Renderer index.html", getRendererIndexPath());
    logMain(`Carregando renderer build: ${getRendererIndexPath()}`);
    await mainWindow.loadFile(getRendererIndexPath());
  }

  syncEngine.start(mainWindow);
  logMain("Sync engine iniciado.");
};

app.whenReady().then(createWindow).catch((error) => {
  logMain("Falha fatal no bootstrap do Electron.", error);
  app.quit();
});

process.on("uncaughtException", (error) => {
  logMain("Excecao nao tratada no processo main.", error);
  app.quit();
});

process.on("unhandledRejection", (reason) => {
  logMain("Promise rejeitada sem tratamento no processo main.", reason);
  app.quit();
});

app.on("before-quit", () => syncEngine?.stop());

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow().catch(console.error);
  }
});
