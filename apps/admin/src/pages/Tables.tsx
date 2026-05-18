import { useState } from "react";
import { Copy, Edit3, Eye, Lock, Plus, RefreshCcw, ShieldOff, Trash2, type LucideIcon } from "lucide-react";
import { formatCurrency } from "@nexpdv/shared";
import { useAsync } from "@/hooks/useAsync";
import { api } from "@/services/api";

type Tone = "green" | "red" | "amber" | "slate" | "blue";
type Field = { key: string; label: string; type?: "text" | "number" | "date" | "select" | "textarea" | "checkbox"; options?: Array<{ value: string; label: string }> };

const featureKeys = ["pix", "fiscal", "cloud", "mobile", "intelligence"] as const;
const roleOptions = ["super_admin", "admin", "suporte", "financeiro", "comercial", "leitura"].map((value) => ({ value, label: value }));
const billingOptions = [
  { value: "monthly", label: "Mensal" },
  { value: "annual", label: "Anual" },
  { value: "lifetime", label: "Vitalicio" }
];
const statusOptions = [
  { value: "active", label: "Ativo" },
  { value: "inactive", label: "Inativo" },
  { value: "blocked", label: "Bloqueado" }
];

const parseFeatures = (value?: string) => {
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
};

const dateOnly = (value?: string) => (value ? new Date(value).toISOString().slice(0, 10) : "");

export const Companies = () => {
  const { data, refresh } = useAsync(() => api.companies(), []);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<any>();
  const [details, setDetails] = useState<any>();
  const rows = filterRows(data ?? [], search, ["name", "tradeName", "document", "email"]);

  const save = async (input: any) => {
    const payload = clean(input);
    if (editing?.id) await api.updateCompany(editing.id, payload);
    else await api.createCompany(payload);
    setEditing(undefined);
    refresh();
  };

  const openDetails = async (id: string) => setDetails(await api.companyDetails(id));

  return (
    <div className="space-y-6">
      <Header title="Empresas" subtitle="Gestao centralizada dos clientes SaaS, PDVs, licencas e status comercial." action={<Button onClick={() => setEditing(companyBlank())}><Plus size={16} />Nova empresa</Button>} />
      <Toolbar search={search} onSearch={setSearch} filters={<span>{rows.length} registro(s)</span>} />
      <Table
        rows={rows}
        columns={[
          ["Empresa", (row) => <strong>{row.tradeName ?? row.name}</strong>],
          ["Documento", (row) => row.document],
          ["Contato", (row) => row.email ?? row.phone ?? "-"],
          ["Status", (row) => <Badge tone={row.status === "active" ? "green" : row.status === "blocked" ? "red" : "amber"}>{row.status}</Badge>],
          ["Licencas", (row) => String(row.licenses?.length ?? 0)],
          ["Dispositivos", (row) => String(row.devices?.length ?? 0)],
          ["Acoes", (row) => <Actions items={[
            ["Ver", Eye, () => openDetails(row.id)],
            ["Editar", Edit3, () => setEditing(companyFrom(row))],
            ["Bloquear", Lock, () => confirmRun("Bloquear empresa?", () => api.setCompanyStatus(row.id, "blocked").then(refresh))],
            ["Excluir", Trash2, () => confirmRun("Excluir/inativar empresa?", () => api.deleteCompany(row.id).then(refresh))]
          ]} />]
        ]}
      />
      {editing ? <Modal title={editing.id ? "Editar empresa" : "Nova empresa"} onClose={() => setEditing(undefined)}><Form fields={companyFields} value={editing} onSubmit={save} /></Modal> : null}
      {details ? <CompanyDetails data={details} onClose={() => setDetails(undefined)} /> : null}
    </div>
  );
};

