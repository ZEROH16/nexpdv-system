import { Activity, Building2, CheckCircle2, Cloud, KeyRound, MonitorSmartphone } from "lucide-react";
import { Metric } from "@/components/Metric";
import { useAsync } from "@/hooks/useAsync";
import { api } from "@/services/api";

export const Dashboard = () => {
  const dashboard = useAsync(() => api.dashboard(), []);
  const companies = useAsync(() => api.companies(), []);
  const licenses = useAsync(() => api.licenses(), []);

  const metrics = dashboard.data ?? {
    companies: 0,
    devicesOnline: 0,
    salesSynced: 0,
    licensesActive: 0,
    syncPending: 0,
    cloudStatus: "loading"
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-black">Dashboard SaaS</h1>
          <p className="mt-1 text-sm font-semibold text-slate-400">Central operacional para empresas, licencas, dispositivos e sincronizacao.</p>
        </div>
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-black text-emerald-300">
          Cloud {metrics.cloudStatus}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-4">
        <Metric label="Empresas ativas" value={String(metrics.companies)} icon={<Building2 size={20} />} />
        <Metric label="Dispositivos online" value={String(metrics.devicesOnline)} icon={<MonitorSmartphone size={20} />} />
        <Metric label="Licencas ativas" value={String(metrics.licensesActive)} icon={<KeyRound size={20} />} />
        <Metric label="Vendas sync" value={String(metrics.salesSynced)} icon={<CheckCircle2 size={20} />} />
        <Metric label="Pendencias sync" value={String(metrics.syncPending)} icon={<Activity size={20} />} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-6">
        <section className="panel overflow-hidden">
          <div className="border-b border-white/10 p-5">
            <h2 className="text-lg font-black">Empresas recentes</h2>
          </div>
          <table className="w-full">
            <thead className="bg-white/5 text-left text-xs font-black uppercase text-slate-400">
              <tr>
                <th className="px-4 py-3">Empresa</th>
                <th className="px-4 py-3">Plano</th>
                <th className="px-4 py-3">Licenca</th>
                <th className="px-4 py-3">Dispositivos</th>
              </tr>
            </thead>
            <tbody>
              {(companies.data ?? []).slice(0, 8).map((company) => (
                <tr key={company.id}>
                  <td className="border-t border-white/10 px-4 py-3 font-bold">{company.tradeName ?? company.name}</td>
                  <td className="border-t border-white/10 px-4 py-3">{company.subscriptions?.[0]?.plan?.code ?? "-"}</td>
                  <td className="border-t border-white/10 px-4 py-3">{company.licenses?.[0]?.status ?? "sem licenca"}</td>
                  <td className="border-t border-white/10 px-4 py-3">{company.devices?.length ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="panel p-5">
          <div className="flex items-center gap-3">
            <Cloud size={22} className="text-cobalt" />
            <h2 className="text-lg font-black">Status Cloud</h2>
          </div>
          <div className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-slate-400">API</span><strong>Online</strong></div>
            <div className="flex justify-between"><span className="text-slate-400">Banco cloud</span><strong>Pronto</strong></div>
            <div className="flex justify-between"><span className="text-slate-400">Licenciamento</span><strong>Centralizado</strong></div>
            <div className="flex justify-between"><span className="text-slate-400">Sync futuro</span><strong>Fila preparada</strong></div>
          </div>
          <div className="mt-5 rounded-lg bg-white/5 p-4 text-xs font-semibold text-slate-400">
            {licenses.data?.length ?? 0} licenca(s) cadastrada(s) no ambiente SaaS.
          </div>
        </section>
      </div>
    </div>
  );
};

