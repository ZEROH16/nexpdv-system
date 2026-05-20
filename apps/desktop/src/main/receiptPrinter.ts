import { BrowserWindow, type WebContentsPrintOptions } from "electron";
import fs from "node:fs";

export interface ThermalPrinterInfo {
  name: string;
  displayName: string;
  description?: string;
}

export interface ReceiptPrintSettings {
  printerName?: string;
  widthMm: 58 | 80;
}

export interface ReceiptPrintContext {
  saleId?: string;
  saleNumber?: string;
  reason?: "sale" | "reprint" | "test";
}

const receiptWindowWidth = (widthMm: 58 | 80) => (widthMm === 58 ? 360 : 460);
const receiptPageWidthMicrons = (widthMm: 58 | 80) => widthMm * 1000;

const createHiddenWindow = (widthMm: 58 | 80): BrowserWindow =>
  new BrowserWindow({
    show: false,
    width: receiptWindowWidth(widthMm),
    height: 900,
    webPreferences: {
      sandbox: true
    }
  });

export const listThermalPrinters = async (): Promise<ThermalPrinterInfo[]> => {
  const probeWindow = createHiddenWindow(80);
  try {
    await probeWindow.loadURL("about:blank");
    const printers = await probeWindow.webContents.getPrintersAsync();
    return printers.map((printer) => ({
      name: printer.name,
      displayName: printer.displayName ?? printer.name,
      description: printer.description ?? ""
    }));
  } finally {
    if (!probeWindow.isDestroyed()) probeWindow.close();
  }
};

export const buildEscPosDrawerPulse = (): Buffer => Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]);

export const buildEscPosTextTicket = (text: string): Buffer =>
  Buffer.concat([
    Buffer.from([0x1b, 0x40]),
    Buffer.from(text.replace(/\r?\n/g, "\r\n"), "latin1"),
    Buffer.from("\r\n\r\n\r\n", "latin1"),
    Buffer.from([0x1d, 0x56, 0x00])
  ]);

const tryRawEscPos = (printerName: string | undefined, payload: Buffer): boolean => {
  if (!printerName || !printerName.startsWith("\\\\")) return false;
  try {
    fs.writeFileSync(printerName, payload);
    return true;
  } catch {
    return false;
  }
};

const resolvePrinterName = (configuredPrinter?: string): string | undefined => configuredPrinter?.trim() || undefined;

export const printReceipt = async (receiptHtml: string, settings: ReceiptPrintSettings, context: ReceiptPrintContext = {}): Promise<void> => {
  const printerName = resolvePrinterName(settings.printerName);
  const widthMm = settings.widthMm === 58 ? 58 : 80;
  const printWindow = createHiddenWindow(widthMm);

  try {
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(receiptHtml)}`);
    const options: WebContentsPrintOptions = {
      silent: true,
      ...(printerName ? { deviceName: printerName } : {}),
      printBackground: true,
      margins: { marginType: "none" },
      pageSize: {
        width: receiptPageWidthMicrons(widthMm),
        height: 297000
      }
    };
    await new Promise<void>((resolve, reject) => {
      printWindow.webContents.print(options, (success, reason) => {
        success ? resolve() : reject(new Error(reason || `Nao foi possivel imprimir em ${printerName}.`));
      });
    });
  } finally {
    if (!printWindow.isDestroyed()) printWindow.close();
  }

  if (context.reason === "test") return;
};

export const printTestReceipt = async (settings: ReceiptPrintSettings): Promise<void> => {
  const widthMm = settings.widthMm === 58 ? 58 : 80;
  const html = `<!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <style>
          @page { size: ${widthMm}mm auto; margin: 0; }
          body { width: ${widthMm}mm; margin: 0; padding: 12px; font-family: Arial, sans-serif; color: #111827; font-size: ${widthMm === 58 ? 11 : 12}px; }
          h1 { margin: 0 0 8px; text-align: center; font-size: ${widthMm === 58 ? 15 : 18}px; }
          .sep { border-top: 1px dashed #9CA3AF; margin: 10px 0; }
          .line { display: flex; justify-content: space-between; }
          .center { text-align: center; }
        </style>
      </head>
      <body>
        <h1>NexPDV</h1>
        <div class="center">Teste de impressao termica</div>
        <div class="sep"></div>
        <div class="line"><span>Largura</span><strong>${widthMm}mm</strong></div>
        <div class="line"><span>Data</span><strong>${new Date().toLocaleString("pt-BR")}</strong></div>
        <div class="sep"></div>
        <div class="center">Comprovante nao fiscal</div>
      </body>
    </html>`;
  await printReceipt(html, settings, { reason: "test" });
};

export const openCashDrawer = async (settings: ReceiptPrintSettings): Promise<{ ok: true; mode: "escpos" }> => {
  const printerName = await resolvePrinterName(settings.printerName);
  if (!printerName) {
    throw new Error("Selecione uma impressora ESC/POS em Configuracoes > Backup > Cupom para abrir a gaveta.");
  }
  const sent = tryRawEscPos(printerName, buildEscPosDrawerPulse());
  if (!sent) {
    throw new Error("Abertura de gaveta exige impressora ESC/POS compartilhada em caminho de rede. A impressao por Electron continua disponivel.");
  }
  return { ok: true, mode: "escpos" };
};
