import { CreditCard, Eye, Plus, Save, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { Customer } from "@nexpdv/shared";
import { formatCurrency, formatDateTime } from "@nexpdv/shared";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { useAsync } from "@/hooks/useAsync";
import { desktopApi, type CustomerOpenAccount } from "@/services/desktopApi";

const emptyCustomer: Partial<Customer> = {
  name: "",
  document: "",
  phone: "",
  whatsapp: "",
  address: "",
  notes: "",
  creditLimit: 0,
  balance: 0,
  lgpdAccepted: false,
  active: true
};

export const Customers = () => {
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<Partial<Customer>>(emptyCustomer);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paymentCustomer, setPaymentCustomer] = useState<Customer | CustomerOpenAccount | undefined>();
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [message, setMessage] = useState<string>();
  const { data, loading, refresh } = useAsync(() => desktopApi.customers.list(search), [search]);
  const { data: openSummary, refresh: refreshOpenSummary } = useAsync(() => desktopApi.customers.openSummary(), []);

  const openNew = () => {
    setForm(emptyCustomer);
    setDrawerOpen(true);
  };

  const openEdit = (customer: Customer) => {
    setForm(customer);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setForm(emptyCustomer);
  };

  const save = async () => {
    try {
      const saved = await desktopApi.customers.save(form);
      setDrawerOpen(false);
      setForm(emptyCustomer);
      setMessage(`${saved.name} salvo.`);
      refresh();
      refreshOpenSummary();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel salvar o cliente.");
    }
  };

  const removeCustomer = async () => {
    if (!form.id) return;
    const confirmed = window.confirm("Deseja excluir/inativar este cliente? Clientes com vendas vinculadas serao apenas marcados como inativos.");
    if (!confirmed) return;
    try {
      await desktopApi.customers.delete(form.id);
      setDrawerOpen(false);
      setForm(emptyCustomer);
      setMessage("Cliente inativado.");
      refresh();
      refreshOpenSummary();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel inativar o cliente.");
    }
  };

  const registerPayment = async () => {
    if (!paymentCustomer || paymentAmount <= 0) return;
    try {
      await desktopApi.customers.payment({ customerId: paymentCustomer.id, amount: paymentAmount });
      setPaymentCustomer(undefined);
      setPaymentAmount(0);
      setMessage("Pagamento registrado.");
      refresh();
      refreshOpenSummary();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel registrar o pagamento.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Saldo total em aberto" value={formatCurrency(openSummary?.totalReceivable ?? 0)} />
        <StatCard label="Clientes em aberto" value={String(openSummary?.openCustomers.length ?? 0)} />
        <StatCard label="Inadimplentes" value={String(openSummary?.overdueCount ?? 0)} tone={(openSummary?.overdueCount ?? 0) > 0 ? "warn" : "good"} />
        <StatCard label="Maior saldo" value={formatCurrency(openSummary?.topDebtors[0]?.balance ?? 0)} />
      </div>

      <section className="panel overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 p-5 dark:border-slate-800">
          <input className="field w-96 max-w-full" placeholder="Pesquisar clientes" value={search} onChange={(event) => setSearch(event.target.value)} />
          <Button onClick={openNew}>
            <Plus size={16} />
            Novo cliente
          </Button>
        </div>
        {message ? <div className="border-b border-slate-200 px-5 py-3 text-sm dark:border-slate-800">{message}</div> : null}
        {loading ? (
          <div className="p-6 text-sm text-slate-500">Carregando...</div>
        ) : data?.length ? (
          <table className="w-full border-collapse">
            <thead className="table-head">
              <tr>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Contato</th>
                <th className="px-4 py-3">LGPD</th>
                <th className="px-4 py-3">Limite</th>
                <th className="px-4 py-3">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {data.map((customer) => (
                <tr key={customer.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-950" onClick={() => openEdit(customer)}>
                  <td className="table-cell">
                    <div className="font-semibold">{customer.name}</div>
                    <div className="text-xs text-slate-500">{customer.document || (customer.active === false ? "Inativo" : "-")}</div>
                  </td>
                  <td className="table-cell">{customer.whatsapp || customer.phone || "-"}</td>
                  <td className="table-cell">
                    <StatusBadge tone={customer.lgpdAccepted ? "green" : "amber"}>{customer.lgpdAccepted ? "Aceito" : "Pendente"}</StatusBadge>
                    {customer.lgpdAcceptedAt ? <div className="mt-1 text-xs text-slate-500">{formatDateTime(customer.lgpdAcceptedAt)}</div> : null}
                  </td>
                  <td className="table-cell">{formatCurrency(customer.creditLimit)}</td>
                  <td className="table-cell font-bold">{formatCurrency(customer.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-6"><EmptyState title="Nenhum cliente encontrado" /></div>
        )}
      </section>

      <section className="panel overflow-hidden">
        <div className="border-b border-slate-200 p-5 dark:border-slate-800">
          <h2 className="text-lg font-black">Clientes em aberto</h2>
          <p className="text-sm text-slate-500">Acompanhamento de fiado e saldos devedores.</p>
        </div>
        {openSummary?.openCustomers.length ? (
          <table className="w-full">
            <thead className="table-head">
              <tr>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Telefone</th>
                <th className="px-4 py-3">Saldo devido</th>
                <th className="px-4 py-3">Limite</th>
                <th className="px-4 py-3">Ultima compra</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {openSummary.openCustomers.map((customer) => (
                <tr key={customer.id}>
                  <td className="table-cell font-bold">{customer.name}</td>
                  <td className="table-cell">{customer.whatsapp || customer.phone || "-"}</td>
                  <td className="table-cell font-bold">{formatCurrency(customer.balance)}</td>
                  <td className="table-cell">{formatCurrency(customer.creditLimit)}</td>
                  <td className="table-cell">{customer.lastPurchaseAt ? formatDateTime(customer.lastPurchaseAt) : "-"}</td>
                  <td className="table-cell">{customer.status}</td>
                  <td className="table-cell">
                    <div className="flex justify-end gap-2">
                      <Button className="h-9 px-3" variant="secondary" onClick={() => setPaymentCustomer(customer)}>
                        <CreditCard size={15} />
                        Pagamento
                      </Button>
                      <Button className="h-9 px-3" variant="ghost" onClick={() => setSearch(customer.name)}>
                        <Eye size={15} />
                        Historico
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-6"><EmptyState title="Nenhum saldo em aberto">Clientes com fiado aparecem aqui.</EmptyState></div>
        )}
      </section>

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/45">
          <aside className="flex h-full w-[520px] flex-col bg-white shadow-2xl dark:bg-slate-950">
            <div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800">
              <div>
                <h2 className="text-xl font-black">{form.id ? "Editar cliente" : "Novo cliente"}</h2>
                <p className="text-sm text-slate-500">Cadastro, fiado e consentimento LGPD.</p>
              </div>
              <button className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-900" onClick={closeDrawer}>
                <X size={20} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-5">
              <div className="grid gap-3">
                <label className="text-sm font-semibold">
                  Nome
                  <input className="field mt-1 w-full" value={form.name ?? ""} onChange={(event) => setForm({ ...form, name: event.target.value })} />
                </label>
                <label className="text-sm font-semibold">
                  CPF/CNPJ
                  <input className="field mt-1 w-full" value={form.document ?? ""} onChange={(event) => setForm({ ...form, document: event.target.value })} />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm font-semibold">
                    Telefone
                    <input className="field mt-1 w-full" value={form.phone ?? ""} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
                  </label>
                  <label className="text-sm font-semibold">
                    WhatsApp
                    <input className="field mt-1 w-full" value={form.whatsapp ?? ""} onChange={(event) => setForm({ ...form, whatsapp: event.target.value })} />
                  </label>
                </div>
                <label className="text-sm font-semibold">
                  Endereco
                  <input className="field mt-1 w-full" value={form.address ?? ""} onChange={(event) => setForm({ ...form, address: event.target.value })} />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm font-semibold">
                    Limite de credito/fiado
                    <input className="field mt-1 w-full" type="number" placeholder="0,00" value={form.creditLimit || ""} onChange={(event) => setForm({ ...form, creditLimit: Number(event.target.value) })} />
                  </label>
                  <label className="text-sm font-semibold">
                    Saldo devedor
                    <input className="field mt-1 w-full" type="number" placeholder="0,00" value={form.balance || ""} onChange={(event) => setForm({ ...form, balance: Number(event.target.value) })} />
                  </label>
                </div>
                <label className="text-sm font-semibold">
                  Observacoes
                  <textarea className="field mt-1 h-20 w-full py-2" value={form.notes ?? ""} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
                </label>
                <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm font-semibold dark:border-slate-700">
                  <input className="mt-1" type="checkbox" checked={form.lgpdAccepted ?? false} onChange={(event) => setForm({ ...form, lgpdAccepted: event.target.checked, lgpdAcceptedAt: event.target.checked ? form.lgpdAcceptedAt ?? new Date().toISOString() : undefined })} />
                  Cliente autorizou o armazenamento dos dados para fins de cadastro, venda, fiado e comunicacao.
                </label>
                {form.lgpdAcceptedAt ? <div className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">Aceite registrado em {formatDateTime(form.lgpdAcceptedAt)}</div> : null}
              </div>
            </div>
            <div className="flex flex-wrap justify-between gap-3 border-t border-slate-200 p-5 dark:border-slate-800">
              <div>
                {form.id ? (
                  <Button variant="danger" onClick={removeCustomer}>
                    <Trash2 size={16} />
                    Excluir cliente
                  </Button>
                ) : null}
              </div>
              <div className="flex gap-3">
                <Button variant="ghost" onClick={closeDrawer}>Cancelar</Button>
                <Button onClick={save} disabled={!form.name}>
                  <Save size={16} />
                  Salvar
                </Button>
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      {paymentCustomer ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-8">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl dark:bg-slate-950">
            <h2 className="text-xl font-black">Registrar pagamento</h2>
            <p className="mt-1 text-sm text-slate-500">{paymentCustomer.name} deve {formatCurrency(paymentCustomer.balance)}</p>
            <label className="mt-5 block text-sm font-semibold">
              Valor recebido
              <input className="field mt-1 h-12 w-full text-lg font-bold" type="number" min={0} value={paymentAmount || ""} onChange={(event) => setPaymentAmount(Number(event.target.value))} autoFocus />
            </label>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setPaymentCustomer(undefined)}>Cancelar</Button>
              <Button disabled={paymentAmount <= 0} onClick={registerPayment}>Confirmar</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
