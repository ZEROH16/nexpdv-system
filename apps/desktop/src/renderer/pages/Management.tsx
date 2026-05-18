import { Building2, CheckCircle2, ClipboardCheck, Copy, History, RotateCcw, Shield, Users, XCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/Button";
import { useAsync } from "@/hooks/useAsync";
import { desktopApi, type SaveRoleInput, type SaveUserInput, type SecurityState } from "@/services/desktopApi";

type TabId = "employees" | "roles" | "sectors" | "approvals" | "audit";

const tabs: Array<{ id: TabId; label: string; icon: typeof Users }> = [
  { id: "employees", label: "Funcionarios", icon: Users },
  { id: "roles", label: "Cargos e permissoes", icon: Shield },
  { id: "sectors", label: "Setores", icon: Building2 },
  { id: "approvals", label: "Aprovacoes", icon: ClipboardCheck },
  { id: "audit", label: "Auditoria", icon: History }
];

const fallbackEmployees = [
  { id: "fallback_1", name: "Marina Costa", username: "marina", email: "marina@nexpdv.com.br", role: "Gerente", roleName: "Gerente", sector: "Gerencia", active: true },
  { id: "fallback_2", name: "Rafael Souza", username: "rafael", email: "rafael@nexpdv.com.br", role: "Operador de Caixa", roleName: "Operador de Caixa", sector: "Caixa", active: true },
  { id: "fallback_3", name: "Bianca Rocha", username: "bianca", email: "bianca@nexpdv.com.br", role: "Administrador", roleName: "Administrador", sector: "Administrativo", active: true },
  { id: "fallback_4", name: "Paulo Mendes", username: "paulo", email: "paulo@nexpdv.com.br", role: "Operador de Caixa", roleName: "Operador de Caixa", sector: "Caixa", active: false }
];

const fallbackPermissions = [
  "Acessar gestao",
  "Vender",
  "Cancelar venda",
  "Remover venda cancelada",
  "Aplicar desconto",
  "Abrir caixa",
  "Fechar caixa",
  "Cadastrar produto",
  "Editar produto",
  "Cadastrar cliente",
  "Excluir cliente",
  "Ver relatorios",
  "Configurar empresa",
  "Ativar cloud"
];

const fallbackRoles = [
  { name: "Operador de Caixa", permissions: ["Vender"] },
  { name: "Estoquista", permissions: ["Cadastrar produto", "Editar produto"] },
  { name: "Gerente", permissions: ["Acessar gestao", "Vender", "Cancelar venda", "Aplicar desconto", "Abrir caixa", "Fechar caixa", "Ver relatorios"] },
  { name: "Administrador", permissions: fallbackPermissions },
  { name: "Dono", permissions: fallbackPermissions }
];

const fallbackSectors = [
  { name: "Caixa", description: "Operacao de frente de loja e recebimentos.", people: 6 },
  { name: "Estoque", description: "Reposicao, inventario e conferencia.", people: 3 },
  { name: "Administrativo", description: "Cadastros, financeiro e suporte.", people: 2 },
  { name: "Gerencia", description: "Aprovacoes, relatorios e acompanhamento remoto.", people: 2 }
];

const approvals = [
  { type: "Desconto alto", requester: "Rafael Souza", detail: "18% na venda NV-20260516-8A2B", status: "Pendente" },
  { type: "Cancelamento de venda", requester: "Marina Costa", detail: "Cancelamento por item duplicado", status: "Aprovado" },
  { type: "Sangria", requester: "Bianca Rocha", detail: "Sangria de R$ 600,00", status: "Pendente" },
  { type: "Fechamento com diferenca", requester: "Rafael Souza", detail: "Diferenca de R$ 12,50", status: "Revisao" }
];

const audit = [
  { action: "Venda cancelada", user: "Marina Costa", when: "Hoje, 10:42", detail: "NV-20260516-8A2B" },
  { action: "Desconto aplicado", user: "Rafael Souza", when: "Hoje, 09:58", detail: "Desconto de 12%" },
  { action: "Caixa fechado", user: "Bianca Rocha", when: "Ontem, 18:11", detail: "Diferenca zerada" },
  { action: "Produto alterado", user: "Bianca Rocha", when: "Ontem, 14:20", detail: "Cafe Especial 500g" },
  { action: "Funcionario criado", user: "Marina Costa", when: "15/05, 16:04", detail: "Paulo Mendes" }
];

const StatusPill = ({ active }: { active: boolean }) => (
  <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold ${active ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-slate-100 text-slate-500 dark:bg-slate-800"}`}>
    {active ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
    {active ? "Ativo" : "Inativo"}
  </span>
);

export const Management = () => {
  const [tab, setTab] = useState<TabId>("employees");
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [userForm, setUserForm] = useState<SaveUserInput>({ name: "", username: "", email: "", phone: "", roleId: "role_cashier", sector: "Caixa", pin: "", password: "", active: true, notes: "", permissionOverrides: [] });
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [roleForm, setRoleForm] = useState<SaveRoleInput>({ name: "", level: 30, active: true, permissions: [] });
  const [userMessage, setUserMessage] = useState<string>();
  const { data: systemState, refresh } = useAsync(() => desktopApi.system.state(), []);
  const { data: auditLog } = useAsync(() => desktopApi.system.audit(), [tab]);
  const { data: security, refresh: refreshSecurity } = useAsync(() => desktopApi.system.security(), []);
  const permissionLabels = Object.fromEntries((security?.permissions ?? []).map((permission) => [permission.key, permission.label]));
  const employees = security?.users ?? fallbackEmployees;
  const permissionOptions = security?.permissions ?? [];
  const permissions = security?.permissions.map((permission) => permission.label) ?? fallbackPermissions;
  const sectors = security?.sectors ?? fallbackSectors;
  const getEmployeeRole = (employee: { role?: string; roleName?: string }) => employee.roleName ?? employee.role ?? "-";
  const openNewUser = () => {
    setUserForm({ name: "", username: "", email: "", phone: "", roleId: "role_cashier", sector: "Caixa", pin: "", password: "", active: true, notes: "", permissionOverrides: [] });
    setUserMessage(undefined);
    setUserModalOpen(true);
  };
  const openEditUser = (user: SecurityState["users"][number]) => {
    setUserForm({
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email ?? "",
      phone: user.phone ?? "",
      roleId: user.roleId ?? "role_cashier",
      sector: user.sector,
      pin: "",
      password: "",
      active: user.active,
      notes: user.notes ?? "",
      permissionOverrides: [
        ...(user.addedPermissions ?? []).map((permission) => ({ permission, effect: "allow" as const })),
        ...(user.removedPermissions ?? []).map((permission) => ({ permission, effect: "deny" as const }))
      ]
    });
    setUserMessage(undefined);
    setUserModalOpen(true);
  };
  const saveUser = async () => {
    try {
      await desktopApi.auth.saveUser(userForm);
      setUserModalOpen(false);
      setUserMessage("Usuario salvo.");
      refreshSecurity();
    } catch (error) {
      setUserMessage(error instanceof Error ? error.message : "Nao foi possivel salvar o usuario.");
    }
  };
  const toggleUser = async (user: SecurityState["users"][number]) => {
    await desktopApi.auth.setUserActive({ userId: user.id, active: !user.active });
    refreshSecurity();
  };
  const openNewRole = () => {
    setRoleForm({ name: "", level: 30, active: true, permissions: [] });
    setUserMessage(undefined);
    setRoleModalOpen(true);
  };
  const openEditRole = (role: SecurityState["roles"][number]) => {
    setRoleForm({ id: role.id, name: role.name, code: role.code, level: role.level, active: role.active, permissions: role.permissions });
    setUserMessage(undefined);
    setRoleModalOpen(true);
  };
  const saveRole = async () => {
    try {
      await desktopApi.auth.saveRole(roleForm);
      setRoleModalOpen(false);
      setUserMessage("Cargo salvo.");
      refreshSecurity();
    } catch (error) {
      setUserMessage(error instanceof Error ? error.message : "Nao foi possivel salvar o cargo.");
    }
  };
  const duplicateRole = async (roleId: string) => {
    try {
      await desktopApi.auth.duplicateRole(roleId);
      setUserMessage("Cargo duplicado.");
      refreshSecurity();
    } catch (error) {
      setUserMessage(error instanceof Error ? error.message : "Nao foi possivel duplicar o cargo.");
    }
  };
  const toggleRole = async (role: SecurityState["roles"][number]) => {
    try {
      await desktopApi.auth.setRoleActive({ roleId: role.id, active: !role.active });
      refreshSecurity();
    } catch (error) {
      setUserMessage(error instanceof Error ? error.message : "Nao foi possivel alterar o cargo.");
    }
  };
  const resetRole = async (roleId: string) => {
    try {
      await desktopApi.auth.resetRoleDefaults(roleId);
      setUserMessage("Permissoes padrao restauradas.");
      refreshSecurity();
    } catch (error) {
      setUserMessage(error instanceof Error ? error.message : "Nao foi possivel restaurar o padrao.");
    }
  };
  const setUserOverride = (permission: string, effect?: "allow" | "deny") => {
    const next = (userForm.permissionOverrides ?? []).filter((item) => item.permission !== permission);
    if (effect) next.push({ permission, effect });
    setUserForm({ ...userForm, permissionOverrides: next });
  };

  return (
    <div className="space-y-6">
      <section className="panel p-5">
        <div className="mb-4 flex items-center justify-between rounded-lg bg-slate-50 p-4 dark:bg-slate-950">
          <div>
            <div className="text-sm font-bold">Usar controle de funcionarios e permissoes</div>
            <div className="text-xs text-slate-500">Quando desligado, este computador libera a operacao normal. A Gestao ainda exige senha.</div>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={systemState?.usePermissions ?? false}
              onChange={async (event) => {
                await desktopApi.system.settings({ usePermissions: event.target.checked });
                refresh();
              }}
            />
            Ativo
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          {tabs.map((item) => {
            const Icon = item.icon;
            const active = item.id === tab;
            return (
              <button
                key={item.id}
                className={`flex h-11 items-center gap-2 rounded-lg px-4 text-sm font-bold transition ${
                  active ? "bg-ink text-white dark:bg-white dark:text-ink" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"
                }`}
                onClick={() => setTab(item.id)}
              >
                <Icon size={17} />
                {item.label}
              </button>
            );
          })}
        </div>
      </section>

      {tab === "employees" ? (
        <section className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800">
            <div>
              <h2 className="text-lg font-black">Usuarios</h2>
              <p className="text-sm text-slate-500">Operadores, gerentes e administradores com PIN rapido e permissoes.</p>
            </div>
            <Button onClick={openNewUser}>Novo usuario</Button>
          </div>
          {userMessage ? <div className="border-b border-slate-200 p-3 text-sm dark:border-slate-800">{userMessage}</div> : null}
          <table className="w-full">
            <thead className="table-head">
              <tr>
                <th className="px-5 py-3">Nome</th>
                <th className="px-4 py-3">Login</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Cargo</th>
                <th className="px-4 py-3">Setor</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <tr key={employee.id ?? employee.email}>
                  <td className="table-cell font-bold">{employee.name}</td>
                  <td className="table-cell text-slate-500">{employee.username ?? employee.email}</td>
                  <td className="table-cell text-slate-500">{employee.email}</td>
                  <td className="table-cell">{getEmployeeRole(employee)}</td>
                  <td className="table-cell">{employee.sector}</td>
                  <td className="table-cell">
                    <StatusPill active={employee.active} />
                  </td>
                  <td className="table-cell">
                    {"id" in employee ? (
                      <div className="flex justify-end gap-2">
                        <Button className="h-9 px-3" variant="secondary" onClick={() => openEditUser(employee as SecurityState["users"][number])}>Editar</Button>
                        <Button className="h-9 px-3" variant="ghost" onClick={() => toggleUser(employee as SecurityState["users"][number])}>{employee.active ? "Inativar" : "Ativar"}</Button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {tab === "roles" ? (
        <section className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={openNewRole}>Novo cargo</Button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {(security?.roles ?? []).map((role) => (
              <article key={role.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-black">{role.name}</h2>
                    <div className="mt-1 text-xs font-semibold text-slate-500">Nivel {role.level} - {role.active ? "Ativo" : "Inativo"}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button className="h-9 px-3" variant="secondary" onClick={() => openEditRole(role)}>Editar</Button>
                    <Button className="h-9 px-3" variant="ghost" onClick={() => duplicateRole(role.id)}><Copy size={15} /></Button>
                    <Button className="h-9 px-3" variant="ghost" onClick={() => resetRole(role.id)}><RotateCcw size={15} /></Button>
                    <Button className="h-9 px-3" variant="ghost" onClick={() => toggleRole(role)}>{role.active ? "Inativar" : "Ativar"}</Button>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {permissionOptions.map((permission) => {
                    const allowed = role.permissions.includes(permission.key);
                    return (
                      <span key={permission.key} className={`rounded-md px-2 py-1 text-xs font-bold ${allowed ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-slate-100 text-slate-400 dark:bg-slate-800"}`}>
                        {permission.label}
                      </span>
                    );
                  })}
                </div>
              </article>
            ))}
            {!security?.roles?.length ? fallbackRoles.map((role) => (
              <article key={role.name} className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel dark:border-slate-800 dark:bg-slate-900">
                <h2 className="text-lg font-black">{role.name}</h2>
                <div className="mt-4 flex flex-wrap gap-2">{permissions.map((permission) => <span key={permission} className={`rounded-md px-2 py-1 text-xs font-bold ${role.permissions.includes(permission) ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-slate-100 text-slate-400 dark:bg-slate-800"}`}>{permission}</span>)}</div>
              </article>
            )) : null}
          </div>
        </section>
      ) : null}

      {tab === "sectors" ? (
        <section className="grid grid-cols-4 gap-4">
          {sectors.map((sector) => (
            <article key={sector.name} className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-lg font-black">{sector.name}</h2>
              <p className="mt-2 min-h-16 text-sm text-slate-500">{sector.description}</p>
              <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-950">
                <strong>{sector.people}</strong> funcionarios
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {tab === "approvals" ? (
        <section className="panel overflow-hidden">
          <div className="border-b border-slate-200 p-5 dark:border-slate-800">
            <h2 className="text-lg font-black">Aprovacoes</h2>
            <p className="text-sm text-slate-500">Eventos que exigem autorizacao gerencial.</p>
          </div>
          <table className="w-full">
            <thead className="table-head">
              <tr>
                <th className="px-5 py-3">Tipo</th>
                <th className="px-4 py-3">Solicitante</th>
                <th className="px-4 py-3">Detalhe</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {approvals.map((approval) => (
                <tr key={`${approval.type}-${approval.detail}`}>
                  <td className="table-cell font-bold">{approval.type}</td>
                  <td className="table-cell">{approval.requester}</td>
                  <td className="table-cell text-slate-500">{approval.detail}</td>
                  <td className="table-cell">
                    <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300">{approval.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {tab === "audit" ? (
        <section className="panel p-5">
          <h2 className="text-lg font-black">Auditoria</h2>
          <div className="mt-5 space-y-3">
            {(auditLog?.length ? auditLog.map((entry) => ({ action: entry.action, user: entry.actor, when: new Date(entry.createdAt).toLocaleString("pt-BR"), detail: entry.details ?? "" })) : audit).map((item) => (
              <div key={`${item.action}-${item.when}-${item.detail}`} className="flex items-center justify-between rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                <div>
                  <div className="font-bold">{item.action}</div>
                  <div className="text-sm text-slate-500">{item.user} · {item.detail}</div>
                </div>
                <span className="text-sm font-semibold text-slate-500">{item.when}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {roleModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-8">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-lg bg-white p-6 shadow-2xl dark:bg-slate-950">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-black">{roleForm.id ? "Editar cargo" : "Novo cargo"}</h2>
                <p className="text-sm text-slate-500">Permissoes efetivas sao validadas tambem no banco local.</p>
              </div>
              <button className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-900" onClick={() => setRoleModalOpen(false)}>
                <XCircle size={20} />
              </button>
            </div>
            <div className="mt-5 grid grid-cols-[1fr_120px_120px] gap-3">
              <label className="text-sm font-semibold">Nome do cargo<input className="field mt-1 w-full" value={roleForm.name} onChange={(event) => setRoleForm({ ...roleForm, name: event.target.value })} /></label>
              <label className="text-sm font-semibold">Nivel<input className="field mt-1 w-full" type="number" value={roleForm.level ?? 30} onChange={(event) => setRoleForm({ ...roleForm, level: Number(event.target.value) })} /></label>
              <label className="mt-7 flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={roleForm.active ?? true} onChange={(event) => setRoleForm({ ...roleForm, active: event.target.checked })} />Ativo</label>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              {permissionOptions.map((permission) => {
                const checked = roleForm.permissions.includes(permission.key);
                return (
                  <label key={permission.key} className={`flex items-center gap-3 rounded-lg border p-3 text-sm font-semibold ${checked ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" : "border-slate-200 dark:border-slate-800"}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => {
                        const permissions = event.target.checked
                          ? [...roleForm.permissions, permission.key]
                          : roleForm.permissions.filter((item) => item !== permission.key);
                        setRoleForm({ ...roleForm, permissions });
                      }}
                    />
                    {permission.label}
                  </label>
                );
              })}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setRoleModalOpen(false)}>Cancelar</Button>
              <Button disabled={!roleForm.name.trim()} onClick={() => void saveRole()}>Salvar cargo</Button>
            </div>
          </div>
        </div>
      ) : null}

      {userModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-8">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-lg bg-white p-6 shadow-2xl dark:bg-slate-950">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-black">{userForm.id ? "Editar usuario" : "Novo usuario"}</h2>
                <p className="text-sm text-slate-500">Senha e PIN ficam armazenados com hash no banco local.</p>
              </div>
              <button className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-900" onClick={() => setUserModalOpen(false)}>
                <XCircle size={20} />
              </button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <label className="text-sm font-semibold">Nome<input className="field mt-1 w-full" value={userForm.name} onChange={(event) => setUserForm({ ...userForm, name: event.target.value })} /></label>
              <label className="text-sm font-semibold">Login<input className="field mt-1 w-full" value={userForm.username} onChange={(event) => setUserForm({ ...userForm, username: event.target.value })} /></label>
              <label className="text-sm font-semibold">Email<input className="field mt-1 w-full" value={userForm.email ?? ""} onChange={(event) => setUserForm({ ...userForm, email: event.target.value })} /></label>
              <label className="text-sm font-semibold">Telefone<input className="field mt-1 w-full" value={userForm.phone ?? ""} onChange={(event) => setUserForm({ ...userForm, phone: event.target.value })} /></label>
              <label className="text-sm font-semibold">Cargo<select className="field mt-1 w-full" value={userForm.roleId} onChange={(event) => setUserForm({ ...userForm, roleId: event.target.value })}>{security?.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
              <label className="text-sm font-semibold">Setor<select className="field mt-1 w-full" value={userForm.sector ?? ""} onChange={(event) => setUserForm({ ...userForm, sector: event.target.value })}>{["Caixa", "Estoque", "Administrativo", "Gerencia"].map((sector) => <option key={sector}>{sector}</option>)}</select></label>
              <label className="text-sm font-semibold">PIN{userForm.id ? " novo opcional" : ""}<input className="field mt-1 w-full" inputMode="numeric" type="password" value={userForm.pin ?? ""} onChange={(event) => setUserForm({ ...userForm, pin: event.target.value.replace(/\D/g, "").slice(0, 8) })} /></label>
              <label className="text-sm font-semibold">Senha{userForm.id ? " nova opcional" : ""}<input className="field mt-1 w-full" type="password" value={userForm.password ?? ""} onChange={(event) => setUserForm({ ...userForm, password: event.target.value })} /></label>
              <label className="col-span-2 text-sm font-semibold">Observacoes<textarea className="field mt-1 h-20 w-full py-2" value={userForm.notes ?? ""} onChange={(event) => setUserForm({ ...userForm, notes: event.target.value })} /></label>
              <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={userForm.active ?? true} onChange={(event) => setUserForm({ ...userForm, active: event.target.checked })} />Usuario ativo</label>
            </div>
            {userForm.roleId ? (
              <div className="mt-5 rounded-lg bg-slate-50 p-4 dark:bg-slate-900">
                <div className="text-sm font-bold">Permissoes do cargo</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(security?.roles.find((role) => role.id === userForm.roleId)?.permissions ?? []).map((permission) => (
                    <span key={permission} className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      {permissionLabels[permission] ?? permission}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="mt-5 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
              <div className="text-sm font-bold">Permissoes por usuario</div>
              <p className="mt-1 text-xs text-slate-500">Use apenas para excecoes. Verde adiciona permissao, vermelho remove permissao herdada.</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {permissionOptions.map((permission) => {
                  const inherited = security?.roles.find((role) => role.id === userForm.roleId)?.permissions.includes(permission.key) ?? false;
                  const override = userForm.permissionOverrides?.find((item) => item.permission === permission.key)?.effect;
                  return (
                    <div key={permission.key} className="rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-900">
                      <div className="font-bold">{permission.label}</div>
                      <div className="mt-2 grid grid-cols-3 gap-1">
                        <button className={`rounded-md px-2 py-1 font-bold ${!override ? "bg-slate-800 text-white dark:bg-white dark:text-ink" : "bg-slate-200 dark:bg-slate-800"}`} onClick={() => setUserOverride(permission.key, undefined)}>Herdar</button>
                        <button className={`rounded-md px-2 py-1 font-bold ${override === "allow" ? "bg-emerald-600 text-white" : "bg-slate-200 dark:bg-slate-800"}`} onClick={() => setUserOverride(permission.key, "allow")}>Adicionar</button>
                        <button className={`rounded-md px-2 py-1 font-bold ${override === "deny" ? "bg-red-600 text-white" : "bg-slate-200 dark:bg-slate-800"}`} onClick={() => setUserOverride(permission.key, "deny")}>Remover</button>
                      </div>
                      <div className="mt-2 text-slate-500">{override === "allow" ? "Adicionada manualmente" : override === "deny" ? "Removida manualmente" : inherited ? "Herdada do cargo" : "Nao herdada"}</div>
                    </div>
                  );
                })}
              </div>
            </div>
            {userMessage ? <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{userMessage}</div> : null}
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setUserModalOpen(false)}>Cancelar</Button>
              <Button onClick={() => void saveUser()}>Salvar usuario</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
