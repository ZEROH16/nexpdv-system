import { Building2, CreditCard, FileClock, LayoutDashboard, ListTree, Users } from "lucide-react";
import type { ReactNode } from "react";
import type { Session } from "@/services/api";

const nav = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "companies", label: "Empresas", icon: Building2 },
  { id: "users", label: "Usuarios", icon: Users },
  { id: "plans", label: "Planos", icon: CreditCard },
  { id: "sync", label: "Sincronizacao", icon: ListTree },
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
  <div className="min-h-screen bg-cloud text-ink">
    <aside className="fixed inset-y-0 left-0 w-72 border-r border-slate-200 bg-white p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-ink text-white">
          <Building2 size={21} />
        </div>
        <div>
          <div className="text-lg font-black">NexPDV Admin</div>
          <div className="text-xs font-bold text-slate-500">SaaS Control Center</div>
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
                active ? "bg-ink text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
              onClick={() => onPage(item.id)}
            >
              <Icon size={18} />
              {item.label}
            </button>
          );
        })}
      </nav>
      <div className="absolute bottom-5 left-5 right-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="text-sm font-black">{session.user.name}</div>
        <div className="mt-1 text-xs font-semibold text-slate-500">{session.user.email}</div>
        <button className="mt-4 h-10 w-full rounded-lg bg-white text-sm font-black text-ink ring-1 ring-slate-200" onClick={onLogout}>
          Sair
        </button>
      </div>
    </aside>
    <main className="ml-72 min-h-screen p-8">{children}</main>
  </div>
);
