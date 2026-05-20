import { useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Cloud,
  Copy,
  DatabaseBackup,
  Edit3,
  Eye,
  Lock,
  MessageCircle,
  MoreHorizontal,
  Plus,
  RefreshCcw,
  ShieldOff,
  Trash2,
  type LucideIcon
} from "lucide-react";
import { formatCurrency } from "@nexpdv/shared";
import { useAsync } from "@/hooks/useAsync";
import { api } from "@/services/api";

type Tone = "green" | "red" | "amber" | "orange" | "slate" | "blue";
type Field = { key: string; label: string; type?: "text" | "number" | "date" | "select" | "textarea" | "checkbox"; options?: Array<{ value: string; label: string }> };
type Action = { label: string; icon: LucideIcon; onClick: () => void; danger?: boolean };
type ConfirmState = {
  title: string;
  message: string;
  confirmLabel?: string;
  confirmationText?: string;
  secondaryLabel?: string;
  onConfirm: () => void | Promise<void>;
  onSecondary?: () => void | Promise<void>;
  danger?: boolean;
};

const featureKeys = ["pix", "fiscal", "cloud", "mobile", "intelligence"] as const;
const permissionKeys = ["gerenciar empresas", "gerenciar planos", "gerenciar licencas", "gerenciar dispositivos", "gerenciar usuarios SaaS", "ver auditoria", "ver logs", "acessar NEX CLOUD", "financeiro", "suporte"];
const roleOptions = ["super_admin", "admin", "suporte", "financeiro", "comercial", "leitura"].map((value) => ({ value, label: value }));
const billingOptions = [
  { value: "monthly", label: "Mensal" },
  { value: "annual", label: "Anual" },
  { value: "lifetime", label: "Vitalicio" }
];
const companyStatusOptions = [
  { value: "active", label: "Ativa" },
  { value: "inactive", label: "Inativa" },
  { value: "blocked", label: "Bloqueada" }
];
const licenseStatusOptions = [
  { value: "active", label: "Ativa" },
  { value: "blocked", label: "Bloqueada" },
  { value: "cancelled", label: "Cancelada" },
  { value: "expired", label: "Vencida" },
  { value: "trial", label: "Teste" }
];
const deviceStatusOptions = [
  { value: "active", label: "Ativo" },
  { value: "inactive", label: "Inativo" },
  { value: "blocked", label: "Bloqueado" }
];

export const Companies = () => {
  const { data, loading, error, refresh } = useAsync(() => api.companies(), []);
  const feedback = useFeedback();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<any>();
  const [details, setDetails] = useState<any>();
  const rows = filterRows(data ?? [], search, ["name", "tradeName", "document", "email"]);

  const save = async (input: any) => {
    await feedback.run(async () => {
      const payload = clean(input);
      if (editing?.id) await api.updateCompany(editing.id, payload);
      else await api.createCompany(payload);
      setEditing(undefined);
      await refresh();
    }, editing?.id ? "Empresa atualizada." : "Empresa criada.");
  };

  const deleteCompany = (row: any) => {
    feedback.ask({
      title: "Excluir empresa",
      message: `Excluir ${row.tradeName ?? row.name}? Se houver vinculos, o painel vai pedir uma confirmacao forte ou voce pode inativar.`,
      confirmLabel: "Excluir",
      secondaryLabel: "Inativar",
      danger: true,
      onSecondary: () => feedback.run(() => api.setCompanyStatus(row.id, "inactive").then(refresh), "Empresa inativada."),
      onConfirm: async () => {
        try {
          await api.deleteCompany(row.id);
          feedback.success("Empresa excluida.");
          await refresh();
        } catch (error) {
          const payload = errorPayload(error);
          if (payload?.linked) {
            feedback.ask({
              title: "Empresa com vinculos",
              message: "Esta empresa possui licencas, dispositivos, vendas ou sync. Para excluir definitivamente, confirme como super_admin.",
              confirmationText: payload.confirmation ?? "EXCLUIR DEFINITIVO",
              confirmLabel: "Excluir definitivo",
              secondaryLabel: "Inativar empresa",
              danger: true,
              onSecondary: () => feedback.run(() => api.setCompanyStatus(row.id, "inactive").then(refresh), "Empresa inativada."),
              onConfirm: () => feedback.run(() => api.deleteCompany(row.id, { force: true, confirmation: payload.confirmation ?? "EXCLUIR DEFINITIVO" }).then(refresh), "Empresa excluida definitivamente.")
            });
            return;
          }
          feedback.fail(error);
        }
      }
    });
  };

  const openDetails = async (id: string) => {
    try {
      setDetails(await api.companyDetails(id));
    } catch (error) {
      feedback.fail(error);
    }
  };

  return (
    <Page>
      {feedback.node}
      <Header title="Empresas" subtitle="Clientes SaaS, licencas, dispositivos e saude cloud." action={<Button onClick={() => setEditing(companyBlank())}><Plus size={16} />Nova empresa</Button>} />
      <Toolbar search={search} onSearch={setSearch} placeholder="Buscar empresa, documento ou email" filters={<span>{rows.length} empresa(s)</span>} />
      <DataState loading={loading} error={error}>
        <Table
          rows={rows}
          columns={[
            ["Empresa", (row) => <div><strong>{row.tradeName ?? row.name}</strong><p className="text-xs text-slate-500">{row.email ?? row.phone ?? "-"}</p></div>],
            ["Documento", (row) => row.document],
            ["Status", (row) => <Badge tone={companyTone(row.status)}>{statusLabel(row.status)}</Badge>],
            ["Licencas", (row) => String(row.licenses?.length ?? 0)],
            ["PDVs", (row) => String(row.devices?.length ?? 0)],
            ["Acoes", (row) => <ActionMenu items={[
              { label: "Detalhes", icon: Eye, onClick: () => openDetails(row.id) },
              { label: "Editar", icon: Edit3, onClick: () => setEditing(companyFrom(row)) },
              { label: "Bloquear", icon: Lock, onClick: () => feedback.ask({ title: "Bloquear empresa", message: `Bloquear ${row.tradeName ?? row.name}?`, confirmLabel: "Bloquear", danger: true, onConfirm: () => feedback.run(() => api.setCompanyStatus(row.id, "blocked").then(refresh), "Empresa bloqueada.") }) },
              { label: "Inativar", icon: ShieldOff, onClick: () => feedback.ask({ title: "Inativar empresa", message: `Inativar ${row.tradeName ?? row.name}?`, confirmLabel: "Inativar", onConfirm: () => feedback.run(() => api.setCompanyStatus(row.id, "inactive").then(refresh), "Empresa inativada.") }) },
              { label: "Excluir", icon: Trash2, danger: true, onClick: () => deleteCompany(row) }
            ]} />]
          ]}
        />
      </DataState>
      {editing ? <Modal title={editing.id ? "Editar empresa" : "Nova empresa"} onClose={() => setEditing(undefined)}><Form fields={companyFields} value={editing} onSubmit={save} /></Modal> : null}
      {details ? <CompanyDetails data={details} onClose={() => setDetails(undefined)} /> : null}
    </Page>
  );
};

