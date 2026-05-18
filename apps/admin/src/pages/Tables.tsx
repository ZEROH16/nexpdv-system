import { useState } from "react";
import { formatCurrency } from "@nexpdv/shared";
import { useAsync } from "@/hooks/useAsync";
import { api } from "@/services/api";

const parseFeatures = (value?: string) => {
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
};

const Badge = ({ children, tone = "slate" }: { children: string; tone?: "green" | "red" | "amber" | "slate" }) => {
  const classes = {
    green: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20",
    red: "bg-red-500/10 text-red-300 ring-red-500/20",
    amber: "bg-amber-500/10 text-amber-300 ring-amber-500/20",
    slate: "bg-white/10 text-slate-300 ring-white/10"
  };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ring-1 ${classes[tone]}`}>{children}</span>;
};

export const Companies = () => {
  const { data, refresh } = useAsync(() => api.companies(), []);
  const [form, setForm] = useState({ name: "", tradeName: "", document: "", email: "", phone: "", address: "" });
  const [message, setMessage] = useState<string>();

  const create = async () => {
    try {
      await api.createCompany(form);
      setForm({ name: "", tradeName: "", document: "", email: "", phone: "", address: "" });
      setMessage("Empresa criada.");
      refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel criar empresa.");
    }
  };

  return (
    <div className="space-y-6">
      <Header title="Empresas" subtitle="Clientes SaaS e empresas licenciadas." />
      <section className="panel p-5">
        <div className="grid grid-cols-[1fr_1fr_160px_1fr_auto] gap-3">
          <input className="field" placeholder="Razao social" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          <input className="field" placeholder="Nome fantasia" value={form.tradeName} onChange={(event) => setForm({ ...form, tradeName: event.target.value })} />
          <input className="field" placeholder="CNPJ/CPF" value={form.document} onChange={(event) => setForm({ ...form, document: event.target.value })} />
          <input className="field" placeholder="Email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          <button className="h-11 rounded-lg bg-white px-4 text-sm font-black text-ink" onClick={create}>Criar</button>
        </div>
        {message ? <div className="mt-3 text-sm font-semibold text-slate-300">{message}</div> : null}
      </section>
      <Table
        rows={data ?? []}
        columns={[
          ["Empresa", (row) => row.tradeName ?? row.name],
          ["Documento", (row) => row.document],
          ["Status", (row) => <Badge tone={row.status === "active" ? "green" : "red"}>{row.status}</Badge>],
          ["Licencas", (row) => String(row.licenses?.length ?? 0)],
          ["Dispositivos", (row) => String(row.devices?.length ?? 0)],
          ["Vendas", (row) => String(row._count?.sales ?? 0)]
        ]}
      />
    </div>
  );
};

export const Users = () => {
  const { data } = useAsync(() => api.users(), []);
  return (
    <div className="space-y-6">
      <Header title="Usuarios SaaS" subtitle="Operadores administrativos da plataforma." />
      <Table rows={data ?? []} columns={[["Nome", (row) => row.name], ["Email", (row) => row.email], ["Papel", (row) => row.platformRole ?? row.role], ["Status", (row) => <Badge tone={row.active ? "green" : "red"}>{row.active ? "ativo" : "inativo"}</Badge>]]} />
    </div>
  );
};

export const Plans = () => {
  const { data, refresh } = useAsync(() => api.plans(), []);
  const [form, setForm] = useState({
    code: "PRO",
    name: "NexPDV Pro",
    description: "",
    price: 199.9,
    maxStores: 5,
    maxUsers: 25,
    maxDevices: 8,
    features: { pix: true, fiscal: true, cloud: true, mobile: true, intelligence: true }
  });

  const save = async () => {
    await api.savePlan(form);
    refresh();
  };

  return (
    <div className="space-y-6">
      <Header title="Planos" subtitle="Pacotes comerciais, limites e modulos liberados." />
      <section className="grid grid-cols-3 gap-4">
        {(data ?? []).map((plan) => {
          const features = parseFeatures(plan.featuresJson);
          return (
            <article key={plan.id} className="panel p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xl font-black">{plan.name}</div>
                  <div className="mt-1 text-xs font-bold text-slate-400">{plan.code}</div>
                </div>
                <Badge tone={plan.active ? "green" : "slate"}>{plan.active ? "ativo" : "inativo"}</Badge>
              </div>
              <div className="mt-4 text-3xl font-black">{formatCurrency(Number(plan.price))}</div>
              <div className="mt-4 text-sm font-semibold text-slate-400">{plan.maxDevices} dispositivos · {plan.maxUsers} usuarios · {plan.maxStores} lojas</div>
              <div className="mt-4 flex flex-wrap gap-2">
                {Object.entries(features).map(([key, enabled]) => <Badge key={key} tone={enabled ? "green" : "slate"}>{key}</Badge>)}
              </div>
            </article>
          );
        })}
      </section>
      <section className="panel p-5">
        <h2 className="text-lg font-black">Editor rapido de plano</h2>
        <div className="mt-4 grid grid-cols-6 gap-3">
          <input className="field" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} />
          <input className="field col-span-2" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          <input className="field" type="number" value={form.price} onChange={(event) => setForm({ ...form, price: Number(event.target.value) })} />
          <input className="field" type="number" value={form.maxDevices} onChange={(event) => setForm({ ...form, maxDevices: Number(event.target.value) })} />
          <button className="h-11 rounded-lg bg-white px-4 text-sm font-black text-ink" onClick={save}>Salvar</button>
        </div>
        <div className="mt-4 flex flex-wrap gap-4">
          {Object.keys(form.features).map((key) => (
            <label key={key} className="flex items-center gap-2 text-sm font-bold text-slate-300">
              <input type="checkbox" checked={(form.features as any)[key]} onChange={(event) => setForm({ ...form, features: { ...form.features, [key]: event.target.checked } })} />
              {key}
            </label>
          ))}
        </div>
      </section>
    </div>
  );
};

export const Licenses = () => {
  const companies = useAsync(() => api.companies(), []);
  const plans = useAsync(() => api.plans(), []);
  const { data, refresh } = useAsync(() => api.licenses(), []);
  const [form, setForm] = useState({ companyId: "", planCode: "PRO", validUntil: "2027-12-31" });
  const [message, setMessage] = useState<string>();

  const generate = async () => {
    try {
      await api.generateLicense(form);
      setMessage("Licenca gerada.");
      refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel gerar licenca.");
    }
  };

  return (
    <div className="space-y-6">
      <Header title="Licencas" subtitle="Geracao, bloqueio, renovacao, plano e modulos por empresa." />
      <section className="panel p-5">
        <div className="grid grid-cols-[1fr_180px_180px_auto] gap-3">
          <select className="field" value={form.companyId} onChange={(event) => setForm({ ...form, companyId: event.target.value })}>
            <option value="">Empresa</option>
            {(companies.data ?? []).map((company) => <option key={company.id} value={company.id}>{company.tradeName ?? company.name}</option>)}
          </select>
          <select className="field" value={form.planCode} onChange={(event) => setForm({ ...form, planCode: event.target.value })}>
            {(plans.data ?? []).map((plan) => <option key={plan.code} value={plan.code}>{plan.code}</option>)}
          </select>
          <input className="field" type="date" value={form.validUntil} onChange={(event) => setForm({ ...form, validUntil: event.target.value })} />
          <button className="h-11 rounded-lg bg-white px-4 text-sm font-black text-ink" disabled={!form.companyId} onClick={generate}>Gerar</button>
        </div>
        {message ? <div className="mt-3 text-sm font-semibold text-slate-300">{message}</div> : null}
      </section>
      <Table
        rows={data ?? []}
        columns={[
          ["Chave", (row) => <span className="font-mono text-xs">{row.key}</span>],
          ["Empresa", (row) => row.company?.tradeName ?? row.company?.name],
          ["Plano", (row) => row.planCode],
          ["Status", (row) => <Badge tone={row.status === "active" ? "green" : row.status === "blocked" ? "red" : "amber"}>{row.status}</Badge>],
          ["Validade", (row) => new Date(row.validUntil).toLocaleDateString("pt-BR")],
          ["Dispositivos", (row) => `${row.devices?.length ?? 0}/${row.maxDevices}`],
          ["Acoes", (row) => (
            <div className="flex flex-wrap gap-2">
              <Action onClick={() => api.blockLicense(row.id, "Bloqueio via painel").then(refresh)}>Bloquear</Action>
              <Action onClick={() => api.renewLicense(row.id, "2028-12-31").then(refresh)}>Renovar</Action>
              <Action onClick={() => api.resetActivation(row.id).then(refresh)}>Resetar</Action>
            </div>
          )]
        ]}
      />
    </div>
  );
};

export const Devices = () => {
  const { data, refresh } = useAsync(() => api.devices(), []);
  return (
    <div className="space-y-6">
      <Header title="Dispositivos" subtitle="Ativacoes desktop, fingerprints e status online." />
      <Table
        rows={data ?? []}
        columns={[
          ["Nome", (row) => row.name],
          ["Empresa", (row) => row.company?.tradeName ?? row.company?.name],
          ["Device ID", (row) => <span className="font-mono text-xs">{row.deviceId}</span>],
          ["Online", (row) => <Badge tone={row.online ? "green" : "slate"}>{row.online ? "online" : "offline"}</Badge>],
          ["Status", (row) => <Badge tone={row.status === "active" ? "green" : "red"}>{row.status}</Badge>],
          ["Ultima conexao", (row) => row.lastSeenAt ? new Date(row.lastSeenAt).toLocaleString("pt-BR") : "-"],
          ["Acoes", (row) => <Action onClick={() => api.deactivateDevice(row.id).then(refresh)}>Desativar</Action>]
        ]}
      />
    </div>
  );
};

export const SyncMonitor = () => {
  const jobs = useAsync(() => api.syncJobs(), []);
  const logs = useAsync(() => api.logs(), []);
  return (
    <div className="space-y-6">
      <Header title="Sincronizacao" subtitle="Fila preparada para vendas, estoque, produtos, clientes e caixa." />
      <div className="grid grid-cols-3 gap-4">
        <section className="panel p-5"><span className="text-sm font-bold text-slate-400">Jobs</span><strong className="mt-2 block text-3xl">{jobs.data?.length ?? 0}</strong></section>
        <section className="panel p-5"><span className="text-sm font-bold text-slate-400">Eventos sync</span><strong className="mt-2 block text-3xl">{logs.data?.length ?? 0}</strong></section>
        <section className="panel p-5"><span className="text-sm font-bold text-slate-400">Pendentes</span><strong className="mt-2 block text-3xl">{jobs.data?.filter((job) => job.status !== "completed").length ?? 0}</strong></section>
      </div>
      <Table rows={jobs.data ?? []} columns={[["Criado", (row) => new Date(row.createdAt).toLocaleString("pt-BR")], ["Empresa", (row) => row.company?.tradeName ?? row.company?.name], ["Dispositivo", (row) => row.device?.name ?? "-"], ["Entidade", (row) => row.entity], ["Operacao", (row) => row.operation], ["Status", (row) => <Badge tone={row.status === "completed" ? "green" : row.status === "failed" ? "red" : "amber"}>{row.status}</Badge>]]} />
    </div>
  );
};

export const Audit = () => {
  const { data } = useAsync(() => api.audit(), []);
  return (
    <div className="space-y-6">
      <Header title="Auditoria" subtitle="Acoes administrativas, licenciamento e dispositivos." />
      <Table rows={data ?? []} columns={[["Data", (row) => new Date(row.createdAt).toLocaleString("pt-BR")], ["Acao", (row) => row.action], ["Entidade", (row) => row.entity ?? "-"], ["Usuario", (row) => row.user?.email ?? "-"], ["Detalhes", (row) => row.details ?? "-"]]} />
    </div>
  );
};

export const Logs = () => {
  const { data } = useAsync(() => api.logs(), []);
  return (
    <div className="space-y-6">
      <Header title="Logs de sync" subtitle="Eventos tecnicos da fila offline-first." />
      <Table rows={data ?? []} columns={[["Data", (row) => new Date(row.createdAt).toLocaleString("pt-BR")], ["Device", (row) => row.deviceId], ["Entidade", (row) => row.entity], ["Operacao", (row) => row.operation], ["Status", (row) => row.status], ["Mensagem", (row) => row.message ?? "-"]]} />
    </div>
  );
};

const Header = ({ title, subtitle }: { title: string; subtitle: string }) => (
  <div>
    <h1 className="text-3xl font-black">{title}</h1>
    <p className="mt-1 text-sm font-semibold text-slate-400">{subtitle}</p>
  </div>
);

const Action = ({ children, onClick }: { children: string; onClick: () => void }) => (
  <button className="h-8 rounded-lg bg-white/10 px-3 text-xs font-black text-slate-100 hover:bg-white/20" onClick={onClick}>
    {children}
  </button>
);

const Table = ({ rows, columns }: { rows: any[]; columns: Array<[string, (row: any) => any]> }) => (
  <section className="panel overflow-hidden">
    <table className="w-full">
      <thead className="bg-white/5 text-left text-xs font-black uppercase text-slate-400">
        <tr>{columns.map(([label]) => <th key={label} className="px-4 py-3">{label}</th>)}</tr>
      </thead>
      <tbody>
        {rows.length ? rows.map((row, index) => (
          <tr key={row.id ?? index}>
            {columns.map(([label, render]) => (
              <td key={label} className="border-t border-white/10 px-4 py-3 text-sm text-slate-200">
                {render(row) ?? "-"}
              </td>
            ))}
          </tr>
        )) : (
          <tr>
            <td className="px-4 py-10 text-center text-sm font-semibold text-slate-400" colSpan={columns.length}>Nenhum registro encontrado.</td>
          </tr>
        )}
      </tbody>
    </table>
  </section>
);

