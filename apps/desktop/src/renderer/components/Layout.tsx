import {
  BarChart3,
  Boxes,
  Building2,
  CreditCard,
  History,
  LayoutDashboard,
  MonitorDot,
  Package,
  ReceiptText,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Menu,
  LockKeyhole,
  LogOut,
  Users
} from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { usePdvStore } from "@/store/usePdvStore";
import { useAsync } from "@/hooks/useAsync";
import { desktopApi } from "@/services/desktopApi";
import type { AuthState } from "@/services/desktopApi";
import { Button } from "./Button";
import { StatusBadge } from "./StatusBadge";

const nav = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "pos", label: "Frente de caixa", icon: ShoppingCart },
  { id: "products", label: "Produtos", icon: Package },
  { id: "customers", label: "Clientes", icon: Users },
  { id: "cash", label: "Caixa", icon: CreditCard },
  { id: "management", label: "Gestao", icon: ShieldCheck },
  { id: "sales", label: "Historico", icon: History },
  { id: "reports", label: "Relatorios", icon: BarChart3 },
  { id: "settings", label: "Configuracoes", icon: Settings }
];

export const Layout = ({ children, authState, onAuthChanged }: { children: ReactNode; authState?: AuthState; onAuthChanged?: () => void }) => {
  const { page, setPage, focusMode, sidebarPinned } = usePdvStore();
  const [managementUnlocked, setManagementUnlocked] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminError, setAdminError] = useState<string>();
  const { data: systemState } = useAsync(() => desktopApi.system.state(), []);
  const sync = useSyncStatus();
  const cloudEnabled = systemState?.cloudEnabled ?? false;
  const canManage = Boolean(authState?.user?.permissions?.includes("access_management"));
  const visibleNav = nav.filter((item) => item.id !== "management" || managementUnlocked || canManage);
  const posFocusActive = page === "pos" && focusMode;
  const hideSidebar = posFocusActive && !sidebarPinned;
  const statusTone = !cloudEnabled ? "green" : sync.online ? (sync.pending ? "amber" : "green") : "red";
  const statusText = !cloudEnabled ? "Backup local ativo" : sync.online ? (sync.pending ? `${sync.pending} pendentes` : "Sincronizado") : "Offline";

  const unlockManagement = async () => {
    const result = await desktopApi.auth.authorize({ pin: adminPassword, password: adminPassword, permission: "access_management", requireManager: true });
    if (!result.ok) {
      setAdminError(result.message);
      return;
    }
    setManagementUnlocked(true);
    setAdminOpen(false);
    setAdminPassword("");
    setAdminError(undefined);
    setPage("management");
  };

  const lockPdv = async () => {
    await desktopApi.auth.lock();
    onAuthChanged?.();
  };

  const logout = async () => {
    await desktopApi.auth.logout(authState?.session?.id);
    onAuthChanged?.();
  };

  return (
    <div className="flex min-h-screen bg-cloud text-slate-900 dark:bg-slate-950 dark:text-white">
      <aside className={`${hideSidebar ? "hidden" : "flex"} w-72 shrink-0 flex-col border-r border-slate-200 bg-white/90 px-5 py-5 dark:border-slate-800 dark:bg-slate-950`}>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-ink text-white dark:bg-white dark:text-ink">
            <MonitorDot size={22} />
          </div>
          <div>
            <div className="text-lg font-black tracking-normal">NexPDV</div>
            <div className="text-xs font-medium text-slate-500">Retail Cloud Suite</div>
          </div>
        </div>

        <nav className="mt-8 space-y-1">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = page === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setPage(item.id)}
                className={`flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold transition ${
                  active
                    ? "bg-ink text-white shadow-soft dark:bg-white dark:text-ink"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"
                }`}
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto space-y-3">
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-white text-sm font-black text-ink dark:bg-slate-950 dark:text-white">
            {systemState?.company.logoUrl ? <img className="h-full w-full object-cover" src={systemState.company.logoUrl} alt="" /> : (systemState?.company.tradeName ?? "N").slice(0, 1)}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-black">{systemState?.company.tradeName ?? "NexPDV Store"}</div>
            <div className="truncate text-xs text-slate-500">{systemState?.company.document ?? "Backup local ativo"}</div>
          </div>
        </div>
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase text-slate-500">{cloudEnabled ? "Cloud" : "Local"}</span>
            <StatusBadge tone={statusTone}>{statusText}</StatusBadge>
          </div>
          {cloudEnabled ? <div className="grid grid-cols-3 gap-2 text-center text-xs text-slate-500">
            <span className="rounded-md bg-white py-2 dark:bg-slate-950">
              <Building2 className="mx-auto mb-1" size={14} />
              Loja
            </span>
            <span className="rounded-md bg-white py-2 dark:bg-slate-950">
              <Boxes className="mx-auto mb-1" size={14} />
              Estoque
            </span>
            <span className="rounded-md bg-white py-2 dark:bg-slate-950">
              <ReceiptText className="mx-auto mb-1" size={14} />
              Vendas
            </span>
          </div> : null}
        </div>
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        {!posFocusActive ? <div className="border-b border-slate-200 bg-white/80 px-8 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-normal">{nav.find((item) => item.id === page)?.label}</h1>
              <p className="text-sm text-slate-500">NexPDV Commerce OS</p>
            </div>
            <div className="flex items-center gap-3">
              {authState?.user ? (
                <div className="hidden rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold dark:bg-slate-900 lg:block">
                  {authState.user.name}
                  <span className="ml-2 text-xs text-slate-500">{authState.user.roleName}</span>
                </div>
              ) : null}
              <Button variant="ghost" className="h-10 px-3" onClick={lockPdv} title="Bloquear PDV">
                <LockKeyhole size={18} />
              </Button>
              <Button variant="ghost" className="h-10 px-3" onClick={logout} title="Sair">
                <LogOut size={18} />
              </Button>
              <Button variant="ghost" className="h-10 px-3" onClick={() => setAdminOpen(true)} title="Administracao">
                <Menu size={18} />
              </Button>
              {cloudEnabled ? <StatusBadge tone={statusTone}>{statusText}</StatusBadge> : null}
            </div>
          </div>
        </div> : null}
        <div className={`flex-1 overflow-auto ${posFocusActive ? "p-4" : "p-8"}`}>{children}</div>
      </main>
      {adminOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-8">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-2xl dark:bg-slate-950">
            <h2 className="text-xl font-black">Acesso de gestao</h2>
            <p className="mt-1 text-sm text-slate-500">Informe o PIN ou senha de gerente/admin.</p>
            <input className="field mt-5 w-full" type="password" placeholder="PIN ou senha" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} autoFocus />
            {adminError ? <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{adminError}</div> : null}
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setAdminOpen(false)}>Cancelar</Button>
              <Button onClick={unlockManagement}>Entrar</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