export const Plans = () => {
  const { data, loading, error, refresh } = useAsync(() => api.plans(), []);
  const feedback = useFeedback();
  const [editing, setEditing] = useState<any>();

  const save = async (input: any) => {
    await feedback.run(async () => {
      const payload = {
        ...input,
        price: Number(input.price),
        maxStores: Number(input.maxStores),
        maxUsers: Number(input.maxUsers),
        maxDevices: Number(input.maxDevices),
        graceDays: Number(input.graceDays)
      };
      if (editing?.id) await api.updatePlan(editing.id, payload);
      else await api.savePlan(payload);
      setEditing(undefined);
      await refresh();
    }, editing?.id ? "Plano atualizado." : "Plano criado.");
  };

  const deletePlan = (plan: any) => {
    feedback.ask({
      title: "Excluir plano",
      message: `Excluir o plano ${plan.name}? Planos em uso serao bloqueados para exclusao.`,
      confirmLabel: "Excluir",
      secondaryLabel: plan.active ? "Inativar" : undefined,
      danger: true,
      onSecondary: () => feedback.run(() => api.setPlanStatus(plan.id, false).then(refresh), "Plano inativado."),
      onConfirm: async () => {
        try {
          await api.deletePlan(plan.id);
          feedback.success("Plano excluido.");
          await refresh();
        } catch (error) {
          if (statusCode(error) === 409) {
            feedback.ask({
              title: "Plano em uso",
              message: "Este plano tem licencas ou assinaturas vinculadas. A alternativa segura e inativar.",
              confirmLabel: "Inativar plano",
              onConfirm: () => feedback.run(() => api.setPlanStatus(plan.id, false).then(refresh), "Plano inativado.")
            });
            return;
          }
          feedback.fail(error);
        }
      }
    });
  };

  return (
    <Page>
      {feedback.node}
      <Header title="Planos" subtitle="Precos, limites, modulos e regras comerciais." action={<Button onClick={() => setEditing(planBlank())}><Plus size={16} />Novo plano</Button>} />
      <DataState loading={loading} error={error}>
        <div className="grid gap-4 xl:grid-cols-3">
          {(data ?? []).map((plan) => {
            const features = parseJson(plan.featuresJson);
            return (
              <article key={plan.id} className="panel p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-black">{plan.name}</h2>
                    <p className="mt-1 text-xs font-bold text-slate-500">{plan.code} | {periodLabel(plan.billingPeriod)}</p>
                  </div>
                  <ActionMenu items={[
                    { label: "Editar", icon: Edit3, onClick: () => setEditing(planFrom(plan)) },
                    { label: "Duplicar", icon: Copy, onClick: () => feedback.run(() => api.duplicatePlan(plan.id).then(refresh), "Plano duplicado.") },
                    { label: plan.active ? "Inativar" : "Ativar", icon: ShieldOff, onClick: () => feedback.ask({ title: plan.active ? "Inativar plano" : "Ativar plano", message: `${plan.active ? "Inativar" : "Ativar"} ${plan.name}?`, confirmLabel: plan.active ? "Inativar" : "Ativar", onConfirm: () => feedback.run(() => api.setPlanStatus(plan.id, !plan.active).then(refresh), "Status do plano atualizado.") }) },
                    { label: "Excluir", icon: Trash2, danger: true, onClick: () => deletePlan(plan) }
                  ]} />
                </div>
                <div className="mt-4 flex items-end justify-between gap-3">
                  <strong className="text-3xl">{formatCurrency(Number(plan.price))}</strong>
                  <Badge tone={plan.active ? "green" : "slate"}>{plan.active ? "ativo" : "inativo"}</Badge>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs font-bold text-slate-300">
                  <span className="rounded bg-white/5 p-2">{plan.maxDevices} disp.</span>
                  <span className="rounded bg-white/5 p-2">{plan.maxUsers} users</span>
                  <span className="rounded bg-white/5 p-2">{plan.maxStores} lojas</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">{featureKeys.map((key) => <Badge key={key} tone={features[key] ? "green" : "slate"}>{featureLabel(key)}</Badge>)}</div>
              </article>
            );
          })}
        </div>
      </DataState>
      {editing ? <Modal title={editing.id ? "Editar plano" : "Novo plano"} onClose={() => setEditing(undefined)}><PlanForm value={editing} onSubmit={save} /></Modal> : null}
    </Page>
  );
};

