import { Activity, AlertTriangle, Building2, CheckCircle2, Cloud, KeyRound, MonitorSmartphone, TrendingUp } from "lucide-react";
import { formatCurrency } from "@nexpdv/shared";
import { Metric } from "@/components/Metric";
import { useAsync } from "@/hooks/useAsync";
import { api } from "@/services/api";

const moduleLabel: Record<string, string> = { pix: "Pix", fiscal: "Fiscal", cloud: "Cloud", mobile: "Mobile", intelligence: "Intelligence" };

export const Dashboard = () => {
  const dashboard = useAsync(() => api.dashboard(), []);
  const metrics = dashboard.data ?? {};
  const modules = Object.entries(metrics.modules ?? {}) as Array<[string, number]>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-black">Dashboard Admin SaaS</h1>
          <p className="mt-1 text-sm font-semibold text-slate-400">Visão central de empresas, licenças, dispositivos e operação sincronizada dos PDVs.</p>
        </div>
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-black text-emerald-300">
          Cloud {metrics.cloudStatus ?? "validando"}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <Metric label="Total empresas" value={String(metrics.totalCompanies ?? 0)} icon={<Building2 size={20} />} />
        <Metric label="Empresas ativas" value={String(metrics.activeCompanies ?? 0)} icon={<CheckCircle2 size={20} />} />
        <Metric label="Licenças ativas" value={String(metrics.licensesActive ?? 0)} icon={<KeyRound size={20} />} />
        <Metric label="Dispositivos online" value={String(metrics.devicesOnline ?? 0)} icon={<MonitorSmartphone size={20} />} />
        <Metric label="Faturamento sync hoje" value={formatCurrency(Number(metrics.revenueSyncedToday ?? 0))} icon={<TrendingUp size={20} />} />
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <Metric label="Bloqueadas/inativas" value={String(metrics.blockedCompanies ?? 0)} icon={<AlertTriangle size={20} />} />
        <Metric label="Licenças vencendo" value={String(metrics.licensesExpiring ?? 0)} icon={<AlertTriangle size={20} />} />
        <Metric label="Licenças vencidas" value={String(metrics.licensesExpired ?? 0)} icon={<AlertTriangle size={20} />} />
        <Metric label="Dispositivos offline" value={String(metrics.devicesOffline ?? 0)} icon={<MonitorSmartphone size={20} />} />
        <Metric label="Vendas sync hoje" value={String(metrics.salesSyncedToday ?? 0)} icon={<Activity size={20} />} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="panel overflow-hidden">
          <div className="border-b border-white/10 p-5">
            <h2 className="text-lg font-black">Últimos PDVs conectados</h2>
          </div>
          <table className="w-full">
            <thead className="bg-white/5 text-left text-xs font-black uppercase text-slate-400">
              <tr><th className="px-4 py-3">PDV</th><th className="px-4 py-3">Empresa</th><th className="px-4 py-3">Versão</th><th className="px-4 py-3">Última conexão</th></tr>
            </thead>
            <tbody>
              {(metrics.recentDevices ?? []).map((device: any) => (
                <tr key={device.id}>
                  <td className="border-t border-white/10 px-4 py-3 font-bold">{device.shortCode ?? device.name}</td>
                  <td className="border-t border-white/10 px-4 py-3">{device.company?.tradeName ?? device.company?.name}</td>
                  <td className="border-t border-white/10 px-4 py-3">{device.appVersion ?? "-"}</td>
                  <td className="border-t border-white/10 px-4 py-3">{device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString("pt-BR") : "-"}</td>
                </tr>
              ))}
              {!(metrics.recentDevices ?? []).length ? <tr><td className="px-4 py-10 text-center text-sm font-semibold text-slate-400" colSpan={4}>Nenhum PDV conectado ainda.</td></tr> : null}
            </tbody>
          </table>
        </section>

        <section className="panel p-5">
          <div className="flex items-center gap-3">
            <Cloud size={22} className="text-cobalt" />
            <h2 className="text-lg font-black">Módulos mais usados</h2>
          </div>
          <div className="mt-5 space-y-3">
            {modules.length ? modules.map(([key, count]) => (
              <div key={key}>
                <div className="flex justify-between text-sm font-bold"><span>{moduleLabel[key] ?? key}</span><span>{count}</span></div>
                <div className="mt-2 h-2 rounded-full bg-white/10"><div className="h-2 rounded-full bg-cobalt" style={{ width: `${Math.min(100, count * 18)}%` }} /></div>
              </div>
            )) : <p className="text-sm font-semibold text-slate-400">Nenhum módulo ativo ainda.</p>}
          </div>
        </section>
      </div>

      <section className="panel overflow-hidden">
        <div className="border-b border-white/10 p-5">
          <h2 className="text-lg font-black">Erros recentes dos PDVs</h2>
        </div>
        <table className="w-full">
          <thead className="bg-white/5 text-left text-xs font-black uppercase text-slate-400">
            <tr><th className="px-4 py-3">Empresa</th><th className="px-4 py-3">Dispositivo</th><th className="px-4 py-3">Entidade</th><th className="px-4 py-3">Erro</th></tr>
          </thead>
          <tbody>
            {(metrics.recentErrors ?? []).map((job: any) => (
              <tr key={job.id}>
                <td className="border-t border-white/10 px-4 py-3">{job.company?.tradeName ?? job.company?.name}</td>
                <td className="border-t border-white/10 px-4 py-3">{job.device?.shortCode ?? job.device?.name ?? "-"}</td>
                <td className="border-t border-white/10 px-4 py-3">{job.entity}</td>
                <td className="border-t border-white/10 px-4 py-3">{job.lastError ?? "Falha de sincronização"}</td>
              </tr>
            ))}
            {!(metrics.recentErrors ?? []).length ? <tr><td className="px-4 py-10 text-center text-sm font-semibold text-slate-400" colSpan={4}>Sem erros recentes.</td></tr> : null}
          </tbody>
        </table>
      </section>
    </div>
  );
};