export const Plans = () => {
  const { data, refresh } = useAsync(() => api.plans(), []);
  const [editing, setEditing] = useState<any>();

  const save = async (input: any) => {
    const payload = { ...input, price: Number(input.price), maxStores: Number(input.maxStores), maxUsers: Number(input.maxUsers), maxDevices: Number(input.maxDevices), graceDays: Number(input.graceDays) };
    if (editing?.id) await api.updatePlan(editing.id, payload);
    else await api.savePlan(payload);
    setEditing(undefined);
    refresh();
  };

  return (
    <div className="space-y-6">
      <Header title="Planos" subtitle="Precos, limites, modulos e tolerancia comercial." action={<Button onClick={() => setEditing(planBlank())}><Plus size={16} />Novo plano</Button>} />
      <div className="grid gap-4 xl:grid-cols-3">
        {(data ?? []).map((plan) => {
          const features = parseFeatures(plan.featuresJson);
          return (
            <article key={plan.id} className="panel p-5">
              <div className="flex items-start justify-between gap-3">
                <div><h2 className="text-xl font-black">{plan.name}</h2><p className="mt-1 text-xs font-bold text-slate-400">{plan.code} · {periodLabel(plan.billingPeriod)}</p></div>
                <Badge tone={plan.active ? "green" : "slate"}>{plan.active ? "ativo" : "inativo"}</Badge>
              </div>
              <div className="mt-5 text-3xl font-black">{formatCurrency(Number(plan.price))}</div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs font-bold text-slate-300">
                <span className="rounded bg-white/5 p-2">{plan.maxDevices} disp.</span>
                <span className="rounded bg-white/5 p-2">{plan.maxUsers} usuarios</span>
                <span className="rounded bg-white/5 p-2">{plan.graceDays ?? 7} dias</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">{featureKeys.map((key) => <Badge key={key} tone={features[key] ? "green" : "slate"}>{key}</Badge>)}</div>
              <Actions items={[
                ["Editar", Edit3, () => setEditing(planFrom(plan))],
                ["Duplicar", Copy, () => api.duplicatePlan(plan.id).then(refresh)],
                [plan.active ? "Inativar" : "Ativar", ShieldOff, () => api.setPlanStatus(plan.id, !plan.active).then(refresh)]
              ]} />
            </article>
          );
        })}
      </div>
      {editing ? <Modal title={editing.id ? "Editar plano" : "Novo plano"} onClose={() => setEditing(undefined)}><PlanForm value={editing} onSubmit={save} /></Modal> : null}
    </div>
  );
};

export const Licenses = () => {
  const companies = useAsync(() => api.companies(), []);
  const plans = useAsync(() => api.plans(), []);
  const { data, refresh } = useAsync(() => api.licenses(), []);
  const [editing, setEditing] = useState<any>();
  const [creating, setCreating] = useState(false);

  const generate = async (input: any) => {
    await api.generateLicense(input);
    setCreating(false);
    refresh();
  };
  const save = async (input: any) => {
    await api.updateLicense(editing.id, { ...input, maxDevices: Number(input.maxDevices), features: input.features });
    setEditing(undefined);
    refresh();
  };

  return (
    <div className="space-y-6">
      <Header title="Licencas" subtitle="Geracao, bloqueio, renovacao, reset de ativacao e modulos por cliente." action={<Button onClick={() => setCreating(true)}><Plus size={16} />Gerar licença</Button>} />
      <Table rows={data ?? []} columns={[
        ["Chave", (row) => <span className="font-mono text-xs">{row.key}</span>],
        ["Empresa", (row) => row.company?.tradeName ?? row.company?.name],
        ["Plano", (row) => row.planCode],
        ["Status", (row) => <LicenseStatus row={row} />],
        ["Validade", (row) => new Date(row.validUntil).toLocaleDateString("pt-BR")],
        ["Dispositivos", (row) => `${row.devices?.filter((d: any) => d.status === "active").length ?? 0}/${row.maxDevices}`],
        ["Acoes", (row) => <Actions items={[
          ["Editar", Edit3, () => setEditing(licenseFrom(row))],
          ["Bloquear", Lock, () => api.blockLicense(row.id, "Bloqueio via painel").then(refresh)],
          ["Desbloquear", RefreshCcw, () => api.unblockLicense(row.id).then(refresh)],
          ["Resetar", RefreshCcw, () => confirmRun("Resetar ativacoes desta licenca?", () => api.resetActivation(row.id).then(refresh))],
          ["Cancelar", Trash2, () => confirmRun("Cancelar licenca?", () => api.cancelLicense(row.id).then(refresh))]
        ]} />]
      ]} />
      {creating ? <Modal title="Gerar licença" onClose={() => setCreating(false)}><Form fields={licenseCreateFields(companies.data ?? [], plans.data ?? [])} value={{ companyId: "", planCode: "PRO", validUntil: "2027-12-31" }} onSubmit={generate} /></Modal> : null}
      {editing ? <Modal title="Editar licença" onClose={() => setEditing(undefined)}><LicenseForm value={editing} onSubmit={save} /></Modal> : null}
    </div>
  );
};