export const Licenses = () => {
  const companies = useAsync(() => api.companies(), []);
  const plans = useAsync(() => api.plans(), []);
  const { data, loading, error, refresh } = useAsync(() => api.licenses(), []);
  const feedback = useFeedback();
  const [editing, setEditing] = useState<any>();
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [plan, setPlan] = useState("all");
  const rows = useMemo(() => filterLicenses(data ?? [], search, status, plan), [data, search, status, plan]);

  const generate = async (input: any) => {
    await feedback.run(async () => {
      await api.generateLicense(input);
      setCreating(false);
      await refresh();
    }, "Licenca gerada.");
  };
  const save = async (input: any) => {
    await feedback.run(async () => {
      await api.updateLicense(editing.id, { ...input, maxDevices: Number(input.maxDevices), features: input.features });
      setEditing(undefined);
      await refresh();
    }, "Licenca atualizada.");
  };

  const deleteLicense = (row: any) => {
    feedback.ask({
      title: "Excluir licenca",
      message: `Excluir ${row.key}? Licencas com dispositivos exigem confirmacao forte.`,
      confirmLabel: "Excluir",
      danger: true,
      onConfirm: async () => {
        try {
          await api.deleteLicense(row.id);
          feedback.success("Licenca excluida.");
          await refresh();
        } catch (error) {
          const payload = errorPayload(error);
          if (payload?.linked) {
            feedback.ask({
              title: "Licenca com dispositivo",
              message: "Para excluir definitivamente, os dispositivos serao desvinculados/inativados.",
              confirmationText: payload.confirmation ?? "EXCLUIR LICENCA",
              confirmLabel: "Excluir definitivo",
              secondaryLabel: "Cancelar licenca",
              danger: true,
              onSecondary: () => feedback.run(() => api.cancelLicense(row.id).then(refresh), "Licenca cancelada."),
              onConfirm: () => feedback.run(() => api.deleteLicense(row.id, { force: true, confirmation: payload.confirmation ?? "EXCLUIR LICENCA" }).then(refresh), "Licenca excluida.")
            });
            return;
          }
          feedback.fail(error);
        }
      }
    });
  };

  return (
    <Page>
      {feedback.node}
      <Header title="Licencas" subtitle="Geracao, bloqueio, renovacao, reset de ativacao e modulos por cliente." action={<Button onClick={() => setCreating(true)}><Plus size={16} />Gerar licenca</Button>} />
      <Toolbar search={search} onSearch={setSearch} placeholder="Buscar chave ou empresa" filters={<div className="flex gap-2"><SmallSelect value={status} onChange={setStatus} options={[{ value: "all", label: "Todos status" }, ...licenseStatusOptions]} /><SmallSelect value={plan} onChange={setPlan} options={[{ value: "all", label: "Todos planos" }, ...(plans.data ?? []).map((item: any) => ({ value: item.code, label: item.code }))]} /></div>} />
      <DataState loading={loading} error={error}>
        <Table rows={rows} columns={[
          ["Chave", (row) => <span className="font-mono text-xs">{row.key}</span>],
          ["Empresa", (row) => row.company?.tradeName ?? row.company?.name],
          ["Plano", (row) => <Badge tone="blue">{row.planCode}</Badge>],
          ["Status", (row) => <LicenseStatus row={row} />],
          ["Validade", (row) => new Date(row.validUntil).toLocaleDateString("pt-BR")],
          ["PDVs", (row) => `${row.devices?.filter((device: any) => device.status === "active").length ?? 0}/${row.maxDevices}`],
          ["Acoes", (row) => <ActionMenu items={[
            { label: "Editar", icon: Edit3, onClick: () => setEditing(licenseFrom(row)) },
            { label: "Bloquear", icon: Lock, onClick: () => feedback.run(() => api.blockLicense(row.id, "Bloqueio via painel").then(refresh), "Licenca bloqueada.") },
            { label: "Desbloquear", icon: RefreshCcw, onClick: () => feedback.run(() => api.unblockLicense(row.id).then(refresh), "Licenca desbloqueada.") },
            { label: "Renovar", icon: CheckCircle2, onClick: () => { const validUntil = prompt("Nova validade (AAAA-MM-DD)", dateOnly(addDaysLocal(new Date(), 365).toISOString())); if (validUntil) void feedback.run(() => api.renewLicense(row.id, validUntil).then(refresh), "Licenca renovada."); } },
            { label: "Resetar ativacao", icon: RefreshCcw, onClick: () => feedback.ask({ title: "Resetar ativacao", message: "Dispositivos vinculados serao inativados para nova ativacao.", confirmLabel: "Resetar", onConfirm: () => feedback.run(() => api.resetActivation(row.id).then(refresh), "Ativacao resetada.") }) },
            { label: "Cancelar", icon: Ban, danger: true, onClick: () => feedback.ask({ title: "Cancelar licenca", message: `Cancelar ${row.key}?`, confirmLabel: "Cancelar", danger: true, onConfirm: () => feedback.run(() => api.cancelLicense(row.id).then(refresh), "Licenca cancelada.") }) },
            { label: "Excluir", icon: Trash2, danger: true, onClick: () => deleteLicense(row) }
          ]} />]
        ]} />
      </DataState>
      {creating ? <Modal title="Gerar licenca" onClose={() => setCreating(false)}><Form fields={licenseCreateFields(companies.data ?? [], plans.data ?? [])} value={{ companyId: "", planCode: "PRO", validUntil: "2027-12-31" }} onSubmit={generate} /></Modal> : null}
      {editing ? <Modal title="Editar licenca" onClose={() => setEditing(undefined)}><LicenseForm value={editing} onSubmit={save} /></Modal> : null}
    </Page>
  );
};

export const Devices = () => {
  const { data, loading, error, refresh } = useAsync(() => api.devices(), []);
  const feedback = useFeedback();
  const [editing, setEditing] = useState<any>();
  return (
    <Page>
      {feedback.node}
      <Header title="Dispositivos" subtitle="PDVs ativados, nomes amigaveis, status online e bloqueios." />
      <DataState loading={loading} error={error}>
        <Table rows={data ?? []} columns={[
          ["Identificador", (row) => <strong>{row.shortCode ?? row.name ?? readableDevice(row)}</strong>],
          ["Empresa", (row) => row.company?.tradeName ?? row.company?.name],
          ["Sistema", (row) => row.os ?? row.platform],
          ["Online", (row) => <Badge tone={row.online ? "green" : "slate"}>{row.online ? "online" : "offline"}</Badge>],
          ["Status", (row) => <Badge tone={companyTone(row.status)}>{statusLabel(row.status)}</Badge>],
          ["Ultima conexao", (row) => row.lastSeenAt ? new Date(row.lastSeenAt).toLocaleString("pt-BR") : "-"],
          ["Acoes", (row) => <ActionMenu items={[
            { label: "Editar", icon: Edit3, onClick: () => setEditing({ id: row.id, name: row.name, shortCode: row.shortCode ?? readableDevice(row), status: row.status }) },
            { label: "Bloquear", icon: Lock, onClick: () => feedback.run(() => api.blockDevice(row.id).then(refresh), "Dispositivo bloqueado.") },
            { label: "Desativar", icon: ShieldOff, onClick: () => feedback.run(() => api.deactivateDevice(row.id).then(refresh), "Dispositivo desativado.") },
            { label: "Remover", icon: Trash2, danger: true, onClick: () => feedback.ask({ title: "Remover dispositivo", message: `Remover ${row.shortCode ?? row.name}?`, confirmLabel: "Remover", danger: true, onConfirm: () => feedback.run(() => api.deleteDevice(row.id).then(refresh), "Dispositivo removido.") }) }
          ]} />]
        ]} />
      </DataState>
      {editing ? <Modal title="Editar dispositivo" onClose={() => setEditing(undefined)}><Form fields={deviceFields} value={editing} onSubmit={(input) => feedback.run(() => api.updateDevice(editing.id, input).then(async () => { setEditing(undefined); await refresh(); }), "Dispositivo atualizado.")} /></Modal> : null}
    </Page>
  );
};

