import { FileText, RotateCcw, Trash2, XCircle } from "lucide-react";
import { useState } from "react";
import { formatCurrency, formatDateTime } from "@nexpdv/shared";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { useAsync } from "@/hooks/useAsync";
import { desktopApi } from "@/services/desktopApi";

const fiscalLabels = {
  not_issued: "Nao emitida",
  authorized: "Autorizada",
  rejected: "Rejeitada",
  cancelled: "Cancelada",
  contingency: "Contingencia"
};

export const SalesHistory = () => {
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState({ start: "", end: "" });
  const [cancelTarget, setCancelTarget] = useState<string>();
  const [cancelCredential, setCancelCredential] = useState("");
  const [cancelLogin, setCancelLogin] = useState("gerente");
  const [cancelMode, setCancelMode] = useState<"pin" | "password">("pin");
  const [removeTarget, setRemoveTarget] = useState<string>();
  const [adminCredential, setAdminCredential] = useState("");
  const [adminLogin, setAdminLogin] = useState("admin");
  const [adminMode, setAdminMode] = useState<"pin" | "password">("pin");
  const [message, setMessage] = useState<string>();
  const { data, loading, refresh } = useAsync(
    () => desktopApi.sales.list({ search, start: period.start ? new Date(period.start).toISOString() : undefined, end: period.end ? new Date(period.end).toISOString() : undefined }),
    [search, period.start, period.end]
  );
  const { data: license } = useAsync(() => desktopApi.license.check(), []);
  const { data: fiscalConfig } = useAsync(() => desktopApi.fiscal.getFiscalConfig(), []);
  const fiscalVisible = Boolean((license?.features?.fiscal ?? license?.fiscalEnabled) && fiscalConfig?.enabled);

  const cancel = async () => {
    if (!cancelTarget) return;
    try {
      await desktopApi.sales.cancel({ saleId: cancelTarget, login: cancelLogin, pin: cancelMode === "pin" ? cancelCredential : undefined, password: cancelMode === "password" ? cancelCredential : undefined });
      setCancelTarget(undefined);
      setCancelCredential("");
      setMessage("Venda cancelada.");
      refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel cancelar a venda.");
    }
  };

  const reprint = async (saleId: string) => {
    try {
      const sale = data?.find((item) => item.id === saleId);
      const html = await desktopApi.sales.receipt(saleId);
      await desktopApi.receipt.print(html, { saleId, saleNumber: sale?.number, reason: "reprint" });
      setMessage("Comprovante enviado para reimpressao.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel reimprimir o comprovante.");
    }
  };

  const removeCancelled = async () => {
    if (!removeTarget) return;
    try {
      await desktopApi.sales.removeCancelled({ saleId: removeTarget, login: adminLogin, pin: adminMode === "pin" ? adminCredential : undefined, password: adminMode === "password" ? adminCredential : undefined });
      setRemoveTarget(undefined);
      setAdminCredential("");
      setMessage("Venda cancelada removida.");
      refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel remover a venda.");
    }
  };

  const issueFiscalMock = async (saleId: string) => {
    try {
      await desktopApi.fiscal.issueNfceMock(saleId);
      setMessage("Documento fiscal simulado. Integracao real ainda nao configurada.");
      refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel emitir NFC-e mock.");
    }
  };

  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-5 dark:border-slate-800">
        <div className="flex gap-3">
          <input className="field w-72" placeholder="Venda, cliente ou operador" value={search} onChange={(event) => setSearch(event.target.value)} />
          <input className="field" type="date" value={period.start} onChange={(event) => setPeriod({ ...period, start: event.target.value })} />
          <input className="field" type="date" value={period.end} onChange={(event) => setPeriod({ ...period, end: event.target.value })} />
        </div>
      </div>
      {loading ? (
        <div className="p-6 text-sm text-slate-500">Carregando...</div>
      ) : data?.length ? (
        <table className="w-full border-collapse">
          <thead className="table-head">
            <tr>
              <th className="px-4 py-3">Venda</th>
              <th className="px-4 py-3">Operador</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Pagamento</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Status</th>
              {fiscalVisible ? <th className="px-4 py-3">Fiscal</th> : null}
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {data.map((sale) => (
              <tr key={sale.id} className="hover:bg-slate-50 dark:hover:bg-slate-950">
                <td className="table-cell">
                  <div className="font-semibold">{sale.number}</div>
                  <div className="text-xs text-slate-500">{formatDateTime(sale.createdAt)}</div>
                </td>
                <td className="table-cell">{sale.operatorName}</td>
                <td className="table-cell">{sale.customerName ?? "Consumidor"}</td>
                <td className="table-cell">{sale.payments.map((payment) => payment.method).join(", ")}</td>
                <td className="table-cell font-bold">{formatCurrency(sale.total)}</td>
                <td className="table-cell">
                  <StatusBadge tone={sale.status === "completed" ? "green" : "red"}>{sale.status === "completed" ? "Concluida" : "Cancelada"}</StatusBadge>
                </td>
                {fiscalVisible ? (
                  <td className="table-cell">
                    <StatusBadge tone={sale.fiscalStatus === "authorized" ? "green" : sale.fiscalStatus === "rejected" ? "red" : "slate"}>
                      {fiscalLabels[sale.fiscalStatus ?? "not_issued"]}
                    </StatusBadge>
                  </td>
                ) : null}
                <td className="table-cell">
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" className="h-9 px-3" onClick={() => reprint(sale.id)}><RotateCcw size={15} />Reimprimir</Button>
                    {fiscalVisible ? (
                      <Button variant="secondary" className="h-9 px-3" onClick={() => issueFiscalMock(sale.id)}>
                        <FileText size={15} />Emitir NFC-e
                      </Button>
                    ) : null}
                    <Button variant="danger" className="h-9 px-3" disabled={sale.status === "cancelled"} onClick={() => setCancelTarget(sale.id)}>
                      <XCircle size={15} />Cancelar
                    </Button>
                    {sale.status === "cancelled" ? (
                      <Button variant="danger" className="h-9 px-3" onClick={() => setRemoveTarget(sale.id)}>
                        <Trash2 size={15} />Remover
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="p-6"><EmptyState title="Nenhuma venda encontrada" /></div>
      )}
      {message ? <div className="border-t border-slate-200 p-4 text-sm dark:border-slate-800">{message}</div> : null}
      {cancelTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-8">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-2xl dark:bg-slate-950">
            <h2 className="text-xl font-black">Cancelar venda</h2>
            <p className="mt-1 text-sm text-slate-500">Informe PIN ou senha de gerente/admin para cancelar a venda.</p>
            <div className="mt-5 grid gap-3">
              <input className="field w-full" placeholder="Login gerente/admin" value={cancelLogin} onChange={(event) => setCancelLogin(event.target.value)} autoFocus />
              <div className="grid grid-cols-2 gap-2">
                <button className={`h-10 rounded-lg text-sm font-bold ${cancelMode === "pin" ? "bg-ink text-white dark:bg-white dark:text-ink" : "bg-slate-100 dark:bg-slate-900"}`} onClick={() => setCancelMode("pin")}>PIN</button>
                <button className={`h-10 rounded-lg text-sm font-bold ${cancelMode === "password" ? "bg-ink text-white dark:bg-white dark:text-ink" : "bg-slate-100 dark:bg-slate-900"}`} onClick={() => setCancelMode("password")}>Senha</button>
              </div>
              <input className="field w-full" type="password" placeholder={cancelMode === "pin" ? "PIN" : "Senha"} value={cancelCredential} onChange={(event) => setCancelCredential(event.target.value)} />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setCancelTarget(undefined)}>Voltar</Button>
              <Button variant="danger" onClick={cancel} disabled={!cancelCredential || !cancelLogin.trim()}>Cancelar venda</Button>
            </div>
          </div>
        </div>
      ) : null}
      {removeTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-8">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-2xl dark:bg-slate-950">
            <h2 className="text-xl font-black">Remover venda cancelada</h2>
            <p className="mt-1 text-sm text-slate-500">Apenas Administrador ou Dono pode executar esta acao.</p>
            <div className="mt-5 grid gap-3">
              <input className="field w-full" placeholder="Login admin/dono" value={adminLogin} onChange={(event) => setAdminLogin(event.target.value)} autoFocus />
              <div className="grid grid-cols-2 gap-2">
                <button className={`h-10 rounded-lg text-sm font-bold ${adminMode === "pin" ? "bg-ink text-white dark:bg-white dark:text-ink" : "bg-slate-100 dark:bg-slate-900"}`} onClick={() => setAdminMode("pin")}>PIN</button>
                <button className={`h-10 rounded-lg text-sm font-bold ${adminMode === "password" ? "bg-ink text-white dark:bg-white dark:text-ink" : "bg-slate-100 dark:bg-slate-900"}`} onClick={() => setAdminMode("password")}>Senha</button>
              </div>
              <input className="field w-full" type="password" placeholder={adminMode === "pin" ? "PIN" : "Senha"} value={adminCredential} onChange={(event) => setAdminCredential(event.target.value)} />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setRemoveTarget(undefined)}>Cancelar</Button>
              <Button variant="danger" onClick={removeCancelled} disabled={!adminCredential || !adminLogin.trim()}>Remover</Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
};
