import { Building2, CheckCircle2, CreditCard, Users } from "lucide-react";
import { formatCurrency } from "@nexpdv/shared";
import { Metric } from "@/components/Metric";
import { useAsync } from "@/hooks/useAsync";
import { api } from "@/services/api";

export const Dashboard = () => {
  const companies = useAsync(() => api.companies(), []);
  const users = useAsync(() => api.users(), []);
  const subscriptions = useAsync(() => api.subscriptions(), []);
  const plans = useAsync(() => api.plans(), []);
  const monthlyRecurringRevenue = (subscriptions.data ?? [])
    .filter((subscription) => subscription.status === "active")
    .reduce((sum, subscription) => sum + Number(subscription.plan?.price ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black">Dashboard geral</h1>
        <p className="mt-1 text-sm font-semibold text-slate-500">Visao comercial e operacional da plataforma.</p>
      </div>
      <div className="grid grid-cols-4 gap-4">
        <Metric label="Empresas" value={String(companies.data?.length ?? 0)} icon={<Building2 size={20} />} />
        <Metric label="Usuarios" value={String(users.data?.length ?? 0)} icon={<Users size={20} />} />
        <Metric label="Planos" value={String(plans.data?.length ?? 0)} icon={<CreditCard size={20} />} />
        <Metric label="MRR estimado" value={formatCurrency(monthlyRecurringRevenue)} icon={<CheckCircle2 size={20} />} />
      </div>
      <section className="panel overflow-hidden">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-black">Empresas recentes</h2>
        </div>
        <table className="w-full">
          <thead className="bg-slate-50 text-left text-xs font-black uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Empresa</th>
              <th className="px-4 py-3">Documento</th>
              <th className="px-4 py-3">Licenca</th>
              <th className="px-4 py-3">Vendas</th>
            </tr>
          </thead>
          <tbody>
            {companies.data?.slice(0, 8).map((company) => (
              <tr key={company.id}>
                <td className="border-t border-slate-100 px-4 py-3 font-bold">{company.tradeName ?? company.name}</td>
                <td className="border-t border-slate-100 px-4 py-3">{company.document}</td>
                <td className="border-t border-slate-100 px-4 py-3">{company.licenses?.[0]?.status ?? "sem licenca"}</td>
                <td className="border-t border-slate-100 px-4 py-3">{company._count?.sales ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
};
