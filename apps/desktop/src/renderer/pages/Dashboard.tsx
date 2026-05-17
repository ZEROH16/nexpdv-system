import { AlertTriangle, Banknote, Cloud, Receipt, TrendingUp } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency } from "@nexpdv/shared";
import { EmptyState } from "@/components/EmptyState";
import { StatCard } from "@/components/StatCard";
import { Skeleton } from "@/components/Skeleton";
import { useAsync } from "@/hooks/useAsync";
import { desktopApi } from "@/services/desktopApi";

export const Dashboard = () => {
  const { data, loading, error } = useAsync(() => desktopApi.dashboard(), []);
  const hasChartData = Boolean(data?.salesChart.some((item) => item.value > 0));

  if (error) {
    return (
      <div className="space-y-6">
        <section className="panel p-6">
          <h2 className="text-lg font-bold">Dashboard indisponivel</h2>
          <p className="mt-2 text-sm text-slate-500">{error}</p>
        </section>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (!data) {
    return <EmptyState title="Sem dados para exibir">O resumo comercial aparece aqui assim que o caixa comecar a vender.</EmptyState>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Faturamento do dia" value={formatCurrency(data.dailyRevenue)} icon={<TrendingUp size={20} />} tone="good" />
        <StatCard label="Vendas do dia" value={String(data.salesCount)} icon={<Receipt size={20} />} />
        <StatCard label="Ticket medio" value={formatCurrency(data.averageTicket)} icon={<Receipt size={20} />} />
        <StatCard label="Caixa atual" value={formatCurrency(data.cashBalance)} icon={<Banknote size={20} />} tone="good" />
        <StatCard label="Estoque baixo" value={String(data.lowStockCount)} icon={<AlertTriangle size={20} />} tone={data.lowStockCount ? "warn" : "good"} />
        <StatCard label="Clientes em aberto" value={formatCurrency(data.openCustomersBalance ?? 0)} icon={<Banknote size={20} />} tone={(data.openCustomersBalance ?? 0) > 0 ? "warn" : "good"} />
        <StatCard label="Sync pendente" value={String(data.syncPending)} icon={<Cloud size={20} />} tone={data.syncPending ? "warn" : "good"} />
      </div>

      <div className="grid grid-cols-[1fr_380px] gap-6">
        <section className="panel p-6">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">Vendas recentes</h2>
              <p className="text-sm text-slate-500">Ultimos 7 dias</p>
            </div>
          </div>
          <div className="h-80">
            {hasChartData ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.salesChart}>
                  <defs>
                    <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563EB" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#16A085" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={(value) => `R$ ${value}`} tickLine={false} axisLine={false} width={72} />
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                  <Area type="monotone" dataKey="value" stroke="#2563EB" strokeWidth={3} fill="url(#salesGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="Nenhuma venda recente">As vendas dos ultimos 7 dias vao aparecer neste grafico automaticamente.</EmptyState>
            )}
          </div>
        </section>

        <section className="panel p-6">
          <h2 className="text-lg font-bold">Produtos mais vendidos</h2>
          <div className="mt-5 space-y-4">
            {data.topProducts.length ? (
              data.topProducts.map((product, index) => (
                <div key={product.name} className="flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-sm font-bold dark:bg-slate-800">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{product.name}</div>
                      <div className="text-xs text-slate-500">{product.quantity} un.</div>
                    </div>
                  </div>
                  <strong className="text-sm">{formatCurrency(product.revenue)}</strong>
                </div>
              ))
            ) : (
              <EmptyState title="Sem ranking ainda">Finalize vendas para montar o ranking de produtos.</EmptyState>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
