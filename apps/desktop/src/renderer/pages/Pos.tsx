import { Banknote, CreditCard, LockKeyhole, Maximize2, Minimize2, Minus, Pin, Plus, QrCode, Search, Trash2, User, UserRoundCog, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Customer, PaymentMethod, PixCharge, Product } from "@nexpdv/shared";
import { formatCurrency, roundMoney } from "@nexpdv/shared";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/Skeleton";
import { useAsync } from "@/hooks/useAsync";
import { useHotkeys } from "@/hooks/useHotkeys";
import { desktopApi } from "@/services/desktopApi";
import { getCartTotals, usePdvStore } from "@/store/usePdvStore";

const paymentOptions: Array<{ method: PaymentMethod; label: string; icon: typeof Banknote }> = [
  { method: "cash", label: "Dinheiro", icon: Banknote },
  { method: "pix", label: "Pix", icon: QrCode },
  { method: "debit", label: "Debito", icon: CreditCard },
  { method: "credit", label: "Credito", icon: CreditCard },
  { method: "store_credit", label: "Fiado", icon: User }
];

const paymentLabel: Record<PaymentMethod, string> = {
  cash: "Dinheiro",
  pix: "Pix",
  debit: "Debito",
  credit: "Credito",
  store_credit: "Fiado"
};

const pixStatusLabel = {
  waiting: "aguardando",
  paid: "pago",
  expired: "expirado",
  cancelled: "cancelado"
};

