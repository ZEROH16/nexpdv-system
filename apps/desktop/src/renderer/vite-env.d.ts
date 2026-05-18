/// <reference types="vite/client" />

export {};

declare global {
  interface Window {
    nexpdv: {
      dashboard: { get: <T>() => Promise<T> };
      products: {
        list: <T>(query?: unknown) => Promise<T>;
        save: <T>(product: unknown) => Promise<T>;
        stockMovement: <T>(input: unknown) => Promise<T>;
        stockMovements: <T>(productId?: string) => Promise<T>;
        categories: <T>() => Promise<T>;
        importCsv: <T>(csv: string) => Promise<T>;
      };
      customers: {
        list: <T>(search?: string) => Promise<T>;
        save: <T>(customer: unknown) => Promise<T>;
        delete: <T>(customerId: string) => Promise<T>;
        payment: <T>(input: unknown) => Promise<T>;
        openSummary: <T>() => Promise<T>;
      };
      sales: {
        checkout: <T>(input: unknown) => Promise<T>;
        list: <T>(filters?: unknown) => Promise<T>;
        cancel: <T>(input: unknown) => Promise<T>;
        removeCancelled: <T>(input: unknown) => Promise<T>;
        receipt: <T>(saleId: string) => Promise<T>;
      };
      cash: {
        current: <T>() => Promise<T>;
        summary: <T>() => Promise<T>;
        open: <T>(openingAmount: number) => Promise<T>;
        movement: <T>(input: unknown) => Promise<T>;
        close: <T>(input: unknown) => Promise<T>;
      };
      sync: {
        status: <T>() => Promise<T>;
        flush: <T>() => Promise<T>;
        onStatus: (callback: (state: unknown) => void) => () => void;
      };
      license: { check: <T>() => Promise<T> };
      auth: {
        state: <T>() => Promise<T>;
        login: <T>(input: unknown) => Promise<T>;
        logout: <T>(sessionId?: string) => Promise<T>;
        lock: <T>() => Promise<T>;
        unlock: <T>(input: unknown) => Promise<T>;
        switchOperator: <T>(input: unknown) => Promise<T>;
        authorize: <T>(input: unknown) => Promise<T>;
        securitySettings: <T>() => Promise<T>;
        saveSecuritySettings: <T>(input: unknown) => Promise<T>;
        saveUser: <T>(input: unknown) => Promise<T>;
        setUserActive: <T>(input: unknown) => Promise<T>;
        resetPassword: <T>(input: unknown) => Promise<T>;
        resetPin: <T>(input: unknown) => Promise<T>;
        saveRole: <T>(input: unknown) => Promise<T>;
        duplicateRole: <T>(roleId: string) => Promise<T>;
        setRoleActive: <T>(input: unknown) => Promise<T>;
        resetRoleDefaults: <T>(roleId: string) => Promise<T>;
      };
      system: {
        state: <T>() => Promise<T>;
        activate: <T>(input: unknown) => Promise<T>;
        settings: <T>(input: unknown) => Promise<T>;
        cloud: <T>(input: unknown) => Promise<T>;
        company: <T>(input: unknown) => Promise<T>;
        manager: <T>(password: string) => Promise<T>;
        authorize: <T>(input: unknown) => Promise<T>;
        audit: <T>() => Promise<T>;
        auditEvent: <T>(input: unknown) => Promise<T>;
        security: <T>() => Promise<T>;
        backupState: <T>() => Promise<T>;
        backupExport: <T>() => Promise<T>;
        backupRestore: <T>(filePath: string) => Promise<T>;
      };
      pix: {
        config: <T>() => Promise<T>;
        saveConfig: <T>(input: unknown) => Promise<T>;
        testConnection: <T>() => Promise<T>;
        createCharge: <T>(input: unknown) => Promise<T>;
        charge: <T>(input: unknown) => Promise<T>;
        cancelCharge: <T>(chargeId: string) => Promise<T>;
        renderQr: <T>(payload: string) => Promise<T>;
        createChargeMock: <T>(input: unknown) => Promise<T>;
        chargeStatusMock: <T>(chargeId: string) => Promise<T>;
        cancelChargeMock: <T>(chargeId: string) => Promise<T>;
        confirmChargeMock: <T>(chargeId: string) => Promise<T>;
        staticPayload: <T>() => Promise<T>;
        dynamicPayloadMock: <T>(input: unknown) => Promise<T>;
      };
      fiscal: {
        config: <T>() => Promise<T>;
        saveConfig: <T>(input: unknown) => Promise<T>;
        validateConfig: <T>() => Promise<T>;
        issueNfceMock: <T>(saleId: string) => Promise<T>;
        cancelDocumentMock: <T>(documentId: string) => Promise<T>;
        statusMock: <T>(documentId: string) => Promise<T>;
      };
      printers: {
        list: <T>() => Promise<T>;
        test: <T>(input?: unknown) => Promise<T>;
        openDrawer: <T>(input?: unknown) => Promise<T>;
      };
      receipt: { print: <T>(input: unknown) => Promise<T> };
    };
  }
}