export const Devices = () => {
  const { data, refresh } = useAsync(() => api.devices(), []);
  const [editing, setEditing] = useState<any>();
  return (
    <div className="space-y-6">
      <Header title="Dispositivos" subtitle="Controle de PDVs ativados, nomes amigaveis, status online e bloqueios." />
      <Table rows={data ?? []} columns={[
        ["Identificador", (row) => <strong>{row.shortCode ?? row.name ?? readableDevice(row)}</strong>],
        ["Nome", (row) => row.name],
        ["Empresa", (row) => row.company?.tradeName ?? row.company?.name],
        ["Sistema", (row) => row.os ?? row.platform],
        ["Versao", (row) => row.appVersion ?? "-"],
        ["Online", (row) => <Badge tone={row.online ? "green" : "slate"}>{row.online ? "online" : "offline"}</Badge>],
        ["Status", (row) => <Badge tone={row.status === "active" ? "green" : row.status === "blocked" ? "red" : "amber"}>{row.status}</Badge>],
        ["Ultima conexao", (row) => row.lastSeenAt ? new Date(row.lastSeenAt).toLocaleString("pt-BR") : "-"],
        ["Acoes", (row) => <Actions items={[
          ["Editar", Edit3, () => setEditing({ id: row.id, name: row.name, shortCode: row.shortCode ?? readableDevice(row), status: row.status })],
          ["Bloquear", Lock, () => api.blockDevice(row.id).then(refresh)],
          ["Desativar", ShieldOff, () => api.deactivateDevice(row.id).then(refresh)],
          ["Remover", Trash2, () => confirmRun("Remover dispositivo?", () => api.deleteDevice(row.id).then(refresh))]
        ]} />]
      ]} />
      {editing ? <Modal title="Editar dispositivo" onClose={() => setEditing(undefined)}><Form fields={deviceFields} value={editing} onSubmit={(input) => api.updateDevice(editing.id, input).then(() => { setEditing(undefined); refresh(); })} /></Modal> : null}
    </div>
  );
};