export const Pos = () => {
  const barcodeRef = useRef<HTMLInputElement>(null);
  const discountRef = useRef<HTMLInputElement>(null);
  const [barcode, setBarcode] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [productDrawerOpen, setProductDrawerOpen] = useState(false);
  const [miscOpen, setMiscOpen] = useState(false);
  const [miscForm, setMiscForm] = useState({ description: "", unitPrice: 0, quantity: 1, category: "", notes: "" });
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [cashReceived, setCashReceived] = useState(0);
  const [pixCharge, setPixCharge] = useState<PixCharge>();
  const [pixLoading, setPixLoading] = useState(false);
  const [managerDiscountOpen, setManagerDiscountOpen] = useState(false);
  const [managerCredential, setManagerCredential] = useState("");
  const [managerLogin, setManagerLogin] = useState("gerente");
  const [managerCredentialMode, setManagerCredentialMode] = useState<"pin" | "password">("pin");
  const [pendingDiscountPercent, setPendingDiscountPercent] = useState(0);
  const [operatorSwitchOpen, setOperatorSwitchOpen] = useState(false);
  const [operatorSwitchForm, setOperatorSwitchForm] = useState({ login: "", pin: "", password: "", mode: "pin" as "pin" | "password" });
  const [discountError, setDiscountError] = useState<string>();
  const [highDiscountAuthorized, setHighDiscountAuthorized] = useState(false);
  const [loadingScan, setLoadingScan] = useState(false);
  const [loadingCheckout, setLoadingCheckout] = useState(false);
  const [message, setMessage] = useState<string>();
  const store = usePdvStore();
  const focusMode = store.focusMode;
  const sidebarPinned = store.sidebarPinned;
  const discountPercent = Math.min(Math.max(store.saleDiscount, 0), 100);
  const subtotalPreview = getCartTotals(store.cart, 0, []);
  const saleDiscountAmount = roundMoney(subtotalPreview.subtotal * (discountPercent / 100));
  const totals = getCartTotals(store.cart, saleDiscountAmount, []);
  const discountPercentLabel = `${discountPercent.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
  const { data: products, loading: loadingProducts, refresh: refreshProducts } = useAsync(
    () => desktopApi.products.list({ search: productSearch, pageSize: 40 }),
    [productSearch]
  );
  const { data: customers } = useAsync(() => desktopApi.customers.list(customerSearch), [customerSearch]);
  const { data: license } = useAsync(() => desktopApi.license.check(), []);
  const { data: pixConfig } = useAsync(() => desktopApi.pix.getPixConfig(), []);
  const { data: authState, refresh: refreshAuth } = useAsync(() => desktopApi.auth.state(), []);

  const visibleProducts = products?.data ?? [];
  const selectedCustomer = useMemo(
    () => customers?.find((customer) => customer.id === store.customer?.id) ?? store.customer,
    [customers, store.customer]
  );
  const cashChange = Math.max(cashReceived - totals.total, 0);
  const pixBlocked = paymentMethod === "pix" && !license?.pixEnabled;
  const pixNotConfigured = paymentMethod === "pix" && Boolean(license?.pixEnabled) && (!pixConfig?.enabled || !pixConfig.key);
  const pixWaitingPayment = paymentMethod === "pix" && Boolean(license?.pixEnabled) && Boolean(pixConfig?.enabled && pixConfig.key) && pixCharge?.status !== "paid";
  const canConfirmPayment =
    store.cart.length > 0 &&
    !loadingCheckout &&
    (paymentMethod !== "cash" || cashReceived >= totals.total) &&
    (paymentMethod !== "store_credit" || Boolean(store.customer?.id)) &&
    !pixBlocked &&
    !pixNotConfigured &&
    !pixWaitingPayment;

  useEffect(() => {
    barcodeRef.current?.focus();
  }, [focusMode]);

  useEffect(() => {
    if (!paymentOpen || paymentMethod !== "pix") return;
    if (!license?.pixEnabled || !pixConfig?.enabled || !pixConfig.key || pixCharge || pixLoading) return;
    setPixLoading(true);
    desktopApi.pix
      .createChargeMock({ amount: totals.total })
      .then(setPixCharge)
      .catch((error) => setMessage(error instanceof Error ? error.message : "Nao foi possivel gerar Pix mock."))
      .finally(() => setPixLoading(false));
  }, [license?.pixEnabled, paymentMethod, paymentOpen, pixCharge, pixConfig?.enabled, pixConfig?.key, pixLoading, totals.total]);

  const refocusBarcode = () => {
    window.setTimeout(() => barcodeRef.current?.focus(), 50);
  };

  const recordAudit = (action: string, details?: string) => {
    void desktopApi.system.auditEvent({ action, details }).catch(() => undefined);
  };

  const clearCurrentSale = () => {
    store.clearSale();
    setHighDiscountAuthorized(false);
    setManagerDiscountOpen(false);
    setPendingDiscountPercent(0);
    setDiscountError(undefined);
    setPixCharge(undefined);
    refocusBarcode();
  };

  const toggleFocusMode = () => {
    const next = !focusMode;
    store.setFocusMode(next);
    setMessage(next ? "Modo foco ativado." : "Modo foco desativado.");
    recordAudit(next ? "modo foco ativado" : "modo foco desativado");
    refocusBarcode();
  };

  const handleDiscountPercentChange = (rawValue: string) => {
    const requested = Math.min(Math.max(Number(rawValue) || 0, 0), 100);
    if (requested <= 5 || highDiscountAuthorized) {
      store.setSaleDiscount(requested);
      return;
    }
    store.setSaleDiscount(5);
    setPendingDiscountPercent(requested);
    setManagerCredential("");
    setDiscountError(undefined);
    setManagerDiscountOpen(true);
    setMessage("Descontos acima de 5% precisam de senha de gerente.");
  };

  const authorizeHighDiscount = async () => {
    const requested = pendingDiscountPercent;
    const result = await desktopApi.auth.authorize({
      login: managerLogin,
      pin: managerCredentialMode === "pin" ? managerCredential : undefined,
      password: managerCredentialMode === "password" ? managerCredential : undefined,
      permission: "apply_high_discount",
      requireManager: true
    });
    if (result.ok) {
      setHighDiscountAuthorized(true);
      store.setSaleDiscount(requested);
      setManagerDiscountOpen(false);
      setManagerCredential("");
      setDiscountError(undefined);
      setMessage(`Desconto de ${requested.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% autorizado.`);
      recordAudit("desconto maior que 5% autorizado", `${requested}% na venda em andamento`);
      refocusBarcode();
      return;
    }
    store.setSaleDiscount(5);
    setHighDiscountAuthorized(false);
    setDiscountError("Senha incorreta. O desconto ficou limitado a 5%.");
    setMessage("Senha incorreta. O desconto ficou limitado a 5%.");
    recordAudit("tentativa de desconto acima de 5% negada", `${requested}% solicitado`);
    refocusBarcode();
  };

  const confirmPixManually = async () => {
    if (!pixCharge) return;
    const updated = await desktopApi.pix.confirmChargeMock(pixCharge.id);
    setPixCharge(updated);
    setMessage("Pagamento Pix confirmado manualmente.");
  };

  const copyPixPayload = async () => {
    if (!pixCharge?.qrCodePayload) return;
    await navigator.clipboard?.writeText(pixCharge.qrCodePayload).catch(() => undefined);
    setMessage("Codigo Pix copiado.");
  };

  const switchOperator = async () => {
    try {
      await desktopApi.auth.switchOperator({
        login: operatorSwitchForm.login,
        pin: operatorSwitchForm.mode === "pin" ? operatorSwitchForm.pin : undefined,
        password: operatorSwitchForm.mode === "password" ? operatorSwitchForm.password : undefined,
        rememberOperator: true
      });
      refreshAuth();
      window.dispatchEvent(new Event("nexpdv:auth-changed"));
      setOperatorSwitchOpen(false);
      setOperatorSwitchForm({ login: "", pin: "", password: "", mode: "pin" });
      setMessage("Operador trocado.");
      refocusBarcode();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel trocar operador.");
    }
  };

  const lockPdv = async () => {
    await desktopApi.auth.lock();
    window.dispatchEvent(new Event("nexpdv:auth-changed"));
  };

  const addProductToSale = (product: Product) => {
    store.addProduct(product);
    setMessage(`${product.name} adicionado.`);
    refocusBarcode();
  };

  const addByBarcode = async () => {
    const code = barcode.trim();
    if (!code || loadingScan) return;
    setLoadingScan(true);
    setMessage(undefined);
    try {
      const response = await desktopApi.products.list({ search: code, pageSize: 20 });
      const exact =
        response.data.find((product) => product.barcode === code || product.sku === code) ??
        (response.data.length === 1 ? response.data[0] : undefined);

      if (!exact) {
        setMessage("Produto nao encontrado. Use Buscar produtos para selecionar manualmente.");
        return;
      }

      addProductToSale(exact);
      setBarcode("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel adicionar o produto.");
    } finally {
      setLoadingScan(false);
      refocusBarcode();
    }
  };

  const openPayment = () => {
    if (!store.cart.length) return;
    setPixCharge(undefined);
    setCashReceived(paymentMethod === "cash" ? totals.total : 0);
    setPaymentOpen(true);
  };

  const finalizeSale = async () => {
    if (!canConfirmPayment) return;
    setLoadingCheckout(true);
    setMessage(undefined);
    try {
      const paidAmount = paymentMethod === "cash" ? cashReceived : totals.total;
      const sale = await desktopApi.sales.checkout({
        customerId: store.customer?.id,
        notes: store.notes,
        discount: saleDiscountAmount,
        items: store.cart.map((line) => ({
          productId: line.product?.id,
          quantity: line.quantity,
          discount: line.discount,
          description: line.description,
          unitPrice: line.unitPrice,
          cost: line.cost,
          category: line.category,
          notes: line.notes,
          custom: line.custom
        })),
        payments: [{ method: paymentMethod, amount: paidAmount }]
      });
      await desktopApi.receipt.print(sale.receiptHtml).catch(() => undefined);
      clearCurrentSale();
      setPaymentOpen(false);
      setBarcode("");
      setMessage(`Venda ${sale.number} finalizada em ${paymentLabel[paymentMethod]}.`);
      refreshProducts();
      refocusBarcode();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel finalizar a venda.");
    } finally {
      setLoadingCheckout(false);
    }
  };

  useHotkeys({
    F2: () => barcodeRef.current?.focus(),
    F4: () => openPayment(),
    F6: () => discountRef.current?.focus(),
    Escape: () => {
      if (paymentOpen) setPaymentOpen(false);
      else if (miscOpen) setMiscOpen(false);
      else if (productDrawerOpen) setProductDrawerOpen(false);
      else clearCurrentSale();
      refocusBarcode();
    },
    "Ctrl+f": () => setProductDrawerOpen(true)
  });

  return (
    <div className={`grid ${focusMode ? "h-[calc(100vh-32px)] grid-cols-[minmax(0,1fr)_430px] gap-4" : "h-[calc(100vh-138px)] grid-cols-[minmax(0,1fr)_390px] gap-6"}`}>
      <section className="flex min-h-0 flex-col gap-4">
        <div className={`panel ${focusMode ? "p-6 ring-1 ring-blue-500/20" : "p-5"}`}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <label className="text-xs font-bold uppercase text-slate-500">Leitura rapida</label>
            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600 dark:bg-slate-950 dark:text-slate-300 lg:flex">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {authState?.user?.name ?? "Operador"}
              </div>
              <Button className="h-10 px-3" variant="ghost" title="Trocar operador" onClick={() => {
                setOperatorSwitchForm((current) => ({ ...current, login: authState?.lastOperatorLogin ?? "" }));
                setOperatorSwitchOpen(true);
              }}>
                <UserRoundCog size={18} />
              </Button>
              <Button className="h-10 px-3" variant="ghost" title="Bloquear PDV" onClick={() => void lockPdv()}>
                <LockKeyhole size={18} />
              </Button>
              <label className="inline-flex h-10 items-center gap-2 rounded-lg px-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900">
                <input
                  type="checkbox"
                  checked={sidebarPinned}
                  onChange={(event) => {
                    store.setSidebarPinned(event.target.checked);
                    refocusBarcode();
                  }}
                />
                <Pin size={14} />
                Fixar menu lateral
              </label>
              <Button className="h-10 w-10 px-0" variant="ghost" title="Modo foco" onClick={toggleFocusMode}>
                {focusMode ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
              </Button>
            </div>
          </div>
          <div className="mt-2 flex gap-3">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 text-slate-400" size={focusMode ? 26 : 22} />
              <input
                ref={barcodeRef}
                className={`field w-full !pl-16 pr-5 font-semibold ${focusMode ? "h-20 text-3xl shadow-soft" : "h-16 text-2xl"}`}
                value={barcode}
                onChange={(event) => setBarcode(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void addByBarcode();
                }}
                placeholder="Bipe ou digite o codigo do produto"
                autoFocus
              />
            </div>
            <Button className={`${focusMode ? "h-20 px-7" : "h-16 px-6"}`} disabled={loadingScan || !barcode.trim()} onClick={() => void addByBarcode()}>
              Adicionar
            </Button>
            <Button className={`${focusMode ? "h-20 px-5" : "h-16 px-5"}`} variant="secondary" onClick={() => setProductDrawerOpen(true)}>
              Buscar produtos
            </Button>
            <Button className={`${focusMode ? "h-20 px-5" : "h-16 px-5"}`} variant="secondary" onClick={() => setMiscOpen(true)}>
              Produto diverso
            </Button>
          </div>
          {message ? <div className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm dark:bg-slate-950">{message}</div> : null}
        </div>

        <div className="panel flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <div>
              <h2 className="text-lg font-black">Itens da venda</h2>
              <p className="text-sm text-slate-500">{store.cart.length ? `${store.cart.length} item(ns) no carrinho` : "Venda aguardando produtos"}</p>
            </div>
            {!focusMode ? <Button variant="ghost" disabled={!store.cart.length} onClick={clearCurrentSale}>
              Limpar venda
            </Button> : null}
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {!store.cart.length ? (
              <div className="p-8">
                <EmptyState title="Nenhum item lancado">Bipe um codigo ou use Buscar produtos para iniciar a venda.</EmptyState>
              </div>
            ) : (
              <table className="w-full">
                <thead className="table-head sticky top-0 z-10">
                  <tr>
                    <th className="px-5 py-3">Produto</th>
                    <th className="px-4 py-3 text-center">Qtd</th>
                    <th className="px-4 py-3 text-right">Unitario</th>
                    <th className="px-4 py-3 text-right">Subtotal</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {store.cart.map((line) => {
                    const subtotal = line.unitPrice * line.quantity - line.discount;
                    return (
                      <tr key={line.id} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="px-5 py-4">
                          <div className="font-bold">{line.description}</div>
                          <div className={`text-xs text-slate-500 ${focusMode ? "hidden" : ""}`}>
                            {line.custom ? "Produto diverso" : `${line.product?.barcode ?? line.product?.sku ?? "Sem codigo"} · Estoque ${line.product?.stock ?? 0}`}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="mx-auto flex w-32 items-center justify-center gap-2">
                            <button
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                              onClick={() => store.updateQuantity(line.id, line.quantity - 1)}
                            >
                              <Minus size={15} />
                            </button>
                            <input
                              className="field h-8 w-14 px-1 text-center"
                              type="number"
                              min={1}
                              value={line.quantity}
                              onChange={(event) => store.updateQuantity(line.id, Number(event.target.value))}
                            />
                            <button
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                              onClick={() => store.updateQuantity(line.id, line.quantity + 1)}
                            >
                              <Plus size={15} />
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right font-semibold">{formatCurrency(line.unitPrice)}</td>
                        <td className="px-4 py-4 text-right text-lg font-black">{formatCurrency(subtotal)}</td>
                        <td className="px-4 py-4 text-right">
                          <button className="text-slate-400 hover:text-red-500" onClick={() => store.removeProduct(line.id)}>
                            <Trash2 size={18} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>

      <aside className={`panel flex min-h-0 flex-col overflow-hidden ${focusMode ? "ring-1 ring-blue-500/20" : ""}`}>
        {(!focusMode || paymentMethod === "store_credit") ? (
        <div className="border-b border-slate-200 p-5 dark:border-slate-800">
          <h2 className="text-lg font-black">Resumo</h2>
          <div className="mt-4 grid gap-3">
            <input className="field" placeholder="Buscar cliente" value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} />
            <select
              className="field"
              value={store.customer?.id ?? ""}
              onChange={(event) => store.setCustomer(customers?.find((customer: Customer) => customer.id === event.target.value))}
            >
              <option value="">Cliente opcional</option>
              {customers?.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
            {selectedCustomer ? <div className="text-xs text-slate-500">Limite fiado: {formatCurrency(selectedCustomer.creditLimit)} · Saldo {formatCurrency(selectedCustomer.balance)}</div> : null}
          </div>
        </div>
        ) : null}

        <div className="flex-1 space-y-4 overflow-auto p-5">
          <section>
            <div className="text-xs font-bold uppercase text-slate-500">Forma de pagamento</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {paymentOptions.map((option) => {
                const Icon = option.icon;
                const active = paymentMethod === option.method;
                return (
                  <button
                    key={option.method}
                    className={`flex h-11 items-center justify-center gap-2 rounded-lg border text-sm font-bold transition ${
                      active
                        ? "border-ink bg-ink text-white dark:border-white dark:bg-white dark:text-ink"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900"
                    }`}
                    onClick={() => {
                      setPaymentMethod(option.method);
                      setPixCharge(undefined);
                      if (option.method === "cash") setCashReceived(totals.total);
                      refocusBarcode();
                    }}
                  >
                    <Icon size={16} />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </section>

          <label className="text-sm font-semibold">
            Desconto (%)
            <input
              ref={discountRef}
              className="field mt-1 w-full"
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={discountPercent || ""}
              onChange={(event) => handleDiscountPercentChange(event.target.value)}
            />
          </label>
          {highDiscountAuthorized && discountPercent > 5 ? (
            <div className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
              Desconto acima de 5% autorizado para esta venda.
            </div>
          ) : null}
          {!focusMode ? <label className="text-sm font-semibold">
            Observacoes
            <textarea className="field mt-1 h-20 w-full py-2" value={store.notes} onChange={(event) => store.setNotes(event.target.value)} />
          </label> : null}
        </div>

        <div className="border-t border-slate-200 p-5 dark:border-slate-800">
          <div className="space-y-2 rounded-lg bg-slate-50 p-4 text-sm dark:bg-slate-950">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <strong>{formatCurrency(totals.subtotal)}</strong>
            </div>
            <div className="flex justify-between">
              <span>Desconto (%)</span>
              <strong>{discountPercentLabel}</strong>
            </div>
            <div className="flex justify-between">
              <span>Valor descontado</span>
              <strong>{formatCurrency(saleDiscountAmount)}</strong>
            </div>
          </div>
          <div className="mt-5">
            <div className="text-xs font-bold uppercase text-slate-500">Total final</div>
            <div className={`mt-1 font-black tracking-normal ${focusMode ? "text-6xl text-mint" : "text-5xl"}`}>{formatCurrency(totals.total)}</div>
          </div>
          <Button className={`${focusMode ? "mt-6 h-16" : "mt-5 h-14"} w-full text-base`} disabled={!store.cart.length} onClick={openPayment}>
            Finalizar venda
          </Button>
        </div>
      </aside>

      {managerDiscountOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-8">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl dark:bg-slate-950">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-black">Autorizar desconto</h2>
                <p className="mt-1 text-sm text-slate-500">
                  O limite do operador e 5%. Para aplicar {pendingDiscountPercent.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%, informe PIN ou senha de gerente.
                </p>
              </div>
              <button
                className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-900"
                onClick={() => {
                  setManagerDiscountOpen(false);
                  setDiscountError(undefined);
                  setMessage("Desconto mantido no limite de 5%.");
                  refocusBarcode();
                }}
              >
                <X size={20} />
              </button>
            </div>
            <div className="mt-5 grid gap-3">
              <input className="field h-12 w-full" value={managerLogin} onChange={(event) => setManagerLogin(event.target.value)} placeholder="Login gerente/admin" />
              <div className="grid grid-cols-2 gap-2">
                <button className={`h-10 rounded-lg text-sm font-bold ${managerCredentialMode === "pin" ? "bg-ink text-white dark:bg-white dark:text-ink" : "bg-slate-100 dark:bg-slate-900"}`} onClick={() => setManagerCredentialMode("pin")}>PIN</button>
                <button className={`h-10 rounded-lg text-sm font-bold ${managerCredentialMode === "password" ? "bg-ink text-white dark:bg-white dark:text-ink" : "bg-slate-100 dark:bg-slate-900"}`} onClick={() => setManagerCredentialMode("password")}>Senha</button>
              </div>
              <input
                className="field h-12 w-full"
                type="password"
                value={managerCredential}
                onChange={(event) => setManagerCredential(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void authorizeHighDiscount();
                }}
                placeholder={managerCredentialMode === "pin" ? "PIN do gerente" : "Senha do gerente"}
                autoFocus
              />
            </div>
            {discountError ? <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{discountError}</div> : null}
            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="ghost"
                onClick={() => {
                  setManagerDiscountOpen(false);
                  setDiscountError(undefined);
                  setMessage("Desconto mantido no limite de 5%.");
                  refocusBarcode();
                }}
              >
                Cancelar
              </Button>
              <Button disabled={!managerCredential || !managerLogin.trim()} onClick={() => void authorizeHighDiscount()}>
                Autorizar
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {operatorSwitchOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-8">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-2xl dark:bg-slate-950">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-black">Trocar operador</h2>
                <p className="text-sm text-slate-500">Autenticacao rapida por PIN ou senha.</p>
              </div>
              <button className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-900" onClick={() => setOperatorSwitchOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="mt-5 grid gap-3">
              <input className="field h-12 w-full" placeholder="Login do operador" value={operatorSwitchForm.login} onChange={(event) => setOperatorSwitchForm({ ...operatorSwitchForm, login: event.target.value })} autoFocus />
              <div className="grid grid-cols-2 gap-2">
                <button className={`h-10 rounded-lg text-sm font-bold ${operatorSwitchForm.mode === "pin" ? "bg-ink text-white dark:bg-white dark:text-ink" : "bg-slate-100 dark:bg-slate-900"}`} onClick={() => setOperatorSwitchForm({ ...operatorSwitchForm, mode: "pin" })}>PIN</button>
                <button className={`h-10 rounded-lg text-sm font-bold ${operatorSwitchForm.mode === "password" ? "bg-ink text-white dark:bg-white dark:text-ink" : "bg-slate-100 dark:bg-slate-900"}`} onClick={() => setOperatorSwitchForm({ ...operatorSwitchForm, mode: "password" })}>Senha</button>
              </div>
              {operatorSwitchForm.mode === "pin" ? (
                <input className="field h-12 w-full" inputMode="numeric" type="password" placeholder="PIN" value={operatorSwitchForm.pin} onChange={(event) => setOperatorSwitchForm({ ...operatorSwitchForm, pin: event.target.value.replace(/\D/g, "").slice(0, 8) })} />
              ) : (
                <input className="field h-12 w-full" type="password" placeholder="Senha" value={operatorSwitchForm.password} onChange={(event) => setOperatorSwitchForm({ ...operatorSwitchForm, password: event.target.value })} />
              )}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setOperatorSwitchOpen(false)}>Cancelar</Button>
              <Button disabled={!operatorSwitchForm.login.trim() || (operatorSwitchForm.mode === "pin" ? !operatorSwitchForm.pin : !operatorSwitchForm.password)} onClick={() => void switchOperator()}>
                Entrar
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {miscOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-8">
          <div className="w-full max-w-xl rounded-lg bg-white p-6 shadow-2xl dark:bg-slate-950">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-black">Produto diverso</h2>
                <p className="text-sm text-slate-500">Lance um item avulso sem cadastrar no estoque.</p>
              </div>
              <button className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-900" onClick={() => setMiscOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="mt-5 grid gap-3">
              <label className="text-sm font-semibold">
                Descricao opcional
                <input className="field mt-1 w-full" value={miscForm.description} onChange={(event) => setMiscForm({ ...miscForm, description: event.target.value })} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm font-semibold">
                  Valor
                  <input className="field mt-1 w-full" type="number" min={0} value={miscForm.unitPrice || ""} onChange={(event) => setMiscForm({ ...miscForm, unitPrice: Number(event.target.value) })} autoFocus />
                </label>
                <label className="text-sm font-semibold">
                  Quantidade
                  <input className="field mt-1 w-full" type="number" min={1} value={miscForm.quantity || ""} onChange={(event) => setMiscForm({ ...miscForm, quantity: Number(event.target.value) })} />
                </label>
              </div>
              <label className="text-sm font-semibold">
                Categoria opcional
                <input className="field mt-1 w-full" value={miscForm.category} onChange={(event) => setMiscForm({ ...miscForm, category: event.target.value })} />
              </label>
              <label className="text-sm font-semibold">
                Observacao
                <textarea className="field mt-1 h-20 w-full py-2" value={miscForm.notes} onChange={(event) => setMiscForm({ ...miscForm, notes: event.target.value })} />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setMiscOpen(false)}>
                Cancelar
              </Button>
              <Button
                disabled={miscForm.unitPrice <= 0 || miscForm.quantity <= 0}
                onClick={() => {
                  store.addCustomItem(miscForm);
                  setMiscForm({ description: "", unitPrice: 0, quantity: 1, category: "", notes: "" });
                  setMiscOpen(false);
                  setMessage("Produto diverso adicionado.");
                  refocusBarcode();
                }}
              >
                Adicionar item
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {productDrawerOpen ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/35">
          <div className="flex h-full w-[520px] flex-col bg-white shadow-2xl dark:bg-slate-950">
            <div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800">
              <div>
                <h2 className="text-lg font-black">Buscar produtos</h2>
                <p className="text-sm text-slate-500">Selecao manual para casos sem leitura de codigo.</p>
              </div>
              <button className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-900" onClick={() => setProductDrawerOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="border-b border-slate-200 p-5 dark:border-slate-800">
              <input
                className="field w-full"
                value={productSearch}
                onChange={(event) => setProductSearch(event.target.value)}
                placeholder="Nome, SKU ou codigo"
                autoFocus
              />
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-5">
              {loadingProducts ? (
                <div className="space-y-3">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <Skeleton key={index} className="h-20" />
                  ))}
                </div>
              ) : visibleProducts.length ? (
                <div className="space-y-3">
                  {visibleProducts.map((product) => (
                    <button
                      key={product.id}
                      className="w-full rounded-lg border border-slate-200 p-4 text-left transition hover:border-cobalt hover:bg-blue-50 dark:border-slate-800 dark:hover:bg-slate-900"
                      onClick={() => addProductToSale(product)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-bold">{product.name}</div>
                          <div className="mt-1 text-xs text-slate-500">{product.barcode ?? product.sku ?? "Sem codigo"} · Estoque {product.stock}</div>
                        </div>
                        <strong>{formatCurrency(product.price)}</strong>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <EmptyState title="Produto nao encontrado">Tente outro nome, SKU ou codigo de barras.</EmptyState>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {paymentOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-8">
          <div className="w-full max-w-3xl rounded-lg bg-white shadow-2xl dark:bg-slate-950">
            <div className="flex items-center justify-between border-b border-slate-200 p-6 dark:border-slate-800">
              <div>
                <h2 className="text-xl font-black">Pagamento</h2>
                <p className="text-sm text-slate-500">Total da venda: {formatCurrency(totals.total)}</p>
              </div>
              <button className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-900" onClick={() => setPaymentOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="grid gap-6 p-6">
              <div className="grid grid-cols-5 gap-3">
                {paymentOptions.map((option) => {
                  const Icon = option.icon;
                  const active = paymentMethod === option.method;
                  return (
                    <button
                      key={option.method}
                      className={`rounded-lg border p-4 text-center transition ${
                        active
                          ? "border-ink bg-ink text-white dark:border-white dark:bg-white dark:text-ink"
                          : "border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
                      }`}
                      onClick={() => {
                        setPaymentMethod(option.method);
                        setPixCharge(undefined);
                        if (option.method === "cash") setCashReceived(totals.total);
                      }}
                    >
                      <Icon className="mx-auto mb-2" size={24} />
                      <span className="text-sm font-bold">{option.label}</span>
                    </button>
                  );
                })}
              </div>

              {paymentMethod === "cash" ? (
                <section className="rounded-lg bg-slate-50 p-5 dark:bg-slate-900">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <div className="text-xs font-bold uppercase text-slate-500">Total</div>
                      <div className="mt-1 text-2xl font-black">{formatCurrency(totals.total)}</div>
                    </div>
                    <label className="text-sm font-semibold">
                      Valor recebido
                      <input
                        className="field mt-1 h-12 w-full text-lg font-bold"
                        type="number"
                        min={0}
                        value={cashReceived}
                        onChange={(event) => setCashReceived(Number(event.target.value))}
                        autoFocus
                      />
                    </label>
                    <div>
                      <div className="text-xs font-bold uppercase text-slate-500">Troco</div>
                      <div className="mt-1 text-2xl font-black text-mint">{formatCurrency(cashChange)}</div>
                    </div>
                  </div>
                  {cashReceived < totals.total ? <p className="mt-3 text-sm text-amber-600">Valor recebido menor que o total.</p> : null}
                </section>
              ) : null}

              {paymentMethod === "store_credit" ? (
                <section className="rounded-lg bg-slate-50 p-5 dark:bg-slate-900">
                  <h3 className="font-bold">Cliente obrigatorio para fiado</h3>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <input className="field" placeholder="Buscar cliente" value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} />
                    <select
                      className="field"
                      value={store.customer?.id ?? ""}
                      onChange={(event) => store.setCustomer(customers?.find((customer: Customer) => customer.id === event.target.value))}
                    >
                      <option value="">Selecione um cliente</option>
                      {customers?.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {!store.customer?.id ? <p className="mt-3 text-sm text-amber-600">Selecione um cliente antes de confirmar.</p> : null}
                </section>
              ) : null}

              {paymentMethod === "pix" ? (
                <section className="rounded-lg bg-slate-50 p-5 dark:bg-slate-900">
                  {pixBlocked ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                      Pix e um recurso premium. Ative a licenca Pro/Cloud para usar este meio de pagamento.
                    </div>
                  ) : pixNotConfigured ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                      Configure o Pix em Configuracoes &gt; Pix.
                    </div>
                  ) : (
                    <div className="grid gap-4">
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <div className="text-xs font-bold uppercase text-slate-500">Valor</div>
                          <div className="mt-1 text-2xl font-black">{formatCurrency(totals.total)}</div>
                        </div>
                        <div>
                          <div className="text-xs font-bold uppercase text-slate-500">Chave Pix</div>
                          <div className="mt-1 truncate font-bold">{pixConfig?.key}</div>
                        </div>
                        <div>
                          <div className="text-xs font-bold uppercase text-slate-500">Status</div>
                          <div className="mt-1 font-bold">{pixLoading ? "gerando" : pixCharge ? pixStatusLabel[pixCharge.status] : "aguardando"}</div>
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white p-4 font-mono text-xs dark:border-slate-800 dark:bg-slate-950">
                        {pixCharge?.qrCodePayload ?? "Gerando QR Code mockado..."}
                      </div>
                      <div className="flex gap-3">
                        <Button variant="secondary" disabled={!pixCharge} onClick={() => void copyPixPayload()}>Copiar</Button>
                        <Button disabled={!pixCharge || pixCharge.status === "paid"} onClick={() => void confirmPixManually()}>
                          Confirmar pagamento manualmente
                        </Button>
                      </div>
                    </div>
                  )}
                </section>
              ) : null}

              {paymentMethod !== "cash" && paymentMethod !== "store_credit" && paymentMethod !== "pix" ? (
                <section className="rounded-lg bg-slate-50 p-5 text-center dark:bg-slate-900">
                  <div className="text-xs font-bold uppercase text-slate-500">Valor a confirmar</div>
                  <div className="mt-1 text-3xl font-black">{formatCurrency(totals.total)}</div>
                </section>
              ) : null}
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 p-6 dark:border-slate-800">
              <Button variant="ghost" onClick={() => setPaymentOpen(false)}>
                Voltar
              </Button>
              <Button className="h-12 px-8 text-base" disabled={!canConfirmPayment} onClick={() => void finalizeSale()}>
                {paymentMethod === "cash" ? "Confirmar dinheiro" : "Confirmar pagamento"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
