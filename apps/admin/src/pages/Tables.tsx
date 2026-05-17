import { formatCurrency } from "@nexpdv/shared";
import { useAsync } from "@/hooks/useAsync";
import { api } from "@/services/api";

export const Companies = () => {
  const { data } = useAsync(() => api.companies(), []);
  return <Table title="Empresas" rows={data ?? []} columns={["tradeName", "document", "email", "createdAt"]} />;
};

export const Users = () => {
  const { data } = useAsync(() => api.users(), []);
  return <Table title="Usuarios" rows={data ?? []} columns={["name", "email", "role", "active"]} />;
};

export const Plans = () => {
  const { data } = useAsync(() => api.plans(), []);
  return (
    <section className="space-y-4">
      <h1 className="text-3xl font-black">Planos</h1>
      <div className="grid grid-cols-3 gap-4">
        {(data ?? []).map((plan) => (
          <article key={plan.id} className="panel p-5">
            <div className="text-xl font-black">{plan.name}</div>
            <div className="mt-3 text-3xl font-black">{formatCurrency(Number(plan.price))}</div>
            <div className="mt-4 text-sm font-semibold text-slate-500">{plan.maxStores} lojas · {plan.maxUsers} usuarios</div>
          </article>
        ))}
      </div>
    </section>
  );
};

export const SyncMonitor = () => {
  const subscriptions = useAsync(() => api.subscriptions(), []);
  const logs = useAsync(() => api.logs(), []);
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-black">Monitoramento</h1>
      <div className="grid grid-cols-3 gap-4">
        <section className="panel p-5"><span className="text-sm font-bold text-slate-500">Assinaturas</span><strong className="mt-2 block text-3xl">{subscriptions.data?.length ?? 0}</strong></section>
        <section className="panel p-5"><span className="text-sm font-bold text-slate-500">Eventos sync</span><strong className="mt-2 block text-3xl">{logs.data?.length ?? 0}</strong></section>
        <section className="panel p-5"><span className="text-sm font-bold text-slate-500">Falhas</span><strong className="mt-2 block text-3xl">{logs.data?.filter((log) => log.status === "failed").length ?? 0}</strong></section>
      </div>
      <Logs />
    </div>
  );
};

export const Logs = () => {
  const { data } = useAsync(() => api.logs(), []);
  return <Table title="Logs" rows={data ?? []} columns={["createdAt", "deviceId", "entity", "operation", "status", "message"]} />;
};

const Table = ({ title, rows, columns }: { title: string; rows: any[]; columns: string[] }) => (
  <section className="panel overflow-hidden">
    <div className="border-b border-slate-200 p-5">
      <h1 className="text-2xl font-black">{title}</h1>
    </div>
    <table className="w-full">
      <thead className="bg-slate-50 text-left text-xs font-black uppercase text-slate-500">
        <tr>{columns.map((column) => <th key={column} className="px-4 py-3">{column}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={row.id ?? index}>
            {columns.map((column) => (
              <td key={column} className="border-t border-slate-100 px-4 py-3 text-sm">
                {String(row[column] ?? "-")}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </section>
);
