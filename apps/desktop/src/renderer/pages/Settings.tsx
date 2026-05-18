import { DatabaseBackup, HelpCircle, KeyRound, Moon, RefreshCcw, ShieldCheck, Smartphone, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import type { Company, FiscalConfig, PixConfig } from "@nexpdv/shared";
import { Button } from "@/components/Button";
import { StatusBadge } from "@/components/StatusBadge";
import { useAsync } from "@/hooks/useAsync";
import { desktopApi } from "@/services/desktopApi";
import type { SecuritySettings } from "@/services/desktopApi";

type SettingsTab = "company" | "license" | "backup" | "pix" | "fiscal" | "security" | "support";

const tabs: Array<{ id: SettingsTab; label: string }> = [
  { id: "company", label: "Empresa" },
  { id: "license", label: "Licenca" },
  { id: "backup", label: "Backup" },
  { id: "pix", label: "Pix" },
  { id: "fiscal", label: "Fiscal" },
  { id: "security", label: "Seguranca" },
  { id: "support", label: "Suporte" }
];

const emptyPixForm: Partial<PixConfig> = {
  enabled: false,
  mode: "manual",
  key: "",
  keyType: "random",
  receiverName: "",
  city: "",
  provider: "mock",
  environment: "sandbox",
  apiKey: "",
  webhookUrl: ""
};

const emptyFiscalForm: Partial<FiscalConfig> = {
  enabled: false,
  environment: "homologation",
  uf: "",
  municipality: "",
  taxRegime: "",
  stateRegistration: "",
  csc: "",
  cscId: "",
  series: "1",
  nextNumber: 1,
  defaultCfop: "5102",
  defaultNcm: "",
  defaultCstCsosn: "",
  certificatePath: "",
  certificatePassword: "",
  provider: "",
  apiKey: ""
};

const LockedFeature = ({ title }: { title: string }) => (
  <section className="panel p-6">
    <div className="flex items-start gap-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-ink dark:bg-slate-900 dark:text-white">
        <KeyRound size={22} />
      </div>
      <div>
        <h2 className="text-xl font-black">{title}</h2>
        <p className="mt-2 text-sm text-slate-500">Recurso disponivel no plano Pro/Cloud. A base tecnica ja esta preparada para ativacao futura pela licenca.</p>
      </div>
    </div>
  </section>
);

export const Settings = () => {
  const [tab, setTab] = useState<SettingsTab>("company");
  const [dark, setDark] = useState(true);
  const [companyForm, setCompanyForm] = useState<Partial<Company>>({});
  const [licenseForm, setLicenseForm] = useState({ ownerEmail: "", licenseKey: "", companyName: "" });
  const [cloudForm, setCloudForm] = useState({ cloudKey: "", ownerEmail: "" });
  const [backupForm, setBackupForm] = useState({
    backupPath: "",
    restorePath: "",
    automaticBackupEnabled: false,
    allowSalesWithoutCashRegister: false,
    blockNegativeStock: true,
    receiptWidthMm: 80 as 58 | 80,
    receiptPrinterName: "",
    receiptFooterMessage: "Obrigado pela preferencia.",
    receiptAutoPrint: true
  });
  const [pixForm, setPixForm] = useState<Partial<PixConfig>>(emptyPixForm);
  const [fiscalForm, setFiscalForm] = useState<Partial<FiscalConfig>>(emptyFiscalForm);
  const [securityForm, setSecurityForm] = useState<SecuritySettings>({
    requireLoginOnStart: true,
    allowQuickPin: true,
    requireManagerAuthorization: true,
    allowMultipleOperators: true,
    autoLockEnabled: false,
    autoLockMinutes: 15,
    sessionTimeoutMinutes: 480,
    rememberLastOperator: true
  });
  const [syncMessage, setSyncMessage] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [pixTesting, setPixTesting] = useState(false);
  const { data: license, refresh: refreshLicense } = useAsync(() => desktopApi.license.check(), []);
  const { data: systemState, refresh: refreshSystem } = useAsync(() => desktopApi.system.state(), []);
  const { data: backupState, refresh: refreshBackup } = useAsync(() => desktopApi.system.backupState(), []);
  const { data: pixConfig, refresh: refreshPix } = useAsync(() => desktopApi.pix.getPixConfig(), []);
  const { data: fiscalConfig, refresh: refreshFiscal } = useAsync(() => desktopApi.fiscal.getFiscalConfig(), []);
  const { data: security } = useAsync(() => desktopApi.system.security(), []);
  const { data: securitySettings, refresh: refreshSecuritySettings } = useAsync(() => desktopApi.auth.securitySettings(), []);
  const { data: printers, error: printersError, refresh: refreshPrinters } = useAsync(() => desktopApi.printers.list(), []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  useEffect(() => {
    if (systemState?.company) {
      setCompanyForm(systemState.company);
      setCloudForm((current) => ({ ...current, ownerEmail: systemState.company.ownerEmail ?? "" }));
      setLicenseForm((current) => ({
        ownerEmail: current.ownerEmail || systemState.license?.ownerEmail || systemState.company.ownerEmail || "",
        licenseKey: current.licenseKey || systemState.license?.key || "",
        companyName: current.companyName || systemState.company.tradeName || systemState.company.name || ""
      }));
      setBackupForm((current) => ({
        ...current,
        backupPath: systemState.backupPath ?? current.backupPath,
        automaticBackupEnabled: systemState.automaticBackupEnabled ?? false,
        allowSalesWithoutCashRegister: systemState.allowSalesWithoutCashRegister ?? false,
        blockNegativeStock: systemState.blockNegativeStock ?? true,
        receiptWidthMm: systemState.receiptWidthMm ?? 80,
        receiptPrinterName: systemState.receiptPrinterName ?? "",
        receiptFooterMessage: systemState.receiptFooterMessage ?? current.receiptFooterMessage,
        receiptAutoPrint: systemState.receiptAutoPrint ?? true
      }));
    }
  }, [systemState]);

  useEffect(() => {
    if (backupState) {
      setBackupForm((current) => ({
        ...current,
        backupPath: backupState.backupPath,
        automaticBackupEnabled: backupState.automaticBackupEnabled
      }));
    }
  }, [backupState]);

  useEffect(() => {
    if (pixConfig) setPixForm(pixConfig);
  }, [pixConfig]);

  useEffect(() => {
    if (fiscalConfig) setFiscalForm(fiscalConfig);
  }, [fiscalConfig]);

  useEffect(() => {
    if (securitySettings) setSecurityForm(securitySettings);
  }, [securitySettings]);

  const cloudEnabled = Boolean(license?.features?.cloud ?? systemState?.cloudEnabled);
  const pixEnabled = Boolean(license?.features?.pix ?? license?.pixEnabled);
  const fiscalEnabled = Boolean(license?.features?.fiscal ?? license?.fiscalEnabled);

  const saveCompany = async () => {
    try {
      const saved = await desktopApi.system.company(companyForm);
      setCompanyForm(saved);
      setMessage("Empresa salva.");
      refreshSystem();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel salvar a empresa.");
    }
  };

  const activateLicense = async () => {
    try {
      await desktopApi.system.activate(licenseForm);
      setMessage("Licenca ativada e salva localmente.");
      refreshSystem();
      refreshLicense();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel ativar a licenca.");
    }
  };

  const activateCloud = async () => {
    try {
      await desktopApi.system.cloud(cloudForm);
      setMessage("Modo Cloud ativado.");
      refreshSystem();
      refreshLicense();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel ativar o Cloud.");
    }
  };

  const syncNow = async () => {
    try {
      const state = await desktopApi.sync.flush();
      setSyncMessage(state.lastError ?? `${state.pending} itens pendentes.`);
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "Nao foi possivel sincronizar.");
    }
  };

  const saveCoreSettings = async () => {
    try {
      await desktopApi.system.settings({
        backupPath: backupForm.backupPath,
        automaticBackupEnabled: backupForm.automaticBackupEnabled,
        allowSalesWithoutCashRegister: backupForm.allowSalesWithoutCashRegister,
        blockNegativeStock: backupForm.blockNegativeStock,
        receiptWidthMm: backupForm.receiptWidthMm,
        receiptPrinterName: backupForm.receiptPrinterName,
        receiptFooterMessage: backupForm.receiptFooterMessage,
        receiptAutoPrint: backupForm.receiptAutoPrint
      });
      setMessage("Configuracoes salvas.");
      refreshSystem();
      refreshBackup();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel salvar as configuracoes.");
    }
  };

  const testPrint = async () => {
    try {
      await desktopApi.printers.test({ printerName: backupForm.receiptPrinterName, widthMm: backupForm.receiptWidthMm });
      setMessage("Teste de impressao enviado para a impressora.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel testar a impressao.");
    }
  };

  const openDrawer = async () => {
    try {
      await desktopApi.printers.openDrawer({ printerName: backupForm.receiptPrinterName, widthMm: backupForm.receiptWidthMm });
      setMessage("Comando de abertura da gaveta enviado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel abrir a gaveta.");
    }
  };

  const exportBackup = async () => {
    try {
      const result = await desktopApi.system.backupExport();
      setMessage(`Backup exportado em: ${result.filePath}`);
      refreshBackup();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel exportar o backup.");
    }
  };

  const restoreBackup = async () => {
    try {
      await desktopApi.system.backupRestore(backupForm.restorePath);
      setMessage("Backup restaurado. Reinicie o app para garantir que todas as telas recarreguem os dados.");
      refreshSystem();
      refreshBackup();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel restaurar o backup.");
    }
  };

  const savePix = async () => {
    try {
      await desktopApi.pix.savePixConfig(pixForm);
      setMessage("Configuracao Pix salva.");
      refreshPix();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel salvar o Pix.");
    }
  };

  const testPix = async () => {
    setPixTesting(true);
    try {
      await desktopApi.pix.savePixConfig(pixForm);
      const result = await desktopApi.pix.testConnection();
      setMessage(`Teste Pix: ${result.message}`);
      refreshPix();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel testar o Pix.");
    } finally {
      setPixTesting(false);
    }
  };

  const saveFiscal = async () => {
    try {
      await desktopApi.fiscal.saveFiscalConfig(fiscalForm);
      setMessage("Configuracao fiscal salva.");
      refreshFiscal();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel salvar o Fiscal.");
    }
  };

  const testFiscal = async () => {
    try {
      const result = await desktopApi.fiscal.validateFiscalConfig();
      setMessage(result.valid ? "Teste fiscal executado. Configuracao mock valida." : `Teste fiscal executado: ${result.errors.join(" ")}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel testar o Fiscal.");
    }
  };

  const saveSecurity = async () => {
    await desktopApi.auth.saveSecuritySettings(securityForm);
    setMessage("Configuracoes de seguranca salvas.");
    refreshSecuritySettings();
  };

  return (
    <div className="space-y-6">
      <section className="panel p-3">
        <div className="flex flex-wrap gap-2">
          {tabs.map((item) => (
            <button
              key={item.id}
              className={`h-10 rounded-lg px-4 text-sm font-bold transition ${
                tab === item.id ? "bg-ink text-white dark:bg-white dark:text-ink" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"
              }`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      {tab === "company" ? (
        <section className="panel p-5">
          <h2 className="text-lg font-black">Cadastro da empresa</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="text-sm font-semibold">Nome fantasia<input className="field mt-1 w-full" value={companyForm.tradeName ?? ""} onChange={(event) => setCompanyForm({ ...companyForm, tradeName: event.target.value })} /></label>
            <label className="text-sm font-semibold">Razao social<input className="field mt-1 w-full" value={companyForm.legalName ?? companyForm.name ?? ""} onChange={(event) => setCompanyForm({ ...companyForm, legalName: event.target.value, name: event.target.value })} /></label>
            <label className="text-sm font-semibold">CNPJ/CPF<input className="field mt-1 w-full" value={companyForm.document ?? ""} onChange={(event) => setCompanyForm({ ...companyForm, document: event.target.value })} /></label>
            <label className="text-sm font-semibold">Inscricao estadual<input className="field mt-1 w-full" value={companyForm.stateRegistration ?? ""} onChange={(event) => setCompanyForm({ ...companyForm, stateRegistration: event.target.value })} /></label>
            <label className="text-sm font-semibold">Telefone<input className="field mt-1 w-full" value={companyForm.phone ?? ""} onChange={(event) => setCompanyForm({ ...companyForm, phone: event.target.value })} /></label>
            <label className="text-sm font-semibold">WhatsApp<input className="field mt-1 w-full" value={companyForm.whatsapp ?? ""} onChange={(event) => setCompanyForm({ ...companyForm, whatsapp: event.target.value })} /></label>
            <label className="text-sm font-semibold">Email<input className="field mt-1 w-full" value={companyForm.email ?? ""} onChange={(event) => setCompanyForm({ ...companyForm, email: event.target.value })} /></label>
            <label className="text-sm font-semibold">CEP<input className="field mt-1 w-full" value={companyForm.zipCode ?? ""} onChange={(event) => setCompanyForm({ ...companyForm, zipCode: event.target.value })} /></label>
            <label className="col-span-2 text-sm font-semibold">Endereco completo<input className="field mt-1 w-full" value={companyForm.address ?? ""} onChange={(event) => setCompanyForm({ ...companyForm, address: event.target.value })} /></label>
            <label className="text-sm font-semibold">Cidade<input className="field mt-1 w-full" value={companyForm.city ?? ""} onChange={(event) => setCompanyForm({ ...companyForm, city: event.target.value })} /></label>
            <label className="text-sm font-semibold">Estado<input className="field mt-1 w-full" value={companyForm.state ?? ""} onChange={(event) => setCompanyForm({ ...companyForm, state: event.target.value })} /></label>
            <label className="col-span-2 text-sm font-semibold">Logo da empresa<input className="field mt-1 w-full" placeholder="URL ou caminho local" value={companyForm.logoUrl ?? ""} onChange={(event) => setCompanyForm({ ...companyForm, logoUrl: event.target.value })} /></label>
          </div>
          <Button className="mt-5" onClick={saveCompany}>Salvar empresa</Button>
        </section>
      ) : null}

      {tab === "license" ? (
        <section className="panel p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black">Licenca</h2>
            <ShieldCheck size={20} />
          </div>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between"><span>Chave</span><strong>{license?.key || "Nao ativada"}</strong></div>
            <div className="flex items-center justify-between"><span>Status</span><StatusBadge tone={license?.valid ? "green" : "red"}>{license?.status ?? "missing"}</StatusBadge></div>
            <div className="flex items-center justify-between"><span>Plano</span><strong>{license?.planLabel ?? "Nao ativado"}</strong></div>
            <div className="flex items-center justify-between"><span>Validade</span><strong>{license?.validUntil ? new Date(license.validUntil).toLocaleDateString("pt-BR") : "-"}</strong></div>
            <div className="flex items-center justify-between"><span>Validacao</span><strong>{license?.validationMode === "online" ? "Online" : "Local offline-first"}</strong></div>
            <div className="grid grid-cols-5 gap-2 pt-2">
              {[
                ["Cloud", cloudEnabled],
                ["Fiscal", fiscalEnabled],
                ["Pix", pixEnabled],
                ["Mobile", license?.features?.mobile ?? license?.mobileEnabled],
                ["Intelligence", license?.features?.intelligence ?? license?.intelligenceEnabled]
              ].map(([label, enabled]) => (
                <div key={String(label)} className="rounded-lg bg-slate-50 px-3 py-3 text-center dark:bg-slate-950">
                  <div className="mb-2 font-bold">{label}</div>
                  <StatusBadge tone={enabled ? "green" : "slate"}>{enabled ? "Ativo" : "Bloqueado"}</StatusBadge>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
              <h3 className="font-bold">Ativar ou trocar licenca</h3>
              <div className="mt-3 grid grid-cols-[1fr_1fr_1fr_auto] gap-3">
                <input className="field" placeholder="Email do dono" value={licenseForm.ownerEmail} onChange={(event) => setLicenseForm({ ...licenseForm, ownerEmail: event.target.value })} />
                <input className="field uppercase" placeholder="Chave de ativacao" value={licenseForm.licenseKey} onChange={(event) => setLicenseForm({ ...licenseForm, licenseKey: event.target.value })} />
                <input className="field" placeholder="Nome do estabelecimento" value={licenseForm.companyName} onChange={(event) => setLicenseForm({ ...licenseForm, companyName: event.target.value })} />
                <Button disabled={!licenseForm.ownerEmail || !licenseForm.licenseKey || !licenseForm.companyName} onClick={activateLicense}>Salvar licenca</Button>
              </div>
              <div className="mt-3 text-xs text-slate-500">Chaves locais: NEXPDV-OFFLINE-2026, NEXPDV-CLOUD-2026, NEXPDV-PRO-2026.</div>
            </div>
            {!cloudEnabled ? (
              <div className="mt-5 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                <h3 className="font-bold">Ativar modo Cloud</h3>
                <div className="mt-3 grid grid-cols-[1fr_1fr_auto] gap-3">
                  <input className="field" placeholder="Chave cloud" value={cloudForm.cloudKey} onChange={(event) => setCloudForm({ ...cloudForm, cloudKey: event.target.value })} />
                  <input className="field" placeholder="Email do dono" value={cloudForm.ownerEmail} onChange={(event) => setCloudForm({ ...cloudForm, ownerEmail: event.target.value })} />
                  <Button onClick={activateCloud}>Ativar cloud</Button>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {tab === "backup" ? (
        <section className="panel p-5">
          <h2 className="text-lg font-black">{cloudEnabled ? "Sincronizacao Cloud" : "Backup local"}</h2>
          <div className="mt-4 grid gap-4">
            <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-4 dark:bg-slate-950">
              <DatabaseBackup size={20} />
              <span className="text-sm font-semibold">{cloudEnabled ? "Cloud ativo com backup local complementar" : "Backup local ativo"}</span>
            </div>
            {cloudEnabled ? (
              <div className="rounded-lg bg-slate-50 p-4 text-sm dark:bg-slate-950">
                <Button onClick={syncNow}><RefreshCcw size={16} />Sincronizar</Button>
                <div className="mt-3">Status sincronizacao: {syncMessage ?? "Pronto"}</div>
              </div>
            ) : null}
            <label className="text-sm font-semibold">
              Caminho do backup
              <input className="field mt-1 w-full" value={backupForm.backupPath} onChange={(event) => setBackupForm({ ...backupForm, backupPath: event.target.value })} />
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={backupForm.automaticBackupEnabled} onChange={(event) => setBackupForm({ ...backupForm, automaticBackupEnabled: event.target.checked })} />
              Backup automatico diario
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={backupForm.allowSalesWithoutCashRegister} onChange={(event) => setBackupForm({ ...backupForm, allowSalesWithoutCashRegister: event.target.checked })} />
              Permitir venda com caixa fechado
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={backupForm.blockNegativeStock} onChange={(event) => setBackupForm({ ...backupForm, blockNegativeStock: event.target.checked })} />
              Bloquear estoque negativo
            </label>
            <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
              <h3 className="text-sm font-black uppercase text-slate-500">Cupom / comprovante</h3>
              <div className="mt-3 grid grid-cols-3 gap-3">
                <label className="col-span-3 text-sm font-semibold">
                  Impressora do cupom
                  <select
                    className="field mt-1 w-full"
                    value={backupForm.receiptPrinterName}
                    onChange={(event) => setBackupForm({ ...backupForm, receiptPrinterName: event.target.value })}
                  >
                    <option value="">Usar impressora padrao do Windows</option>
                    {(printers ?? []).map((printer) => (
                      <option key={printer.name} value={printer.name}>
                        {printer.displayName || printer.name}{printer.isDefault ? " (padrao)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-semibold">
                  Largura
                  <select className="field mt-1 w-full" value={backupForm.receiptWidthMm} onChange={(event) => setBackupForm({ ...backupForm, receiptWidthMm: Number(event.target.value) as 58 | 80 })}>
                    <option value={58}>58mm</option>
                    <option value={80}>80mm</option>
                  </select>
                </label>
                <label className="col-span-2 text-sm font-semibold">
                  Mensagem de rodape
                  <input className="field mt-1 w-full" value={backupForm.receiptFooterMessage} onChange={(event) => setBackupForm({ ...backupForm, receiptFooterMessage: event.target.value })} />
                </label>
                <label className="col-span-3 flex items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" checked={backupForm.receiptAutoPrint} onChange={(event) => setBackupForm({ ...backupForm, receiptAutoPrint: event.target.checked })} />
                  Imprimir automaticamente ao finalizar venda
                </label>
                <div className="col-span-3 flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => refreshPrinters()}><RefreshCcw size={16} />Atualizar impressoras</Button>
                  <Button variant="secondary" onClick={testPrint}>Testar impressao</Button>
                  <Button variant="secondary" onClick={openDrawer}>Abrir gaveta</Button>
                </div>
                <div className="col-span-3 text-xs text-slate-500">
                  {printersError ? printersError : `${printers?.length ?? 0} impressora(s) detectada(s). A gaveta usa ESC/POS raw quando a impressora estiver compartilhada em caminho de rede.`}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={saveCoreSettings}>Salvar backup/core</Button>
              <Button onClick={exportBackup}>Exportar backup</Button>
            </div>
            <input className="field" placeholder="Caminho do arquivo para restaurar" value={backupForm.restorePath} onChange={(event) => setBackupForm({ ...backupForm, restorePath: event.target.value })} />
            <Button variant="danger" disabled={!backupForm.restorePath} onClick={restoreBackup}>Restaurar backup</Button>
            <div className="text-xs text-slate-500">Ultimo backup: {backupState?.lastBackupAt ? new Date(backupState.lastBackupAt).toLocaleString("pt-BR") : "ainda nao realizado"}</div>
          </div>
        </section>
      ) : null}

      {tab === "pix" ? (
        pixEnabled ? (
          <section className="panel p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black">Pix</h2>
              <WalletCards size={20} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={pixForm.enabled ?? false} onChange={(event) => setPixForm({ ...pixForm, enabled: event.target.checked })} />Ativar Pix</label>
              <label className="text-sm font-semibold">Provider<select className="field mt-1 w-full" value={pixForm.provider ?? "mock"} onChange={(event) => setPixForm({ ...pixForm, provider: event.target.value })}><option value="mock">MOCK</option><option value="pagbank">PAGBANK</option></select></label>
              <label className="text-sm font-semibold">Tipo<select className="field mt-1 w-full" value={pixForm.mode ?? "manual"} onChange={(event) => setPixForm({ ...pixForm, mode: event.target.value as PixConfig["mode"] })}><option value="manual">Manual</option><option value="static_qr">QR estatico</option><option value="dynamic_qr">QR dinamico futuro</option></select></label>
              <label className="text-sm font-semibold">Ambiente<select className="field mt-1 w-full" value={pixForm.environment ?? "sandbox"} onChange={(event) => setPixForm({ ...pixForm, environment: event.target.value as PixConfig["environment"] })}><option value="sandbox">Sandbox</option><option value="production">Producao</option></select></label>
              <label className="text-sm font-semibold">Chave Pix<input className="field mt-1 w-full" value={pixForm.key ?? ""} onChange={(event) => setPixForm({ ...pixForm, key: event.target.value })} /></label>
              <label className="text-sm font-semibold">Tipo da chave<select className="field mt-1 w-full" value={pixForm.keyType ?? "random"} onChange={(event) => setPixForm({ ...pixForm, keyType: event.target.value as PixConfig["keyType"] })}><option value="cpf">CPF</option><option value="cnpj">CNPJ</option><option value="email">Email</option><option value="phone">Telefone</option><option value="random">Aleatoria</option></select></label>
              <label className="text-sm font-semibold">Nome do recebedor<input className="field mt-1 w-full" value={pixForm.receiverName ?? ""} onChange={(event) => setPixForm({ ...pixForm, receiverName: event.target.value })} /></label>
              <label className="text-sm font-semibold">Cidade<input className="field mt-1 w-full" value={pixForm.city ?? ""} onChange={(event) => setPixForm({ ...pixForm, city: event.target.value })} /></label>
              {pixForm.provider === "pagbank" ? (
                <label className="col-span-2 text-sm font-semibold">
                  Token PagBank
                  <input
                    className="field mt-1 w-full"
                    type="password"
                    value={pixForm.apiKey ?? ""}
                    placeholder="Token sandbox ou producao"
                    onChange={(event) => setPixForm({ ...pixForm, apiKey: event.target.value })}
                  />
                  <span className="mt-1 block text-xs text-slate-500">O token e mascarado na interface. Se estiver configurado por ambiente, ele sera usado sem aparecer aqui.</span>
                </label>
              ) : null}
              <label className="col-span-2 text-sm font-semibold">Webhook URL futura<input className="field mt-1 w-full" value={pixForm.webhookUrl ?? ""} onChange={(event) => setPixForm({ ...pixForm, webhookUrl: event.target.value })} /></label>
              <div className="col-span-2 rounded-lg bg-slate-50 p-4 text-sm dark:bg-slate-900">
                <div className="flex items-center justify-between">
                  <span className="font-bold">Status da conexao</span>
                  <StatusBadge tone={pixForm.connectionStatus === "connected" || pixForm.connectionStatus === "sandbox" ? "green" : pixForm.connectionStatus === "invalid" ? "red" : "slate"}>
                    {pixForm.connectionStatus ?? "unknown"}
                  </StatusBadge>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  {pixForm.lastConnectionAt ? `Ultimo teste: ${new Date(pixForm.lastConnectionAt).toLocaleString("pt-BR")}` : "Nenhum teste executado."}
                </div>
              </div>
            </div>
            <div className="mt-5 flex gap-3">
              <Button onClick={savePix}>Salvar Pix</Button>
              <Button variant="secondary" disabled={pixTesting} onClick={testPix}>{pixTesting ? "Testando..." : "Testar conexao"}</Button>
            </div>
          </section>
        ) : <LockedFeature title="Pix" />
      ) : null}

      {tab === "fiscal" ? (
        fiscalEnabled ? (
          <section className="panel p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black">Fiscal / NFC-e</h2>
              <Smartphone size={20} />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={fiscalForm.enabled ?? false} onChange={(event) => setFiscalForm({ ...fiscalForm, enabled: event.target.checked })} />Ativar Fiscal</label>
              <label className="text-sm font-semibold">Ambiente<select className="field mt-1 w-full" value={fiscalForm.environment ?? "homologation"} onChange={(event) => setFiscalForm({ ...fiscalForm, environment: event.target.value as FiscalConfig["environment"] })}><option value="homologation">Homologacao</option><option value="production">Producao</option></select></label>
              <label className="text-sm font-semibold">UF<input className="field mt-1 w-full" value={fiscalForm.uf ?? ""} onChange={(event) => setFiscalForm({ ...fiscalForm, uf: event.target.value })} /></label>
              <label className="text-sm font-semibold">Municipio<input className="field mt-1 w-full" value={fiscalForm.municipality ?? ""} onChange={(event) => setFiscalForm({ ...fiscalForm, municipality: event.target.value })} /></label>
              <label className="text-sm font-semibold">Regime tributario<input className="field mt-1 w-full" value={fiscalForm.taxRegime ?? ""} onChange={(event) => setFiscalForm({ ...fiscalForm, taxRegime: event.target.value })} /></label>
              <label className="text-sm font-semibold">Inscricao estadual<input className="field mt-1 w-full" value={fiscalForm.stateRegistration ?? ""} onChange={(event) => setFiscalForm({ ...fiscalForm, stateRegistration: event.target.value })} /></label>
              <label className="text-sm font-semibold">CSC NFC-e<input className="field mt-1 w-full" value={fiscalForm.csc ?? ""} onChange={(event) => setFiscalForm({ ...fiscalForm, csc: event.target.value })} /></label>
              <label className="text-sm font-semibold">ID CSC<input className="field mt-1 w-full" value={fiscalForm.cscId ?? ""} onChange={(event) => setFiscalForm({ ...fiscalForm, cscId: event.target.value })} /></label>
              <label className="text-sm font-semibold">Serie NFC-e<input className="field mt-1 w-full" value={fiscalForm.series ?? ""} onChange={(event) => setFiscalForm({ ...fiscalForm, series: event.target.value })} /></label>
              <label className="text-sm font-semibold">Proximo numero NFC-e<input className="field mt-1 w-full" type="number" value={fiscalForm.nextNumber ?? 1} onChange={(event) => setFiscalForm({ ...fiscalForm, nextNumber: Number(event.target.value) })} /></label>
              <label className="text-sm font-semibold">CFOP padrao<input className="field mt-1 w-full" value={fiscalForm.defaultCfop ?? ""} onChange={(event) => setFiscalForm({ ...fiscalForm, defaultCfop: event.target.value })} /></label>
              <label className="text-sm font-semibold">NCM padrao<input className="field mt-1 w-full" value={fiscalForm.defaultNcm ?? ""} onChange={(event) => setFiscalForm({ ...fiscalForm, defaultNcm: event.target.value })} /></label>
              <label className="text-sm font-semibold">CST/CSOSN padrao<input className="field mt-1 w-full" value={fiscalForm.defaultCstCsosn ?? ""} onChange={(event) => setFiscalForm({ ...fiscalForm, defaultCstCsosn: event.target.value })} /></label>
              <label className="text-sm font-semibold">Certificado A1 futuro<input className="field mt-1 w-full" value={fiscalForm.certificatePath ?? ""} onChange={(event) => setFiscalForm({ ...fiscalForm, certificatePath: event.target.value })} /></label>
              <label className="text-sm font-semibold">Senha certificado futura<input className="field mt-1 w-full" value={fiscalForm.certificatePassword ?? ""} onChange={(event) => setFiscalForm({ ...fiscalForm, certificatePassword: event.target.value })} /></label>
              <label className="text-sm font-semibold">API fiscal futura<input className="field mt-1 w-full" value={fiscalForm.provider ?? ""} onChange={(event) => setFiscalForm({ ...fiscalForm, provider: event.target.value })} /></label>
              <label className="text-sm font-semibold">Token/API Key futura<input className="field mt-1 w-full" value={fiscalForm.apiKey ?? ""} onChange={(event) => setFiscalForm({ ...fiscalForm, apiKey: event.target.value })} /></label>
            </div>
            <div className="mt-5 flex gap-3">
              <Button onClick={saveFiscal}>Salvar Fiscal</Button>
              <Button variant="secondary" onClick={testFiscal}>Testar configuracao fiscal</Button>
            </div>
          </section>
        ) : <LockedFeature title="Fiscal / NFC-e" />
      ) : null}

      {tab === "security" ? (
        <section className="grid grid-cols-[0.8fr_1.2fr] gap-6">
          <div className="panel p-5">
            <h2 className="text-lg font-black">Aparencia</h2>
            <div className="mt-4 rounded-lg bg-slate-50 p-4 dark:bg-slate-950">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Modo escuro padrao</span>
                <Button variant={dark ? "primary" : "secondary"} onClick={() => setDark(true)}><Moon size={16} />Escuro</Button>
              </div>
            </div>
          </div>
          <div className="panel p-5">
            <h2 className="text-lg font-black">Seguranca operacional</h2>
            <div className="mt-4 grid gap-3">
              {[
                ["Exigir login na abertura", "requireLoginOnStart"],
                ["Permitir PIN rapido", "allowQuickPin"],
                ["Exigir autorizacao gerente", "requireManagerAuthorization"],
                ["Permitir multiplos operadores", "allowMultipleOperators"],
                ["Auto lock", "autoLockEnabled"],
                ["Lembrar ultimo operador", "rememberLastOperator"]
              ].map(([label, key]) => (
                <label key={key} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-3 text-sm font-semibold dark:bg-slate-950">
                  {label}
                  <input
                    type="checkbox"
                    checked={Boolean(securityForm[key as keyof SecuritySettings])}
                    onChange={(event) => setSecurityForm({ ...securityForm, [key]: event.target.checked })}
                  />
                </label>
              ))}
              <label className="text-sm font-semibold">
                Tempo auto lock (min)
                <input className="field mt-1 w-full" type="number" min={1} value={securityForm.autoLockMinutes} onChange={(event) => setSecurityForm({ ...securityForm, autoLockMinutes: Number(event.target.value) })} />
              </label>
              <label className="text-sm font-semibold">
                Timeout sessao (min)
                <input className="field mt-1 w-full" type="number" min={1} value={securityForm.sessionTimeoutMinutes} onChange={(event) => setSecurityForm({ ...securityForm, sessionTimeoutMinutes: Number(event.target.value) })} />
              </label>
              <Button onClick={saveSecurity}>Salvar seguranca</Button>
            </div>
            <div className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-800">
              <h3 className="text-sm font-black uppercase text-slate-500">Usuarios ativos</h3>
              <div className="mt-3 grid gap-2 text-sm">
                {security?.users.map((user) => (
                  <div key={user.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-950">
                    <span className="font-semibold">{user.name}</span>
                    <span className="text-slate-500">{user.roleName}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {tab === "support" ? (
        <section className="panel p-6">
          <div className="flex items-start gap-4">
            <HelpCircle size={24} />
            <div>
              <h2 className="text-lg font-black">Suporte NexPDV</h2>
              <p className="mt-2 text-sm text-slate-500">WhatsApp: (00) 00000-0000</p>
              <p className="text-sm text-slate-500">Email: suporte@nexpdv.com.br</p>
            </div>
          </div>
        </section>
      ) : null}

      {message ? <div className="rounded-lg bg-slate-100 p-3 text-sm dark:bg-slate-900">{message}</div> : null}
    </div>
  );
};
