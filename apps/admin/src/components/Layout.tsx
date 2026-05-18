import { Building2, CreditCard, FileClock, KeyRound, LayoutDashboard, ListTree, MonitorSmartphone, ShieldCheck, Users } from "lucide-react";
import type { ReactNode } from "react";
import type { Session } from "@/services/api";

const nav = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "companies", label: "Empresas", icon: Building2 },
  { id: "plans", label: "Planos", icon: CreditCard },
  { id: "licenses", label: "Licencas", icon: KeyRound },
  { id: "devices", label: "Dispositivos", icon: MonitorSmartphone },
  { id: "users", label: "Usuarios SaaS", icon: Users },
  { id: "sync", label: "Sincronizacao", icon: ListTree },
  { id: "audit", label: "Auditoria", icon: ShieldCheck },
  { id: "logs", label: "Logs", icon: FileClock }
];

export const Layout = ({
  session,
  page,
  onPage,
  onLogout,
  children
}: {
  session: Session;
  page: string;
  onPage: (page: string) => void;
  onLogout: () => void;
  children: ReactNode;
}) => (
  <div className="min-h-screen bg-[#080B12] text-slate-100">
    <aside className="fixed inset-y-0 left-0 w-72 border-r border-white/10 bg-[#0D1320] p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white text-ink">
          <Building2 size={21} />
        </div>
        <div>
          <div className="text-lg font-black">NexPDV Admin</div>
          <div className="text-xs font-bold text-slate-400">SaaS Control Center</div>
        </div>
      </div>
      <nav className="mt-8 space-y-1">
        {nav.map((item) => {
          const Icon = item.icon;
          const active = item.id === page;
          return (
            <button
              key={item.id}
              className={`flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-bold transition ${
                active ? "bg-white text-ink" : "text-slate-300 hover:bg-white/10"
              }`}
              onClick={() => onPage(item.id)}
            >
              <Icon size={18} />
              {item.label}
            </button>
          );
        })}
      </nav>
      <div className="absolute bottom-5 left-5 right-5 rounded-lg border border-white/10 bg-white/5 p-4">
        <div className="text-sm font-black">{session.user.name}</div>
        <div className="mt-1 text-xs font-semibold text-slate-400">{session.user.email}</div>
        <button className="mt-4 h-10 w-full rounded-lg bg-white text-sm font-black text-ink" onClick={onLogout}>
          Sair
        </button>
      </div>
    </aside>
    <main className="ml-72 min-h-screen p-8">{children}</main>
  </div>
);
