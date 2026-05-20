import { app, ipcMain } from "electron";
import type { LocalDatabase } from "./localDatabase";
import type { SyncEngine } from "./syncEngine";
import { assertLicensedModule, checkLocalLicense } from "./licenseService";
import { listThermalPrinters, openCashDrawer, printReceipt, printTestReceipt, type ReceiptPrintContext } from "./receiptPrinter";
import { renderQrSvgDataUrl } from "./qrCodeRenderer";
import { requestLocalResetOnNextStart } from "./devResetLocal";

interface ReceiptPrintRequest {
  html: string;
  context?: ReceiptPrintContext;
}

const printAuditLabel = (context?: ReceiptPrintContext): string => {
  if (context?.reason === "reprint") return "comprovante reimpresso";
  if (context?.reason === "test") return "teste impressao executado";
  return "comprovante impresso";
};

export const registerIpcHandlers = (db: LocalDatabase, sync: SyncEngine): void => {
  ipcMain.handle("dashboard:get", () => db.getDashboard());
  ipcMain.handle("products:list", (_event, query) => db.listProducts(query));
  ipcMain.handle("products:save", (_event, product) => db.upsertProduct(product));
  ipcMain.handle("products:stock-movement", (_event, input) => db.adjustProductStock(input));
  ipcMain.handle("products:stock-movements", (_event, productId?: string) => db.listProductStockMovements(productId));
  ipcMain.handle("products:categories", () => db.listCategories());
  ipcMain.handle("products:importCsv", (_event, csv: string) => db.importProductsFromCsv(csv));
  ipcMain.handle("customers:list", (_event, search: string) => db.listCustomers(search));
  ipcMain.handle("customers:save", (_event, customer) => db.upsertCustomer(customer));
  ipcMain.handle("customers:delete", (_event, customerId: string) => db.deleteCustomer(customerId));
  ipcMain.handle("customers:payment", (_event, input) => db.registerCustomerPayment(input.customerId, input.amount));
  ipcMain.handle("customers:open-summary", () => db.getCustomerOpenSummary());
  ipcMain.handle("sales:checkout", (_event, input) => db.checkoutSale(input));
  ipcMain.handle("sales:list", (_event, filters) => db.listSales(filters));
  ipcMain.handle("sales:cancel", (_event, input) =>
    typeof input === "string" ? db.cancelSale(input) : db.cancelSale(input.saleId, { login: input.login, password: input.password, pin: input.pin })
  );
  ipcMain.handle("sales:remove-cancelled", (_event, input) => db.removeCancelledSale(input.saleId, { login: input.login, password: input.password, pin: input.pin }));
  ipcMain.handle("sales:receipt", (_event, saleId: string) => db.getSaleReceiptHtml(saleId));
  ipcMain.handle("cash:current", () => db.getCurrentCashRegister());
  ipcMain.handle("cash:summary", () => db.getCashSummary());
  ipcMain.handle("cash:open", (_event, openingAmount: number) => db.openCashRegister(openingAmount));
  ipcMain.handle("cash:movement", (_event, input) => db.addCashMovement(input.type, input.description, input.amount));
  ipcMain.handle("cash:close", (_event, input) => db.closeCashRegister(input));
  ipcMain.handle("sync:status", () => sync.getStatus());
  ipcMain.handle("sync:flush", () => {
    assertLicensedModule(db, "cloud");
    return sync.flush();
  });
  ipcMain.handle("license:check", () => checkLocalLicense(db));
  ipcMain.handle("auth:state", () => db.getAuthState());
  ipcMain.handle("auth:login", (_event, input) => db.login(input));
  ipcMain.handle("auth:logout", (_event, sessionId?: string) => db.logout(sessionId));
  ipcMain.handle("auth:lock", () => db.lockSession());
  ipcMain.handle("auth:unlock", (_event, input) => db.unlockSession(input));
  ipcMain.handle("auth:switch-operator", (_event, input) => db.switchOperator(input));
  ipcMain.handle("auth:authorize", (_event, input) => db.authorizeCredential(input));
  ipcMain.handle("auth:security-settings", () => db.getAuthState().settings);
  ipcMain.handle("auth:save-security-settings", (_event, input) => db.saveSecuritySettings(input));
  ipcMain.handle("auth:save-user", (_event, input) => db.saveUser(input));
  ipcMain.handle("auth:set-user-active", (_event, input) => db.setUserActive(input.userId, input.active));
  ipcMain.handle("auth:reset-password", (_event, input) => db.resetUserPassword(input.userId, input.password));
  ipcMain.handle("auth:reset-pin", (_event, input) => db.resetUserPin(input.userId, input.pin));
  ipcMain.handle("auth:save-role", (_event, input) => db.saveRole(input));
  ipcMain.handle("auth:duplicate-role", (_event, roleId: string) => db.duplicateRole(roleId));
  ipcMain.handle("auth:set-role-active", (_event, input) => db.setRoleActive(input.roleId, input.active));
  ipcMain.handle("auth:reset-role-defaults", (_event, roleId: string) => db.resetRoleDefaults(roleId));
  ipcMain.handle("system:state", () => db.getSystemState());
  ipcMain.handle("system:activate", (_event, input) => db.activateSystem(input));
  ipcMain.handle("system:settings", (_event, input) => db.updateSettings(input));
  ipcMain.handle("system:cloud", (_event, input) => db.activateCloud(input));
  ipcMain.handle("system:company", (_event, input) => db.updateCompany(input));
  ipcMain.handle("system:manager", (_event, password: string) => db.validateManagerPassword(password));
  ipcMain.handle("system:authorize", (_event, input) => db.authorizeAction(input));
  ipcMain.handle("system:audit", () => db.listAudit());
  ipcMain.handle("system:audit-event", (_event, input) => db.recordAuditEvent(input));
  ipcMain.handle("system:security", () => db.listSecurity());
  ipcMain.handle("system:backup-state", () => db.getBackupState());
  ipcMain.handle("system:backup-export", () => db.exportLocalBackup());
  ipcMain.handle("system:backup-restore", (_event, filePath: string) => db.restoreLocalBackup(filePath));
  ipcMain.handle("system:reset-local", () => {
    if (!process.env.VITE_DEV_SERVER_URL) throw new Error("Reset local esta disponivel apenas em desenvolvimento.");
    const auth = db.getAuthState();
    if (!auth.user || !["owner", "admin"].includes(auth.user.role)) {
      throw new Error("Reset local exige usuario Dono ou Administrador em desenvolvimento.");
    }
    const markerPath = requestLocalResetOnNextStart();
    db.recordAuditEvent({ action: "reset instalacao local solicitado", actor: auth.user.name, details: markerPath });
    sync.stop();
    setTimeout(() => {
      app.relaunch();
      app.exit(0);
    }, 150);
    return { ok: true, restarting: true, markerPath };
  });
  ipcMain.handle("pix:config", () => db.getPixConfig());
  ipcMain.handle("pix:save-config", (_event, input) => db.savePixConfig(input));
  ipcMain.handle("pix:test-connection", () => db.testPixConnection());
  ipcMain.handle("pix:create-charge", (_event, input) => db.createPixCharge(input.amount, input.saleId));
  ipcMain.handle("pix:charge", (_event, input) => (typeof input === "string" ? db.getPixCharge(input, true) : db.getPixCharge(input.chargeId, input.refreshProvider ?? true)));
  ipcMain.handle("pix:cancel-charge", (_event, chargeId: string) => db.cancelPixCharge(chargeId));
  ipcMain.handle("pix:render-qr", (_event, payload: string) => ({ dataUrl: renderQrSvgDataUrl(payload) }));
  ipcMain.handle("pix:create-charge-mock", (_event, input) => db.createPixChargeMock(input.amount, input.saleId));
  ipcMain.handle("pix:charge-status-mock", (_event, chargeId: string) => db.getPixChargeStatusMock(chargeId));
  ipcMain.handle("pix:cancel-charge-mock", (_event, chargeId: string) => db.cancelPixChargeMock(chargeId));
  ipcMain.handle("pix:confirm-charge-mock", (_event, chargeId: string) => db.confirmPixChargeMock(chargeId));
  ipcMain.handle("pix:static-payload", () => db.generateStaticPixQrCodePayload());
  ipcMain.handle("pix:dynamic-payload-mock", (_event, input) => db.generateDynamicPixQrCodeMock(input.amount, input.saleId));
  ipcMain.handle("fiscal:config", () => db.getFiscalConfig());
  ipcMain.handle("fiscal:save-config", (_event, input) => db.saveFiscalConfig(input));
  ipcMain.handle("fiscal:validate-config", () => db.validateFiscalConfig());
  ipcMain.handle("fiscal:issue-nfce-mock", (_event, saleId: string) => db.issueNfceMock(saleId));
  ipcMain.handle("fiscal:cancel-document-mock", (_event, documentId: string) => db.cancelFiscalDocumentMock(documentId));
  ipcMain.handle("fiscal:status-mock", (_event, documentId: string) => db.getFiscalStatusMock(documentId));
  ipcMain.handle("printers:list", () => listThermalPrinters());
  ipcMain.handle("printers:test", async (_event, input?: { printerName?: string; widthMm?: 58 | 80 }) => {
    const settings = { ...db.getReceiptPrintSettings(), ...input };
    await printTestReceipt(settings);
    db.recordAuditEvent({ action: "teste impressao executado", details: settings.printerName || "impressora padrao" });
    return { ok: true };
  });
  ipcMain.handle("printers:open-drawer", async (_event, input?: { printerName?: string; widthMm?: 58 | 80 }) => {
    const settings = { ...db.getReceiptPrintSettings(), ...input };
    const result = await openCashDrawer(settings);
    db.recordAuditEvent({ action: "gaveta aberta", details: settings.printerName || "impressora padrao" });
    return result;
  });
  ipcMain.handle("receipt:print", async (_event, input: string | ReceiptPrintRequest) => {
    const html = typeof input === "string" ? input : input.html;
    const context = typeof input === "string" ? undefined : input.context;
    await printReceipt(html, db.getReceiptPrintSettings(), context);
    db.recordAuditEvent({
      action: printAuditLabel(context),
      details: context?.saleNumber || context?.saleId || db.getReceiptPrintSettings().printerName || "impressora padrao"
    });
    return { ok: true };
  });
};