export const Users = () => {
  const { data, loading, error, refresh } = useAsync(() => api.users(), []);
  const feedback = useFeedback();
  const session = api.restore();
  const [editing, setEditing] = useState<any>();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");
  const rows = (data ?? []).filter((row) => {
    const matchesSearch = filterRows([row], search, ["name", "email", "platformRole"]).length > 0;
    const matchesRole = role === "all" || row.platformRole === role;
    const matchesStatus = status === "all" || (status === "active" ? row.active : !row.active);
    return matchesSearch && matchesRole && matchesStatus;
  });

  const save = async (input: any) => {
    await feedback.run(async () => {
      if (editing.id) await api.updateUser(editing.id, input);
      else await api.createUser(input);
      setEditing(undefined);
      await refresh();
    }, editing.id ? "Usuario atualizado." : "Usuario criado.");
  };

  return (
    <Page>
      {feedback.node}
      <Header title="Usuarios SaaS" subtitle="Acesso ao painel admin. Estes usuarios nao sao operadores do PDV." action={<Button onClick={() => setEditing(userBlank())}><Plus size={16} />Novo usuario</Button>} />
      <Toolbar search={search} onSearch={setSearch} placeholder="Buscar usuario, email ou papel" filters={<div className="flex gap-2"><SmallSelect value={role} onChange={setRole} options={[{ value: "all", label: "Todos papeis" }, ...roleOptions]} /><SmallSelect value={status} onChange={setStatus} options={[{ value: "all", label: "Todos status" }, { value: "active", label: "Ativos" }, { value: "inactive", label: "Inativos" }]} /></div>} />
      <DataState loading={loading} error={error}>
        <Table rows={rows} columns={[
          ["Usuario", (row) => <div><strong>{row.name}</strong><p className="text-xs text-slate-500">{row.email}</p></div>],
          ["Papel", (row) => <Badge tone={row.platformRole === "super_admin" ? "blue" : row.platformRole === "company_user" ? "amber" : "slate"}>{row.platformRole}</Badge>],
          ["2FA", (row) => <Badge tone={row.twoFactorEnabled ? "green" : "amber"}>{row.twoFactorEnabled ? "ativo" : row.firstAccessRequired ? "primeiro acesso" : "pendente"}</Badge>],
          ["Status", (row) => <Badge tone={row.active ? "green" : "red"}>{row.active ? "ativo" : "inativo"}</Badge>],
          ["Ultimo acesso", (row) => row.lastLoginAt ? new Date(row.lastLoginAt).toLocaleString("pt-BR") : "-"],
          ["Acoes", (row) => <ActionMenu items={[
            { label: "Editar", icon: Edit3, onClick: () => setEditing(userFrom(row)) },
            { label: "Reset senha", icon: RefreshCcw, onClick: () => { const password = prompt("Nova senha temporaria"); if (password) void feedback.run(() => api.resetUserPassword(row.id, password).then(refresh), "Senha redefinida."); } },
            { label: row.active ? "Inativar" : "Ativar", icon: ShieldOff, onClick: () => feedback.run(() => api.updateUser(row.id, { active: !row.active }).then(refresh), "Status do usuario atualizado.") },
            { label: "Desativar 2FA", icon: ShieldOff, onClick: () => feedback.run(() => api.disableUser2fa(row.id).then(refresh), "2FA desativado.") },
            { label: "Excluir", icon: Trash2, danger: true, onClick: () => feedback.ask({ title: "Excluir usuario SaaS", message: row.id === session?.user.id ? "Voce esta tentando excluir o proprio usuario. O backend bloqueia se for o unico super_admin ativo." : `Excluir ${row.email}?`, confirmLabel: "Excluir", danger: true, onConfirm: () => feedback.run(() => api.deleteUser(row.id).then(refresh), "Usuario excluido.") }) }
          ]} />]
        ]} />
      </DataState>
      {editing ? <Modal title={editing.id ? "Editar usuario SaaS" : "Novo usuario SaaS"} onClose={() => setEditing(undefined)}><UserForm value={editing} onSubmit={save} /></Modal> : null}
    </Page>
  );
};