export const Users = () => {
  const { data, refresh } = useAsync(() => api.users(), []);
  const [editing, setEditing] = useState<any>();
  return (
    <div className="space-y-6">
      <Header title="Usuarios SaaS" subtitle="Acesso ao painel central. Nao sao operadores do PDV." action={<Button onClick={() => setEditing(userBlank())}><Plus size={16} />Novo usuário</Button>} />
      <Table rows={data ?? []} columns={[
        ["Nome", (row) => <strong>{row.name}</strong>],
        ["Email", (row) => row.email],
        ["Papel", (row) => <Badge tone={row.platformRole === "super_admin" ? "blue" : "slate"}>{row.platformRole}</Badge>],
        ["2FA", (row) => <Badge tone={row.twoFactorEnabled ? "green" : "amber"}>{row.twoFactorEnabled ? "ativo" : "pendente"}</Badge>],
        ["Status", (row) => <Badge tone={row.active ? "green" : "red"}>{row.active ? "ativo" : "inativo"}</Badge>],
        ["Ultimo acesso", (row) => row.lastLoginAt ? new Date(row.lastLoginAt).toLocaleString("pt-BR") : "-"],
        ["Acoes", (row) => <Actions items={[
          ["Editar", Edit3, () => setEditing(userFrom(row))],
          ["Reset senha", RefreshCcw, () => { const password = prompt("Nova senha temporaria"); if (password) api.resetUserPassword(row.id, password).then(refresh); }],
          ["Desativar 2FA", ShieldOff, () => api.disableUser2fa(row.id).then(refresh)]
        ]} />]
      ]} />
      {editing ? <Modal title={editing.id ? "Editar usuário SaaS" : "Novo usuário SaaS"} onClose={() => setEditing(undefined)}><UserForm value={editing} onSubmit={async (input) => { if (editing.id) await api.updateUser(editing.id, input); else await api.createUser(input); setEditing(undefined); refresh(); }} /></Modal> : null}
    </div>
  );
};

export const SyncMonitor = () => {
  const jobs = useAsync(() => api.syncJobs(), []);
  const logs = useAsync(() => api.logs(), []);
  const problematic = (jobs.data ?? []).filter((job) => job.status === "failed" || job.conflict);
  return (
    <div className="space-y-6">
      <Header title="Visao dos PDVs" subtitle="Vendas sincronizadas, caixas, conexoes, erros, backups futuros, versoes e logs de sync." />
      <div className="grid gap-4 xl:grid-cols-4">
        <PanelMetric label="Jobs sync" value={jobs.data?.length ?? 0} />
        <PanelMetric label="Eventos sync" value={logs.data?.length ?? 0} />
        <PanelMetric label="Com problema" value={problematic.length} />
        <PanelMetric label="Pendentes" value={(jobs.data ?? []).filter((job) => job.status !== "completed").length} />
      </div>
      <Table rows={jobs.data ?? []} columns={[
        ["Criado", (row) => new Date(row.createdAt).toLocaleString("pt-BR")],
        ["Empresa", (row) => row.company?.tradeName ?? row.company?.name],
        ["Dispositivo", (row) => row.device?.shortCode ?? row.device?.name ?? "-"],
        ["Entidade", (row) => row.entity],
        ["Operacao", (row) => row.operation],
        ["Status", (row) => <Badge tone={row.status === "completed" ? "green" : row.status === "failed" ? "red" : "amber"}>{row.status}</Badge>],
        ["Erro", (row) => row.lastError ?? "-"]
      ]} />
    </div>
  );
};

export const Audit = () => {
  const { data } = useAsync(() => api.audit(), []);
  return (
    <div className="space-y-6">
      <Header title="Auditoria" subtitle="Log de seguranca, login, alteracoes sensiveis, licencas e dispositivos." />
      <Table rows={data ?? []} columns={[
        ["Data", (row) => new Date(row.createdAt).toLocaleString("pt-BR")],
        ["Acao", (row) => row.action],
        ["Entidade", (row) => row.entity ?? "-"],
        ["Usuario", (row) => row.user?.email ?? "-"],
        ["IP", (row) => row.ip ?? "-"],
        ["Detalhes", (row) => row.details ?? "-"]
      ]} />
    </div>
  );
};

export const Logs = () => {
  const { data } = useAsync(() => api.logs(), []);
  return (
    <div className="space-y-6">
      <Header title="Logs dos PDVs" subtitle="Eventos tecnicos da fila offline-first com filtros futuros por empresa, data, status e dispositivo." />
      <Table rows={data ?? []} columns={[["Data", (row) => new Date(row.createdAt).toLocaleString("pt-BR")], ["Device", (row) => row.deviceId], ["Entidade", (row) => row.entity], ["Operacao", (row) => row.operation], ["Status", (row) => row.status], ["Mensagem", (row) => row.message ?? "-"]]} />
    </div>
  );
};

