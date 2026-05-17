import { BrowserWindow } from "electron";

export const printReceipt = async (receiptHtml: string): Promise<void> => {
  const printWindow = new BrowserWindow({
    show: false,
    width: 320,
    height: 640,
    webPreferences: {
      sandbox: true
    }
  });

  await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(receiptHtml)}`);
  await new Promise<void>((resolve, reject) => {
    printWindow.webContents.print({ silent: false, printBackground: true }, (success, reason) => {
      printWindow.close();
      success ? resolve() : reject(new Error(reason || "Impressao cancelada."));
    });
  });
};