export const NexCloud = () => {
  const health = useAsync(() => api.cloudHealth(), []);
  const logs = useAsync(() => api.logs(), []);
  const feedback = useFeedback();
  const [details, setDetails] = useState<any>();
  const rows = health.data?.companies ?? [];
  const metrics = health.data?.metrics ?? {};

  const copyWarning = async (row: any) => {
    const text = `Ola, ${row.name}. Identificamos que o backup/cloud do NexPDV esta ${row.backupLabel}. Ultimo backup: ${row.lastBackupAt ? new Date(row.lastBackupAt).toLocaleString("pt-BR") : "nunca registrado"}. Recomendamos abrir o PDV com internet para normalizar a protecao dos dados.`;
    await navigator.clipboard?.writeText(text);
    feedback.success("Mensagem copiada para WhatsApp/email.");
  };

  return (
    <Page>
      {feedback.node}
      <Header title="NEX CLOUD" subtitle="Saude cloud, backups, conexoes, licencas e sync das empresas." />
      <DataState loading={health.loading} error={health.error}>
        <div className="grid gap-4 xl:grid-cols-5">
          <PanelMetric label="Empresas ativas" value={metrics.activeCompanies ?? 0} icon={<Cloud size={18} />} />
          <PanelMetric label="Empresas online" value={metrics.onlineCompanies ?? 0} icon={<CheckCircle2 size={18} />} />
          <PanelMetric label="Sem conexao" value={metrics.companiesWithoutConnection ?? 0} icon={<AlertTriangle size={18} />} />
          <PanelMetric label="Backups hoje" value={metrics.backupsToday ?? 0} icon={<DatabaseBackup size={18} />} />
          <PanelMetric label="Backups atrasados" value={metrics.backupsLate ?? 0} icon={<AlertTriangle size={18} />} />
          <PanelMetric label="Licencas ativas" value={metrics.activeLicenses ?? 0} icon={<CheckCircle2 size={18} />} />
          <PanelMetric label="Licencas inativas" value={metrics.inactiveLicenses ?? 0} icon={<Ban size={18} />} />
          <PanelMetric label="Sync pendente" value={metrics.syncPending ?? 0} icon={<RefreshCcw size={18} />} />
          <PanelMetric label="Erros recentes" value={metrics.recentErrors ?? 0} icon={<AlertTriangle size={18} />} />
        </div>
        <Table rows={rows} columns={[
          ["Empresa", (row) => <div><strong>{row.name}</strong><p className="text-xs text-slate-500">{row.document}</p></div>],
          ["Plano", (row) => row.plan],
          ["Licenca", (row) => <Badge tone={row.licenseStatus === "active" ? "green" : "red"}>{row.licenseStatus}</Badge>],
          ["PDVs online", (row) => `${row.devicesOnline}/${row.devicesTotal}`],
          ["Ultimo backup", (row) => <BackupBadge row={row} />],
          ["Ultimo sync", (row) => row.lastSyncAt ? new Date(row.lastSyncAt).toLocaleString("pt-BR") : "-"],
          ["Cloud", (row) => <Badge tone={row.cloudStatus === "online" ? "green" : row.cloudStatus === "erro" ? "red" : "amber"}>{row.cloudStatus}</Badge>],
          ["Acoes", (row) => <ActionMenu items={[
            { label: "Detalhes", icon: Eye, onClick: () => setDetails(row) },
            { label: "Copiar aviso", icon: MessageCircle, onClick: () => void copyWarning(row) },
            { label: "Marcar avisado", icon: CheckCircle2, onClick: () => feedback.run(() => api.markCloudCompanyNotified(row.id).then(health.refresh), "Cliente marcado como avisado.") },
            { label: "Ver logs cloud", icon: Cloud, onClick: () => feedback.success(`Logs carregados: ${logs.data?.length ?? 0} evento(s).`) }
          ]} />]
        ]} />
      </DataState>
      {details ? <CloudDetails data={details} onClose={() => setDetails(undefined)} /> : null}
    </Page>
  );
};

export const SyncMonitor = NexCloud;

export const Audit = () => {
  const { data, loading, error } = useAsync(() => api.audit(), []);
  return (
    <Page>
      <Header title="Auditoria" subtitle="Log de seguranca, login, alteracoes sensiveis, licencas e dispositivos." />
      <DataState loading={loading} error={error}>
        <Table rows={data ?? []} columns={[
          ["Data", (row) => new Date(row.createdAt).toLocaleString("pt-BR")],
          ["Acao", (row) => row.action],
          ["Entidade", (row) => row.entity ?? "-"],
          ["Usuario", (row) => row.user?.email ?? "-"],
          ["IP", (row) => row.ip ?? "-"],
          ["Detalhes", (row) => row.details ?? "-"]
        ]} />
      </DataState>
    </Page>
  );
};

export const Logs = () => {
  const { data, loading, error } = useAsync(() => api.logs(), []);
  return (
    <Page>
      <Header title="Logs dos PDVs" subtitle="Eventos tecnicos da fila offline-first com filtros futuros por empresa, data, status e dispositivo." />
      <DataState loading={loading} error={error}>
        <Table rows={data ?? []} columns={[["Data", (row) => new Date(row.createdAt).toLocaleString("pt-BR")], ["Device", (row) => row.deviceId], ["Entidade", (row) => row.entity], ["Operacao", (row) => row.operation], ["Status", (row) => row.status], ["Mensagem", (row) => row.message ?? "-"]]} />
      </DataState>
    </Page>
  );
};

const Page = ({ children }: { children: ReactNode }) => <div className="space-y-6">{children}</div>;

