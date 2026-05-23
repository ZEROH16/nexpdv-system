import { contextBridge, ipcRenderer } from "electron";

const invoke = <T>(channel: string, payload?: unknown): Promise<T> => ipcRenderer.invoke(channel, payload);

contextBridge.exposeInMainWorld("nexpdv", {
  dashboard: {
    get: () => invoke("dashboard:get")
  },
  products: {
    list: (query: unknown) => invoke("products:list", query),
    save: (product: unknown) => invoke("products:save", product),
    stockMovement: (input: unknown) => invoke("products:stock-movement", input),
    stockMovements: (productId?: string) => invoke("products:stock-movements", productId),
    categories: () => invoke("products:categories"),
    importCsv: (csv: string) => invoke("products:importCsv", csv)
  },
  customers: {
    list: (search?: string) => invoke("customers:list", search ?? ""),
    save: (customer: unknown) => invoke("customers:save", customer),
    delete: (customerId: string) => invoke("customers:delete", customerId),
    payment: (input: unknown) => invoke("customers:payment", input),
    openSummary: () => invoke("customers:open-summary")
  },
  sales: {
    checkout: (input: unknown) => invoke("sales:checkout", input),
    list: (filters: unknown) => invoke("sales:list", filters),
    cancel: (input: unknown) => invoke("sales:cancel", input),
    removeCancelled: (input: unknown) => invoke("sales:remove-cancelled", input),
    receipt: (saleId: string) => invoke("sales:receipt", saleId)
  },
  cash: {
    current: () => invoke("cash:current"),
    summary: () => invoke("cash:summary"),
    open: (openingAmount: number) => invoke("cash:open", openingAmount),
    movement: (input: unknown) => invoke("cash:movement", input),
    close: (input: unknown) => invoke("cash:close", input)
  },
  sync: {
    status: () => invoke("sync:status"),
    flush: () => invoke("sync:flush"),
    onStatus: (callback: (state: unknown) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, state: unknown) => callback(state);
      ipcRenderer.on("sync:status", listener);
      return () => ipcRenderer.removeListener("sync:status", listener);
    }
  },
  updates: {
    status: () => invoke("updates:status"),
    check: () => invoke("updates:check"),
    download: () => invoke("updates:download"),
    install: () => invoke("updates:install"),
    remindLater: () => invoke("updates:remind-later"),
    onStatus: (callback: (state: unknown) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, state: unknown) => callback(state);
      ipcRenderer.on("updates:status", listener);
      return () => ipcRenderer.removeListener("updates:status", listener);
    }
  },
  license: {
    check: () => invoke("license:check"),
    validate: () => invoke("license:validate"),
    onStatus: (callback: (state: unknown) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, state: unknown) => callback(state);
      ipcRenderer.on("license:status", listener);
      return () => ipcRenderer.removeListener("license:status", listener);
    }
  },
  auth: {
    state: () => invoke("auth:state"),
    login: (input: unknown) => invoke("auth:login", input),
    logout: (sessionId?: string) => invoke("auth:logout", sessionId),
    lock: () => invoke("auth:lock"),
    unlock: (input: unknown) => invoke("auth:unlock", input),
    switchOperator: (input: unknown) => invoke("auth:switch-operator", input),
    authorize: (input: unknown) => invoke("auth:authorize", input),
    securitySettings: () => invoke("auth:security-settings"),
    saveSecuritySettings: (input: unknown) => invoke("auth:save-security-settings", input),
    saveUser: (input: unknown) => invoke("auth:save-user", input),
    setUserActive: (input: unknown) => invoke("auth:set-user-active", input),
    resetPassword: (input: unknown) => invoke("auth:reset-password", input),
    resetPin: (input: unknown) => invoke("auth:reset-pin", input),
    saveRole: (input: unknown) => invoke("auth:save-role", input),
    duplicateRole: (roleId: string) => invoke("auth:duplicate-role", roleId),
    setRoleActive: (input: unknown) => invoke("auth:set-role-active", input),
    resetRoleDefaults: (roleId: string) => invoke("auth:reset-role-defaults", roleId)
  },
  system: {
    state: () => invoke("system:state"),
    activate: (input: unknown) => invoke("system:activate", input),
    createOwnerAccess: (input: unknown) => invoke("system:create-owner-access", input),
    settings: (input: unknown) => invoke("system:settings", input),
    cloud: (input: unknown) => invoke("system:cloud", input),
    company: (input: unknown) => invoke("system:company", input),
    manager: (password: string) => invoke("system:manager", password),
    authorize: (input: unknown) => invoke("system:authorize", input),
    audit: () => invoke("system:audit"),
    auditEvent: (input: unknown) => invoke("system:audit-event", input),
    security: () => invoke("system:security"),
    backupState: () => invoke("system:backup-state"),
    backupExport: () => invoke("system:backup-export"),
    backupRestore: (filePath: string) => invoke("system:backup-restore", filePath),
    openExternal: (url: string) => invoke("system:open-external", url),
    copyText: (text: string) => invoke("system:copy-text", text),
    cloudApiStatus: () => invoke("cloud-api:status"),
    cloudApiTest: (input?: unknown) => invoke("cloud-api:test", input),
    cloudApiSave: (input: unknown) => invoke("cloud-api:save", input),
    cloudApiReset: (input: unknown) => invoke("cloud-api:reset", input),
    resetLocal: () => invoke("system:reset-local")
  },
  pix: {
    config: () => invoke("pix:config"),
    saveConfig: (input: unknown) => invoke("pix:save-config", input),
    testConnection: () => invoke("pix:test-connection"),
    createCharge: (input: unknown) => invoke("pix:create-charge", input),
    charge: (input: unknown) => invoke("pix:charge", input),
    cancelCharge: (chargeId: string) => invoke("pix:cancel-charge", chargeId),
    renderQr: (payload: string) => invoke("pix:render-qr", payload),
    createChargeMock: (input: unknown) => invoke("pix:create-charge-mock", input),
    chargeStatusMock: (chargeId: string) => invoke("pix:charge-status-mock", chargeId),
    cancelChargeMock: (chargeId: string) => invoke("pix:cancel-charge-mock", chargeId),
    confirmChargeMock: (chargeId: string) => invoke("pix:confirm-charge-mock", chargeId),
    staticPayload: () => invoke("pix:static-payload"),
    dynamicPayloadMock: (input: unknown) => invoke("pix:dynamic-payload-mock", input)
  },
  fiscal: {
    config: () => invoke("fiscal:config"),
    saveConfig: (input: unknown) => invoke("fiscal:save-config", input),
    validateConfig: () => invoke("fiscal:validate-config"),
    issueNfceMock: (saleId: string) => invoke("fiscal:issue-nfce-mock", saleId),
    cancelDocumentMock: (documentId: string) => invoke("fiscal:cancel-document-mock", documentId),
    statusMock: (documentId: string) => invoke("fiscal:status-mock", documentId)
  },
  printers: {
    list: () => invoke("printers:list"),
    test: (input: unknown) => invoke("printers:test", input),
    openDrawer: (input: unknown) => invoke("printers:open-drawer", input)
  },
  receipt: {
    print: (input: unknown) => invoke("receipt:print", input)
  }
});