const Header = ({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) => (
  <div className="flex flex-wrap items-start justify-between gap-4">
    <div><h1 className="text-3xl font-black">{title}</h1><p className="mt-1 text-sm font-semibold text-slate-400">{subtitle}</p></div>
    {action}
  </div>
);

const Toolbar = ({ search, onSearch, filters }: { search: string; onSearch: (value: string) => void; filters?: React.ReactNode }) => (
  <section className="panel flex flex-wrap items-center justify-between gap-3 p-4">
    <input className="field max-w-md" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Buscar por nome, documento, e-mail..." />
    <div className="text-sm font-bold text-slate-400">{filters}</div>
  </section>
);

const Badge = ({ children, tone = "slate" }: { children: React.ReactNode; tone?: Tone }) => {
  const classes = {
    green: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20",
    red: "bg-red-500/10 text-red-300 ring-red-500/20",
    amber: "bg-amber-500/10 text-amber-300 ring-amber-500/20",
    blue: "bg-blue-500/10 text-blue-300 ring-blue-500/20",
    slate: "bg-white/10 text-slate-300 ring-white/10"
  };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ring-1 ${classes[tone]}`}>{children}</span>;
};

const Button = ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => (
  <button className="inline-flex h-11 items-center gap-2 rounded-lg bg-white px-4 text-sm font-black text-ink" onClick={onClick}>{children}</button>
);

const Actions = ({ items }: { items: Array<[string, LucideIcon, () => void]> }) => (
  <div className="flex flex-wrap gap-2">
    {items.map(([label, Icon, onClick]) => (
      <button key={label} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-xs font-black text-slate-100 hover:bg-white/20" onClick={onClick} title={label}>
        <Icon size={13} />{label}
      </button>
    ))}
  </div>
);

const Table = ({ rows, columns }: { rows: any[]; columns: Array<[string, (row: any) => React.ReactNode]> }) => (
  <section className="panel overflow-auto">
    <table className="w-full min-w-[920px]">
      <thead className="bg-white/5 text-left text-xs font-black uppercase text-slate-400"><tr>{columns.map(([label]) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead>
      <tbody>
        {rows.length ? rows.map((row, index) => <tr key={row.id ?? index}>{columns.map(([label, render]) => <td key={label} className="border-t border-white/10 px-4 py-3 text-sm text-slate-200">{render(row) ?? "-"}</td>)}</tr>) : (
          <tr><td className="px-4 py-12 text-center text-sm font-semibold text-slate-400" colSpan={columns.length}>Nenhum registro encontrado.</td></tr>
        )}
      </tbody>
    </table>
  </section>
);

const Modal = ({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
    <section className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-lg border border-white/10 bg-[#0D1320] p-6 shadow-panel">
      <div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-black">{title}</h2><button className="rounded-lg bg-white/10 px-3 py-2 text-sm font-black" onClick={onClose}>Fechar</button></div>
      {children}
    </section>
  </div>
);

const Form = ({ fields, value, onSubmit }: { fields: Field[]; value: any; onSubmit: (input: any) => void | Promise<void> }) => {
  const [form, setForm] = useState(value);
  return (
    <form className="grid gap-4 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); onSubmit(form); }}>
      {fields.map((field) => <FieldControl key={field.key} field={field} form={form} setForm={setForm} />)}
      <div className="md:col-span-2"><button className="h-11 rounded-lg bg-white px-5 text-sm font-black text-ink">Salvar</button></div>
    </form>
  );
};

const FieldControl = ({ field, form, setForm }: { field: Field; form: any; setForm: (input: any) => void }) => {
  const value = form[field.key] ?? (field.type === "checkbox" ? false : "");
  const set = (next: unknown) => setForm({ ...form, [field.key]: next });
  if (field.type === "select") return <label className="grid gap-1 text-xs font-black text-slate-400">{field.label}<select className="field" value={value} onChange={(event) => set(event.target.value)}>{field.options?.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>;
  if (field.type === "textarea") return <label className="grid gap-1 text-xs font-black text-slate-400 md:col-span-2">{field.label}<textarea className="field min-h-24" value={value} onChange={(event) => set(event.target.value)} /></label>;
  if (field.type === "checkbox") return <label className="mt-5 flex items-center gap-2 text-sm font-bold text-slate-300"><input type="checkbox" checked={Boolean(value)} onChange={(event) => set(event.target.checked)} />{field.label}</label>;
  return <label className="grid gap-1 text-xs font-black text-slate-400">{field.label}<input className="field" type={field.type ?? "text"} value={value} onChange={(event) => set(field.type === "number" ? Number(event.target.value) : event.target.value)} /></label>;
};

const PlanForm = ({ value, onSubmit }: { value: any; onSubmit: (input: any) => void }) => {
  const [form, setForm] = useState(value);
  return (
    <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); onSubmit(form); }}>
      <div className="grid gap-4 md:grid-cols-3">{planFields.map((field) => <FieldControl key={field.key} field={field} form={form} setForm={setForm} />)}</div>
      <FeatureToggles value={form.features} onChange={(features) => setForm({ ...form, features })} />
      <button className="h-11 rounded-lg bg-white px-5 text-sm font-black text-ink">Salvar plano</button>
    </form>
  );
};

const LicenseForm = ({ value, onSubmit }: { value: any; onSubmit: (input: any) => void }) => {
  const [form, setForm] = useState(value);
  return (
    <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); onSubmit(form); }}>
      <div className="grid gap-4 md:grid-cols-3">{licenseEditFields.map((field) => <FieldControl key={field.key} field={field} form={form} setForm={setForm} />)}</div>
      <FeatureToggles value={form.features} onChange={(features) => setForm({ ...form, features })} />
      <button className="h-11 rounded-lg bg-white px-5 text-sm font-black text-ink">Salvar licença</button>
    </form>
  );
};

const UserForm = ({ value, onSubmit }: { value: any; onSubmit: (input: any) => void }) => {
  const [form, setForm] = useState(value);
  const permissions = ["ver empresas", "editar empresas", "gerenciar licencas", "gerenciar planos", "gerenciar dispositivos", "ver logs", "ver auditoria", "gerenciar usuarios SaaS", "acessar financeiro", "acessar suporte"];
  return (
    <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); onSubmit(form); }}>
      <div className="grid gap-4 md:grid-cols-2">{userFields.map((field) => <FieldControl key={field.key} field={field} form={form} setForm={setForm} />)}</div>
      <section className="rounded-lg bg-white/5 p-4">
        <h3 className="font-black">Permissões SaaS por usuário</h3>
        <div className="mt-3 grid gap-2 md:grid-cols-2">{permissions.map((item) => <label key={item} className="flex items-center gap-2 text-sm font-bold text-slate-300"><input type="checkbox" checked={Boolean(form.permissions?.[item])} onChange={(event) => setForm({ ...form, permissions: { ...form.permissions, [item]: event.target.checked } })} />{item}</label>)}</div>
      </section>
      <button className="h-11 rounded-lg bg-white px-5 text-sm font-black text-ink">Salvar usuário</button>
    </form>
  );
};

const FeatureToggles = ({ value, onChange }: { value: any; onChange: (features: any) => void }) => (
  <section className="rounded-lg bg-white/5 p-4">
    <h3 className="font-black">Módulos liberados</h3>
    <div className="mt-3 flex flex-wrap gap-4">{featureKeys.map((key) => <label key={key} className="flex items-center gap-2 text-sm font-bold text-slate-300"><input type="checkbox" checked={Boolean(value?.[key])} onChange={(event) => onChange({ ...value, [key]: event.target.checked })} />{key}</label>)}</div>
  </section>
);

const CompanyDetails = ({ data, onClose }: { data: any; onClose: () => void }) => (
  <Modal title={`Detalhes: ${data.tradeName ?? data.name}`} onClose={onClose}>
    <div className="grid gap-4 md:grid-cols-4">
      <PanelMetric label="Vendas sync" value={data._count?.sales ?? 0} />
      <PanelMetric label="Faturamento sync" value={formatCurrency(Number(data.metrics?.revenueSynced ?? 0))} />
      <PanelMetric label="Dispositivos" value={data.devices?.length ?? 0} />
      <PanelMetric label="Licenças" value={data.licenses?.length ?? 0} />
    </div>
    <div className="mt-5 grid gap-5 md:grid-cols-2">
      <MiniList title="Licenças vinculadas" rows={(data.licenses ?? []).map((item: any) => `${item.key} · ${item.planCode} · ${item.status}`)} />
      <MiniList title="Dispositivos" rows={(data.devices ?? []).map((item: any) => `${item.shortCode ?? item.name} · ${item.status} · ${item.lastSeenAt ? new Date(item.lastSeenAt).toLocaleString("pt-BR") : "sem acesso"}`)} />
      <MiniList title="Logs recentes" rows={(data.logs ?? []).map((item: any) => `${new Date(item.createdAt).toLocaleString("pt-BR")} · ${item.action}`)} />
      <MiniList title="Sync jobs" rows={(data.syncJobs ?? []).map((item: any) => `${item.entity} · ${item.operation} · ${item.status}`)} />
    </div>
  </Modal>
);

const PanelMetric = ({ label, value }: { label: string; value: React.ReactNode }) => <section className="panel p-5"><span className="text-sm font-bold text-slate-400">{label}</span><strong className="mt-2 block text-2xl">{value}</strong></section>;
const MiniList = ({ title, rows }: { title: string; rows: string[] }) => <section className="rounded-lg bg-white/5 p-4"><h3 className="font-black">{title}</h3><div className="mt-3 space-y-2 text-sm font-semibold text-slate-300">{rows.length ? rows.map((row) => <p key={row}>{row}</p>) : <p className="text-slate-500">Sem registros.</p>}</div></section>;

const companyFields: Field[] = [
  { key: "tradeName", label: "Nome fantasia" }, { key: "name", label: "Razão social" }, { key: "document", label: "CNPJ/CPF" }, { key: "stateRegistration", label: "Inscrição estadual" },
  { key: "phone", label: "Telefone" }, { key: "whatsapp", label: "WhatsApp" }, { key: "email", label: "Email" }, { key: "address", label: "Endereço" },
  { key: "city", label: "Cidade" }, { key: "state", label: "Estado" }, { key: "zipCode", label: "CEP" }, { key: "accountManager", label: "Responsável comercial" },
  { key: "status", label: "Status", type: "select", options: statusOptions }, { key: "internalNotes", label: "Observações internas", type: "textarea" }
];
const planFields: Field[] = [
  { key: "code", label: "Código" }, { key: "name", label: "Nome" }, { key: "price", label: "Preço", type: "number" }, { key: "maxDevices", label: "Limite dispositivos", type: "number" },
  { key: "maxUsers", label: "Limite usuários", type: "number" }, { key: "maxStores", label: "Limite lojas", type: "number" }, { key: "billingPeriod", label: "Período", type: "select", options: billingOptions },
  { key: "graceDays", label: "Dias de tolerância", type: "number" }, { key: "description", label: "Descrição", type: "textarea" }, { key: "active", label: "Plano ativo", type: "checkbox" }
];
const licenseEditFields: Field[] = [
  { key: "status", label: "Status", type: "select", options: [{ value: "active", label: "Ativa" }, { value: "blocked", label: "Bloqueada" }, { value: "cancelled", label: "Cancelada" }, { value: "expired", label: "Vencida" }, { value: "trial", label: "Teste" }] },
  { key: "validUntil", label: "Validade", type: "date" }, { key: "maxDevices", label: "Limite dispositivos", type: "number" }, { key: "internalNotes", label: "Observações internas", type: "textarea" }
];
const userFields: Field[] = [
  { key: "name", label: "Nome" }, { key: "email", label: "Email" }, { key: "phone", label: "Telefone" }, { key: "platformRole", label: "Papel", type: "select", options: roleOptions },
  { key: "password", label: "Senha temporária" }, { key: "active", label: "Usuário ativo", type: "checkbox" }
];
const deviceFields: Field[] = [{ key: "name", label: "Nome amigável" }, { key: "shortCode", label: "Identificador curto" }, { key: "status", label: "Status", type: "select", options: statusOptions }];
const licenseCreateFields = (companies: any[], plans: any[]): Field[] => [
  { key: "companyId", label: "Empresa", type: "select", options: [{ value: "", label: "Selecione" }, ...companies.map((item) => ({ value: item.id, label: item.tradeName ?? item.name }))] },
  { key: "planCode", label: "Plano", type: "select", options: plans.map((item) => ({ value: item.code, label: item.name })) },
  { key: "validUntil", label: "Validade", type: "date" }
];

const companyBlank = () => ({ name: "", tradeName: "", document: "", stateRegistration: "", phone: "", whatsapp: "", email: "", address: "", city: "", state: "", zipCode: "", status: "active", internalNotes: "", accountManager: "" });
const companyFrom = (row: any) => ({ ...companyBlank(), ...row });
const planBlank = () => ({ code: "", name: "", description: "", price: 0, maxStores: 1, maxUsers: 1, maxDevices: 1, billingPeriod: "monthly", graceDays: 7, active: true, features: { pix: false, fiscal: false, cloud: false, mobile: false, intelligence: false }, extraFeatures: {} });
const planFrom = (row: any) => ({ ...planBlank(), ...row, features: parseFeatures(row.featuresJson), extraFeatures: parseFeatures(row.extraFeaturesJson) });
const licenseFrom = (row: any) => ({ id: row.id, status: row.status, validUntil: dateOnly(row.validUntil), maxDevices: row.maxDevices, internalNotes: row.internalNotes ?? "", features: parseFeatures(row.featuresJson) });
const userBlank = () => ({ name: "", email: "", phone: "", platformRole: "suporte", password: "", active: true, permissions: {} });
const userFrom = (row: any) => ({ ...userBlank(), ...row, password: "", permissions: parseFeatures(row.permissionsJson) });

const clean = (input: any) => Object.fromEntries(Object.entries(input).filter(([, value]) => value !== ""));
const filterRows = (rows: any[], search: string, keys: string[]) => {
  const term = search.trim().toLowerCase();
  if (!term) return rows;
  return rows.filter((row) => keys.some((key) => String(row[key] ?? "").toLowerCase().includes(term)));
};
const confirmRun = (message: string, action: () => void | Promise<void>) => { if (confirm(message)) void action(); };
const periodLabel = (value: string) => ({ monthly: "Mensal", annual: "Anual", lifetime: "Vitalício" }[value] ?? value);
const readableDevice = (row: any) => `DEV-${String(row.deviceId ?? row.id).slice(-5).toUpperCase()}`;
const LicenseStatus = ({ row }: { row: any }) => {
  const validUntil = new Date(row.validUntil).getTime();
  const days = Math.ceil((validUntil - Date.now()) / 86_400_000);
  if (row.status === "blocked" || row.status === "cancelled") return <Badge tone="red">{row.status}</Badge>;
  if (days < 0) return <Badge tone="red">vencida</Badge>;
  if (days <= 30) return <Badge tone="amber">vence em {days}d</Badge>;
  return <Badge tone="green">{row.status}</Badge>;
};
