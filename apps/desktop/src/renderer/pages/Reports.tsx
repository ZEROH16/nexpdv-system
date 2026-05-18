import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import { formatCurrency } from "@nexpdv/shared";
import { Button } from "@/components/Button";
import { StatCard } from "@/components/StatCard";
import { useAsync } from "@/hooks/useAsync";
import { desktopApi } from "@/services/desktopApi";

export const Reports = () => {
  const [period, setPeriod] = useState({ start: "", end: "" });
  const { data: sales } = useAsync(
    () => desktopApi.sales.list({ start: period.start ? new Date(period.start).toISOString() : undefined, end: period.end ? new Date(period.end).toISOString() : undefined }),
    [period.start, period.end]
  );
  const { data: lowStock } = useAsync(() => desktopApi.products.list({ lowStock: true, pageSize: 200 }), []);
  const { data: openCustomers } = useAsync(() => desktopApi.customers.openSummary(), []);

  const summary = useMemo(() => {
    const completed = sales?.filter((sale) => sale.status === "completed") ?? [];
    const total = completed.reduce((sum, sale) => sum + sale.total, 0);
    const profit = completed.reduce((sum, sale) => sum + sale.profit, 0);
    const averageTicket = completed.length ? total / completed.length : 0;
    const byPayment = completed.flatMap((sale) => sale.payments).reduce<Record<string, number>>((acc, payment) => {
      acc[payment.method] = (acc[payment.method] ?? 0) + payment.amount;
      return acc;
    }, {});
    const topProducts = completed
      .flatMap((sale) => sale.items)
      .reduce<Record<string, { name: string; quantity: number; revenue: number }>>((acc, item) => {
        acc[item.productName] = acc[item.productName] ?? { name: item.productName, quantity: 0, revenue: 0 };
        acc[item.productName].quantity += item.quantity;
        acc[item.productName].revenue += item.total;
        return acc;
      }, {});
    return { count: completed.length, total, profit, averageTicket, byPayment, topProducts: Object.values(topProducts).sort((a, b) => b.quantity - a.quantity).slice(0, 8) };
  }, [sales]);

  const exportCsv = () => {
    const header = "numero,data,operador,cliente,total,lucro,status\n";
    const rows = (sales ?? []).map((sale) => [sale.number, sale.createdAt, sale.operatorName, sale.customerName ?? "", sale.total, sale.profit, sale.status].join(","));
    const url = URL.createObjectURL(new Blob([[header, ...rows].join("\n")], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "relatorio-vendas-nexpdv.csv";
    link.click();
  };

  return (
    <div className="space-y-6">
      <section className="panel flex items-center justify-between p-5">
        <div className="flex gap-3">
          <input className="field" type="date" value={period.start} onChange={(event) => setPeriod({ ...period, start: event.target.value })} />
          <input className="field" type="date" value={period.end} onChange={(event) => setPeriod({ ...period, end: event.target.value })} />
        </div>
        <Button onClick={exportCsv}><Download size={16} />Exportar CSV</Button>
      </section>
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Vendas por periodo" value={String(summary.count)} />
        <StatCard label="Faturamento" value={formatCurrency(summary.total)} tone="good" />
        <StatCard label="Lucro estimado" value={formatCurrency(summary.profit)} tone="good" />
        <StatCard label="Ticket medio" value={formatCurrency(summary.averageTicket)} />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Estoque baixo" value={String(lowStock?.total ?? 0)} tone={(lowStock?.total ?? 0) ? "warn" : "good"} />
        <StatCard label="Clientes em aberto" value={String(openCustomers?.openCustomers.length ?? 0)} tone={(openCustomers?.openCustomers.length ?? 0) ? "warn" : "good"} />
        <StatCard label="Total a receber" value={formatCurrency(openCustomers?.totalReceivable ?? 0)} />
      </div>
      <div className="grid grid-cols-3 gap-6">
        <section className="panel p-5">
          <h2 className="text-lg font-black">Vendas por pagamento</h2>
          <div className="mt-4 space-y-3">
            {Object.entries(summary.byPayment).map(([method, value]) => (
              <div key={method} className="flex items-center justify-between rounded-lg bg-slate-50 p-3 dark:bg-slate-950">
                <span className="text-sm font-semibold">{method}</span>
                <strong>{formatCurrency(value)}</strong>
              </div>
            ))}
          </div>
        </section>
        <section className="panel p-5">
          <h2 className="text-lg font-black">Estoque baixo</h2>
          <div className="mt-4 space-y-3">
            {lowStock?.data.map((product) => (
              <div key={product.id} className="flex items-center justify-between rounded-lg bg-slate-50 p-3 dark:bg-slate-950">
                <span className="text-sm font-semibold">{product.name}</span>
                <strong>{product.stock}</strong>
              </div>
            ))}
          </div>
        </section>
        <section className="panel p-5">
          <h2 className="text-lg font-black">Produtos mais vendidos</h2>
          <div className="mt-4 space-y-3">
            {summary.topProducts.map((product) => (
              <div key={product.name} className="flex items-center justify-between rounded-lg bg-slate-50 p-3 dark:bg-slate-950">
                <span className="text-sm font-semibold">{product.name}</span>
                <strong>{product.quantity}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