const Header = ({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) => (
  <div className="flex flex-wrap items-start justify-between gap-4">
    <div><h1 className="text-3xl font-black">{title}</h1><p className="mt-1 text-sm font-semibold text-slate-400">{subtitle}</p></div>
    {action}
  </div>
);

const Toolbar = ({ search, onSearch, filters, placeholder }: { search: string; onSearch: (value: string) => void; filters?: ReactNode; placeholder?: string }) => (
  <section className="panel flex flex-wrap items-center justify-between gap-3 p-4">
    <input className="field max-w-md" value={search} onChange={(event) => onSearch(event.target.value)} placeholder={placeholder ?? "Buscar..."} />
    <div className="text-sm font-bold text-slate-400">{filters}</div>
  </section>
);

const Badge = ({ children, tone = "slate" }: { children: ReactNode; tone?: Tone }) => {
  const classes = {
    green: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20",
    red: "bg-red-500/10 text-red-300 ring-red-500/20",
    amber: "bg-amber-500/10 text-amber-300 ring-amber-500/20",
    orange: "bg-orange-500/10 text-orange-300 ring-orange-500/20",
    blue: "bg-blue-500/10 text-blue-300 ring-blue-500/20",
    slate: "bg-white/10 text-slate-300 ring-white/10"
  };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ring-1 ${classes[tone]}`}>{children}</span>;
};

const Button = ({ children, onClick }: { children: ReactNode; onClick: () => void }) => (
  <button className="inline-flex h-11 items-center gap-2 rounded-lg bg-white px-4 text-sm font-black text-ink" onClick={onClick}>{children}</button>
);

const ActionMenu = ({ items }: { items: Action[] }) => (
  <details className="group relative inline-block">
    <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-lg bg-white/10 px-3 text-xs font-black text-slate-100 hover:bg-white/20">
      <MoreHorizontal size={15} />Acoes
    </summary>
    <div className="absolute right-0 z-30 mt-2 w-52 rounded-lg border border-white/10 bg-[#111827] p-2 shadow-panel">
      {items.map(({ label, icon: Icon, onClick, danger }) => (
        <button
          key={label}
          className={`flex h-9 w-full items-center gap-2 rounded-md px-3 text-left text-xs font-black hover:bg-white/10 ${danger ? "text-red-200" : "text-slate-100"}`}
          onClick={(event) => {
            event.currentTarget.closest("details")?.removeAttribute("open");
            onClick();
          }}
        >
          <Icon size={14} />{label}
        </button>
      ))}
    </div>
  </details>
);

const Table = ({ rows, columns }: { rows: any[]; columns: Array<[string, (row: any) => ReactNode]> }) => (
  <section className="panel overflow-auto">
    <table className="w-full min-w-[900px]">
      <thead className="bg-white/5 text-left text-xs font-black uppercase text-slate-400"><tr>{columns.map(([label]) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead>
      <tbody>
        {rows.length ? rows.map((row, index) => <tr key={row.id ?? index} className="hover:bg-white/[0.025]">{columns.map(([label, render]) => <td key={label} className="border-t border-white/10 px-4 py-3 text-sm text-slate-200">{render(row) ?? "-"}</td>)}</tr>) : (
          <tr><td className="px-4 py-12 text-center text-sm font-semibold text-slate-400" colSpan={columns.length}>Nenhum registro encontrado.</td></tr>
        )}
      </tbody>
    </table>
  </section>
);

const Modal = ({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
    <section className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-lg border border-white/10 bg-[#0D1320] p-6 shadow-panel">
      <div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-black">{title}</h2><button className="rounded-lg bg-white/10 px-3 py-2 text-sm font-black" onClick={onClose}>Fechar</button></div>
      {children}
    </section>
  </div>
);

const ConfirmDialog = ({ state, onClose }: { state: ConfirmState; onClose: () => void }) => {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const canConfirm = !state.confirmationText || text === state.confirmationText;
  const submit = async (action?: () => void | Promise<void>) => {
    if (!action) return;
    setLoading(true);
    try {
      await action();
      onClose();
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-6">
      <section className="w-full max-w-lg rounded-lg border border-white/10 bg-[#0D1320] p-6 shadow-panel">
        <h2 className="text-xl font-black">{state.title}</h2>
        <p className="mt-2 text-sm font-semibold text-slate-300">{state.message}</p>
        {state.confirmationText ? (
          <div className="mt-4">
            <div className="text-xs font-black uppercase text-slate-500">Digite para confirmar: {state.confirmationText}</div>
            <input className="field mt-2 w-full font-mono" value={text} onChange={(event) => setText(event.target.value)} />
          </div>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button className="h-10 rounded-lg bg-white/10 px-4 text-sm font-black" onClick={onClose}>Voltar</button>
          {state.secondaryLabel ? <button className="h-10 rounded-lg bg-amber-500/20 px-4 text-sm font-black text-amber-100" disabled={loading} onClick={() => void submit(state.onSecondary)}>{state.secondaryLabel}</button> : null}
          <button className={`h-10 rounded-lg px-4 text-sm font-black ${state.danger ? "bg-red-400 text-red-950" : "bg-white text-ink"} disabled:opacity-50`} disabled={!canConfirm || loading} onClick={() => void submit(state.onConfirm)}>
            {loading ? "Aguarde..." : state.confirmLabel ?? "Confirmar"}
          </button>
        </div>
      </section>
    </div>
  );
};

const DataState = ({ loading, error, children }: { loading?: boolean; error?: string; children: ReactNode }) => {
  if (loading) return <section className="panel p-8 text-sm font-bold text-slate-400">Carregando dados...</section>;
  if (error) return <section className="panel border-red-500/30 p-8 text-sm font-bold text-red-200">{error}</section>;
  return <>{children}</>;
};

const Notice = ({ text, tone }: { text: string; tone: "green" | "red" }) => (
  <div className={`fixed right-5 top-5 z-[70] rounded-lg px-4 py-3 text-sm font-black shadow-panel ring-1 ${tone === "green" ? "bg-emerald-500/15 text-emerald-100 ring-emerald-500/30" : "bg-red-500/15 text-red-100 ring-red-500/30"}`}>{text}</div>
);

const useFeedback = () => {
  const [notice, setNotice] = useState<{ text: string; tone: "green" | "red" }>();
  const [confirm, setConfirm] = useState<ConfirmState>();
  const success = (text: string) => {
    setNotice({ text, tone: "green" });
    window.setTimeout(() => setNotice(undefined), 3200);
  };
  const fail = (error: unknown) => {
    setNotice({ text: errorMessage(error), tone: "red" });
    window.setTimeout(() => setNotice(undefined), 5000);
  };
  const run = async (action: () => Promise<unknown> | unknown, successMessage: string) => {
    try {
      await action();
      success(successMessage);
    } catch (error) {
      fail(error);
    }
  };
  return {
    ask: setConfirm,
    success,
    fail,
    run,
    node: (
      <>
        {notice ? <Notice text={notice.text} tone={notice.tone} /> : null}
        {confirm ? <ConfirmDialog state={confirm} onClose={() => setConfirm(undefined)} /> : null}
      </>
    )
  };
};

const Form = ({ fields, value, onSubmit }: { fields: Field[]; value: any; onSubmit: (input: any) => void | Promise<void> }) => {
  const [form, setForm] = useState(value);
  return (
    <form className="grid gap-4 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void onSubmit(form); }}>
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

const SmallSelect = ({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) => (
  <select className="h-9 rounded-lg border border-white/10 bg-white/5 px-3 text-xs font-bold text-slate-200 outline-none" value={value} onChange={(event) => onChange(event.target.value)}>
    {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
  </select>
);

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
      <button className="h-11 rounded-lg bg-white px-5 text-sm font-black text-ink">Salvar licenca</button>
    </form>
  );
};

const UserForm = ({ value, onSubmit }: { value: any; onSubmit: (input: any) => void }) => {
  const [form, setForm] = useState(value);
  return (
    <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); onSubmit(form); }}>
      <div className="grid gap-4 md:grid-cols-2">{userFields.map((field) => <FieldControl key={field.key} field={field} form={form} setForm={setForm} />)}</div>
      <section className="rounded-lg bg-white/5 p-4">
        <h3 className="font-black">Permissoes SaaS</h3>
        <p className="mt-1 text-xs font-bold text-slate-500">Permissoes especificas do painel admin central.</p>
        <div className="mt-3 grid gap-2 md:grid-cols-2">{permissionKeys.map((item) => <label key={item} className="flex items-center gap-2 text-sm font-bold text-slate-300"><input type="checkbox" checked={Boolean(form.permissions?.[item])} onChange={(event) => setForm({ ...form, permissions: { ...form.permissions, [item]: event.target.checked } })} />{item}</label>)}</div>
      </section>
      <button className="h-11 rounded-lg bg-white px-5 text-sm font-black text-ink">Salvar usuario</button>
    </form>
  );
};

const FeatureToggles = ({ value, onChange }: { value: any; onChange: (features: any) => void }) => (
  <section className="rounded-lg bg-white/5 p-4">
    <h3 className="font-black">Modulos liberados</h3>
    <div className="mt-3 flex flex-wrap gap-4">{featureKeys.map((key) => <label key={key} className="flex items-center gap-2 text-sm font-bold text-slate-300"><input type="checkbox" checked={Boolean(value?.[key])} onChange={(event) => onChange({ ...value, [key]: event.target.checked })} />{featureLabel(key)}</label>)}</div>
  </section>
);

const CompanyDetails = ({ data, onClose }: { data: any; onClose: () => void }) => (
  <Modal title={`Detalhes: ${data.tradeName ?? data.name}`} onClose={onClose}>
    <div className="grid gap-4 md:grid-cols-4">
      <PanelMetric label="Vendas sync" value={data._count?.sales ?? 0} />
      <PanelMetric label="Faturamento sync" value={formatCurrency(Number(data.metrics?.revenueSynced ?? 0))} />
      <PanelMetric label="Dispositivos" value={data.devices?.length ?? 0} />
      <PanelMetric label="Licencas" value={data.licenses?.length ?? 0} />
    </div>
    <div className="mt-5 grid gap-5 md:grid-cols-2">
      <MiniList title="Dados cadastrais" rows={[data.document, data.email, data.phone, data.address].filter(Boolean)} />
      <MiniList title="Licencas" rows={(data.licenses ?? []).map((item: any) => `${item.key} | ${item.planCode} | ${item.status}`)} />
      <MiniList title="Dispositivos" rows={(data.devices ?? []).map((item: any) => `${item.shortCode ?? item.name} | ${item.status} | ${item.lastSeenAt ? new Date(item.lastSeenAt).toLocaleString("pt-BR") : "sem acesso"}`)} />
      <MiniList title="Cloud" rows={[`Ultimo backup: ${data.lastBackupAt ? new Date(data.lastBackupAt).toLocaleString("pt-BR") : "nunca"}`, `Ultimo sync: ${data.lastSyncAt ? new Date(data.lastSyncAt).toLocaleString("pt-BR") : "sem registro"}`, `Status: ${data.cloudHealth ?? "unknown"}`]} />
      <MiniList title="Logs recentes" rows={(data.logs ?? []).map((item: any) => `${new Date(item.createdAt).toLocaleString("pt-BR")} | ${item.action}`)} />
      <MiniList title="Sync jobs" rows={(data.syncJobs ?? []).map((item: any) => `${item.entity} | ${item.operation} | ${item.status}`)} />
    </div>
  </Modal>
);

const CloudDetails = ({ data, onClose }: { data: any; onClose: () => void }) => (
  <Modal title={`NEX CLOUD: ${data.name}`} onClose={onClose}>
    <div className="grid gap-4 md:grid-cols-3">
      <PanelMetric label="Status cloud" value={data.cloudStatus} />
      <PanelMetric label="Ultimo backup" value={data.lastBackupAt ? new Date(data.lastBackupAt).toLocaleDateString("pt-BR") : "nunca"} />
      <PanelMetric label="PDVs online" value={`${data.devicesOnline}/${data.devicesTotal}`} />
    </div>
    <div className="mt-5 rounded-lg bg-white/5 p-4 text-sm font-semibold text-slate-300">
      <p>Plano: {data.plan}</p>
      <p>Status licenca: {data.licenseStatus}</p>
      <p>Ultimo sync: {data.lastSyncAt ? new Date(data.lastSyncAt).toLocaleString("pt-BR") : "sem sync"}</p>
      <p>Cliente avisado: {data.cloudNotifiedAt ? new Date(data.cloudNotifiedAt).toLocaleString("pt-BR") : "nao"}</p>
    </div>
  </Modal>
);

const PanelMetric = ({ label, value, icon }: { label: string; value: ReactNode; icon?: ReactNode }) => <section className="panel p-5"><span className="flex items-center gap-2 text-sm font-bold text-slate-400">{icon}{label}</span><strong className="mt-2 block text-2xl">{value}</strong></section>;
const MiniList = ({ title, rows }: { title: string; rows: string[] }) => <section className="rounded-lg bg-white/5 p-4"><h3 className="font-black">{title}</h3><div className="mt-3 space-y-2 text-sm font-semibold text-slate-300">{rows.length ? rows.map((row) => <p key={row}>{row}</p>) : <p className="text-slate-500">Sem registros.</p>}</div></section>;

const BackupBadge = ({ row }: { row: any }) => {
  const tone: Tone = row.backupLevel === "green" ? "green" : row.backupLevel === "amber" ? "amber" : row.backupLevel === "orange" ? "orange" : row.backupLevel === "red" ? "red" : "slate";
  return <div><Badge tone={tone}>{row.backupLabel}</Badge><p className="mt-1 text-xs text-slate-500">{row.lastBackupAt ? new Date(row.lastBackupAt).toLocaleString("pt-BR") : "nunca"}</p></div>;
};

const companyFields: Field[] = [
  { key: "tradeName", label: "Nome fantasia" }, { key: "name", label: "Razao social" }, { key: "document", label: "CNPJ/CPF" }, { key: "stateRegistration", label: "Inscricao estadual" },
  { key: "phone", label: "Telefone" }, { key: "whatsapp", label: "WhatsApp" }, { key: "email", label: "Email" }, { key: "address", label: "Endereco" },
  { key: "city", label: "Cidade" }, { key: "state", label: "Estado" }, { key: "zipCode", label: "CEP" }, { key: "accountManager", label: "Responsavel comercial" },
  { key: "status", label: "Status", type: "select", options: companyStatusOptions }, { key: "internalNotes", label: "Observacoes internas", type: "textarea" }
];
const planFields: Field[] = [
  { key: "code", label: "Codigo" }, { key: "name", label: "Nome" }, { key: "price", label: "Preco", type: "number" }, { key: "maxDevices", label: "Limite dispositivos", type: "number" },
  { key: "maxUsers", label: "Limite usuarios", type: "number" }, { key: "maxStores", label: "Limite lojas", type: "number" }, { key: "billingPeriod", label: "Tipo", type: "select", options: billingOptions },
  { key: "graceDays", label: "Dias tolerancia", type: "number" }, { key: "description", label: "Descricao", type: "textarea" }, { key: "active", label: "Plano ativo", type: "checkbox" }
];
const licenseEditFields: Field[] = [
  { key: "status", label: "Status", type: "select", options: licenseStatusOptions },
  { key: "validUntil", label: "Validade", type: "date" }, { key: "maxDevices", label: "Limite dispositivos", type: "number" }, { key: "internalNotes", label: "Observacoes internas", type: "textarea" }
];
const userFields: Field[] = [
  { key: "name", label: "Nome" }, { key: "email", label: "Email" }, { key: "phone", label: "Telefone" }, { key: "platformRole", label: "Papel", type: "select", options: roleOptions },
  { key: "password", label: "Senha temporaria" }, { key: "active", label: "Usuario ativo", type: "checkbox" }
];
const deviceFields: Field[] = [{ key: "name", label: "Nome amigavel" }, { key: "shortCode", label: "Identificador curto" }, { key: "status", label: "Status", type: "select", options: deviceStatusOptions }];
const licenseCreateFields = (companies: any[], plans: any[]): Field[] => [
  { key: "companyId", label: "Empresa", type: "select", options: [{ value: "", label: "Selecione" }, ...companies.map((item) => ({ value: item.id, label: item.tradeName ?? item.name }))] },
  { key: "planCode", label: "Plano", type: "select", options: plans.map((item) => ({ value: item.code, label: item.name })) },
  { key: "validUntil", label: "Validade", type: "date" }
];

const companyBlank = () => ({ name: "", tradeName: "", document: "", stateRegistration: "", phone: "", whatsapp: "", email: "", address: "", city: "", state: "", zipCode: "", status: "active", internalNotes: "", accountManager: "" });
const companyFrom = (row: any) => ({ ...companyBlank(), ...row });
const planBlank = () => ({ code: "", name: "", description: "", price: 0, maxStores: 1, maxUsers: 1, maxDevices: 1, billingPeriod: "monthly", graceDays: 7, active: true, features: { pix: false, fiscal: false, cloud: false, mobile: false, intelligence: false }, extraFeatures: {} });
const planFrom = (row: any) => ({ ...planBlank(), ...row, features: parseJson(row.featuresJson), extraFeatures: parseJson(row.extraFeaturesJson) });
const licenseFrom = (row: any) => ({ id: row.id, status: row.status, validUntil: dateOnly(row.validUntil), maxDevices: row.maxDevices, internalNotes: row.internalNotes ?? "", features: parseJson(row.featuresJson) });
const userBlank = () => ({ name: "", email: "", phone: "", platformRole: "suporte", password: "", active: true, permissions: {} });
const userFrom = (row: any) => ({ ...userBlank(), ...row, password: "", permissions: parseJson(row.permissionsJson) });

const clean = (input: any) => Object.fromEntries(Object.entries(input).filter(([, value]) => value !== ""));
const dateOnly = (value?: string) => (value ? new Date(value).toISOString().slice(0, 10) : "");
const parseJson = (value?: string) => {
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
};
const filterRows = (rows: any[], search: string, keys: string[]) => {
  const term = search.trim().toLowerCase();
  if (!term) return rows;
  return rows.filter((row) => keys.some((key) => String(row[key] ?? "").toLowerCase().includes(term)));
};
const filterLicenses = (rows: any[], search: string, status: string, plan: string) => {
  const term = search.trim().toLowerCase();
  return rows.filter((row) => {
    const text = `${row.key} ${row.company?.tradeName ?? ""} ${row.company?.name ?? ""}`.toLowerCase();
    return (!term || text.includes(term)) && (status === "all" || row.status === status) && (plan === "all" || row.planCode === plan);
  });
};
const addDaysLocal = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);
const periodLabel = (value: string) => ({ monthly: "Mensal", annual: "Anual", lifetime: "Vitalicio" }[value] ?? value);
const readableDevice = (row: any) => `DEV-${String(row.deviceId ?? row.id).slice(-5).toUpperCase()}`;
const featureLabel = (key: string) => ({ pix: "Pix", fiscal: "Fiscal", cloud: "Cloud", mobile: "Mobile", intelligence: "Intelligence" }[key] ?? key);
const statusLabel = (value: string) => ({ active: "ativo", inactive: "inativo", blocked: "bloqueado" }[value] ?? value);
const companyTone = (status: string): Tone => status === "active" ? "green" : status === "blocked" ? "red" : "amber";
const statusCode = (error: unknown) => (error as Error & { status?: number }).status;
const errorPayload = (error: unknown) => (error as Error & { payload?: any }).payload;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Falha na operacao.";

const LicenseStatus = ({ row }: { row: any }) => {
  const validUntil = new Date(row.validUntil).getTime();
  const days = Math.ceil((validUntil - Date.now()) / 86_400_000);
  if (row.status === "blocked" || row.status === "cancelled") return <Badge tone="red">{row.status}</Badge>;
  if (days < 0) return <Badge tone="red">vencida</Badge>;
  if (days <= 30) return <Badge tone="amber">vence em {days}d</Badge>;
  return <Badge tone="green">{row.status}</Badge>;
};
