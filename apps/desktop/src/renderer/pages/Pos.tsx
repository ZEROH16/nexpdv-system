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
  cancelled: "cancelado",
  error: "erro"
};

export const Pos = () => {
  const barcodeRef = useRef<HTMLInputElement>(null);
  const discountRef = useRef<HTMLInputElement>(null);
  const productSearchRef = useRef<HTMLInputElement>(null);
  const pixAutoFinalizeRef = useRef<string>();
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
  const [pixCountdown, setPixCountdown] = useState<number>();
  const [managerDiscountOpen, setManagerDiscountOpen] = useState(false);
  const [managerCredential, setManagerCredential] = useState("");
  const [managerLogin, setManagerLogin] = useState("gerente");
  const [managerCredentialMode, setManagerCredentialMode] = useState<"pin" | "password">("pin");
  const [pendingDiscountPercent, setPendingDiscountPercent] = useState(0);
  const [operatorSwitchOpen, setOperatorSwitchOpen] = useState(false);
  const [operatorSwitchForm, setOperatorSwitchForm] = useState({ login: "", pin: "", password: "", mode: "pin" as "pin" | "password" });
  const [creditAuthOpen, setCreditAuthOpen] = useState(false);
  const [creditAuthForm, setCreditAuthForm] = useState({ login: "gerente", credential: "", mode: "pin" as "pin" | "password" });
  const [creditAuthError, setCreditAuthError] = useState<string>();
  const [discountError, setDiscountError] = useState<string>();
  const [highDiscountAuthorized, setHighDiscountAuthorized] = useState(false);
  const [highDiscountAuthorizationToken, setHighDiscountAuthorizationToken] = useState<string>();
  const [storeCreditAuthorizationToken, setStoreCreditAuthorizationToken] = useState<string>();
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
    () => desktopApi.products.list({ search: productSearch, pageSize: 40, active: "active" }),
    [productSearch]
  );
  const { data: customers } = useAsync(() => desktopApi.customers.list(customerSearch), [customerSearch]);
  const { data: license } = useAsync(() => desktopApi.license.check(), []);
  const { data: pixConfig } = useAsync(() => desktopApi.pix.getPixConfig(), []);
  const { data: authState, refresh: refreshAuth } = useAsync(() => desktopApi.auth.state(), []);
  const { data: cashRegister, refresh: refreshCash } = useAsync(() => desktopApi.cash.current(), []);
  const { data: systemState } = useAsync(() => desktopApi.system.state(), []);

  const visibleProducts = products?.data ?? [];
  const selectedCustomer = useMemo(
    () => customers?.find((customer) => customer.id === store.customer?.id) ?? store.customer,
    [customers, store.customer]
  );
  const cashChange = Math.max(cashReceived - totals.total, 0);
  const storeCreditLimitExceeded =
    paymentMethod === "store_credit" &&
    Boolean(selectedCustomer?.id) &&
    selectedCustomer!.balance + totals.total > selectedCustomer!.creditLimit;
  const pixFeatureEnabled = Boolean(license?.features?.pix ?? license?.pixEnabled);
  const pixProvider = (pixConfig?.provider ?? "mock").toLowerCase();
  const pixProviderLabel = pixProvider === "pagbank" ? "PagBank" : "Mock/manual";
  const pixBlocked = paymentMethod === "pix" && !pixFeatureEnabled;
  const pixNotConfigured = paymentMethod === "pix" && pixFeatureEnabled && (!pixConfig?.enabled || (pixProvider === "mock" && !pixConfig.key) || (pixProvider === "pagbank" && !pixConfig.apiKey));
  const pixWaitingPayment = paymentMethod === "pix" && pixFeatureEnabled && Boolean(pixConfig?.enabled) && pixCharge?.status !== "paid";
  const canSell = !systemState?.usePermissions || Boolean(authState?.user?.permissions?.includes("sell"));
  const cashClosedBlocksSale = !cashRegister && !systemState?.allowSalesWithoutCashRegister;
  const canConfirmPayment =
    store.cart.length > 0 &&
    !loadingCheckout &&
    canSell &&
    !cashClosedBlocksSale &&
    (paymentMethod !== "cash" || cashReceived >= totals.total) &&
    (paymentMethod !== "store_credit" || (Boolean(store.customer?.id) && (!storeCreditLimitExceeded || Boolean(storeCreditAuthorizationToken)))) &&
    !pixBlocked &&
    !pixNotConfigured &&
    !pixWaitingPayment;
  const canOpenPayment = store.cart.length > 0 && canSell && !cashClosedBlocksSale;

  useEffect(() => {
    barcodeRef.current?.focus();
  }, [focusMode]);

  useEffect(() => {
    if (!paymentOpen || paymentMethod !== "pix") return;
    if (!pixFeatureEnabled || !pixConfig?.enabled || pixNotConfigured || pixCharge || pixLoading) return;
    setPixLoading(true);
    desktopApi.pix
      .createCharge({ amount: totals.total })
      .then(setPixCharge)
      .catch((error) => setMessage(error instanceof Error ? error.message : "Nao foi possivel gerar a cobranca Pix."))
      .finally(() => setPixLoading(false));
  }, [paymentMethod, paymentOpen, pixCharge, pixConfig?.enabled, pixFeatureEnabled, pixLoading, pixNotConfigured, totals.total]);

  useEffect(() => {
    if (!paymentOpen || paymentMethod !== "pix" || !pixCharge || pixCharge.status !== "waiting") return;
    const poll = window.setInterval(() => {
      desktopApi.pix
        .getCharge({ chargeId: pixCharge.id, refreshProvider: true })
        .then(setPixCharge)
        .catch((error) => setMessage(error instanceof Error ? error.message : "Falha ao consultar Pix."));
    }, 5000);
    return () => window.clearInterval(poll);
  }, [paymentMethod, paymentOpen, pixCharge?.id, pixCharge?.status]);

  useEffect(() => {
    if (!paymentOpen || paymentMethod !== "pix" || !pixCharge?.expiresAt) {
      setPixCountdown(undefined);
      return;
    }
    const updateCountdown = () => setPixCountdown(Math.max(0, Math.ceil((new Date(pixCharge.expiresAt!).getTime() - Date.now()) / 1000)));
    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [paymentMethod, paymentOpen, pixCharge?.expiresAt]);

  useEffect(() => {
    setStoreCreditAuthorizationToken(undefined);
  }, [paymentMethod, selectedCustomer?.id, totals.total]);

  const refocusBarcode = () => {
    window.setTimeout(() => barcodeRef.current?.focus(), 50);
  };

  useEffect(() => {
    if (productDrawerOpen) {
      window.setTimeout(() => productSearchRef.current?.focus(), 50);
      return;
    }
    if (!paymentOpen && !miscOpen && !managerDiscountOpen && !operatorSwitchOpen && !creditAuthOpen) refocusBarcode();
  }, [creditAuthOpen, managerDiscountOpen, miscOpen, operatorSwitchOpen, paymentOpen, productDrawerOpen]);

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
    pixAutoFinalizeRef.current = undefined;
    setHighDiscountAuthorizationToken(undefined);
    setStoreCreditAuthorizationToken(undefined);
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
      setHighDiscountAuthorizationToken(result.token);
      setMessage(`Desconto de ${requested.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% autorizado.`);
      recordAudit("desconto maior que 5% autorizado", `${requested}% na venda em andamento`);
      refocusBarcode();
      return;
    }
    store.setSaleDiscount(5);
    setHighDiscountAuthorized(false);
    setHighDiscountAuthorizationToken(undefined);
    setDiscountError("Senha incorreta. O desconto ficou limitado a 5%.");
    setMessage("Senha incorreta. O desconto ficou limitado a 5%.");
    recordAudit("tentativa de desconto acima de 5% negada", `${requested}% solicitado`);
    refocusBarcode();
  };

  const authorizeStoreCreditLimit = async () => {
    const result = await desktopApi.auth.authorize({
      login: creditAuthForm.login,
      pin: creditAuthForm.mode === "pin" ? creditAuthForm.credential : undefined,
      password: creditAuthForm.mode === "password" ? creditAuthForm.credential : undefined,
      permission: "authorize_store_credit_limit",
      requireManager: true
    });
    if (result.ok) {
      setStoreCreditAuthorizationToken(result.token);
      setCreditAuthOpen(false);
      setCreditAuthForm((current) => ({ ...current, credential: "" }));
      setCreditAuthError(undefined);
      setMessage("Fiado acima do limite autorizado para esta venda.");
      recordAudit("autorizacao acima do limite fiado", selectedCustomer?.name);
      refocusBarcode();
      return;
    }
    setStoreCreditAuthorizationToken(undefined);
    setCreditAuthError(result.message);
    recordAudit("tentativa acao negada", "fiado acima do limite");
  };

  const confirmPixManually = async () => {
    if (!pixCharge) return;
    const updated = await desktopApi.pix.confirmChargeMock(pixCharge.id);
    setPixCharge(updated);
    setMessage("Pagamento Pix confirmado manualmente.");
  };

  const cancelPixCharge = async () => {
    if (!pixCharge) return;
    const updated = await desktopApi.pix.cancelCharge(pixCharge.id);
    setPixCharge(updated);
    setMessage("Cobranca Pix cancelada.");
  };

  const copyPixPayload = async () => {
    const payload = pixCharge?.payloadPix ?? pixCharge?.qrCodePayload;
    if (!payload) return;
    await navigator.clipboard?.writeText(payload).catch(() => undefined);
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
    if (!product.active) {
      setMessage(`${product.name} esta inativo.`);
      refocusBarcode();
      return;
    }
    const currentQuantity = store.cart.find((line) => line.product?.id === product.id)?.quantity ?? 0;
    if (product.stock <= 0 || currentQuantity >= product.stock) {
      setMessage(`Estoque insuficiente para ${product.name}.`);
      refocusBarcode();
      return;
    }
    store.addProduct(product);
    setMessage(`${product.name} adicionado.`);
    setProductDrawerOpen(false);
    refocusBarcode();
  };

  const addByBarcode = async () => {
    const code = barcode.trim();
    if (!code || loadingScan) return;
    setLoadingScan(true);
    setMessage(undefined);
    try {
      const response = await desktopApi.products.list({ search: code, pageSize: 20 });
      const activeProducts = response.data.filter((product) => product.active);
      const exact =
        activeProducts.find((product) => product.barcode === code || product.sku === code) ??
        (activeProducts.length === 1 ? activeProducts[0] : undefined);

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
    if (!canSell) {
      setMessage("Operador sem permissao para vender. Solicite acesso de gerente/admin.");
      return;
    }
    if (cashClosedBlocksSale) {
      setMessage("Caixa fechado. Abra o caixa antes de finalizar vendas.");
      return;
    }
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
        highDiscountAuthorizationToken,
        storeCreditAuthorizationToken,
        pixChargeId: paymentMethod === "pix" ? pixCharge?.id : undefined,
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
      let printWarning: string | undefined;
      if (systemState?.receiptAutoPrint ?? true) {
        await desktopApi.receipt.print(sale.receiptHtml, { saleId: sale.id, saleNumber: sale.number, reason: "sale" }).catch((error) => {
          printWarning = error instanceof Error ? error.message : "Nao foi possivel imprimir o comprovante.";
        });
      }
      clearCurrentSale();
      setPaymentOpen(false);
      setBarcode("");
      setMessage(printWarning ? `Venda ${sale.number} finalizada em ${paymentLabel[paymentMethod]}. Impressao: ${printWarning}` : `Venda ${sale.number} finalizada em ${paymentLabel[paymentMethod]}.`);
      refreshProducts();
      refreshCash();
      refocusBarcode();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel finalizar a venda.");
    } finally {
      setLoadingCheckout(false);
    }
  };

  useEffect(() => {
    if (!paymentOpen || paymentMethod !== "pix" || pixCharge?.status !== "paid") return;
    if (pixAutoFinalizeRef.current === pixCharge.id || loadingCheckout) return;
    pixAutoFinalizeRef.current = pixCharge.id;
    void finalizeSale();
  }, [loadingCheckout, paymentMethod, paymentOpen, pixCharge?.id, pixCharge?.status]);

  useHotkeys({
    F2: () => setProductDrawerOpen(true),
    F4: () => {
      if (paymentOpen && canConfirmPayment) void finalizeSale();
      else openPayment();
    },
    F6: () => discountRef.current?.focus(),
    F8: () => discountRef.current?.focus(),
    F9: () => setMiscOpen(true),
    Escape: () => {
      if (managerDiscountOpen) setManagerDiscountOpen(false);
      else if (creditAuthOpen) setCreditAuthOpen(false);
      else if (operatorSwitchOpen) setOperatorSwitchOpen(false);
      else if (paymentOpen) setPaymentOpen(false);
      else if (miscOpen) setMiscOpen(false);
      else if (productDrawerOpen) setProductDrawerOpen(false);
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
                  if (event.key === "Enter") {
                    event.stopPropagation();
                    void addByBarcode();
                  }
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
                            {line.custom ? "Produto diverso" : `${line.product?.barcode ?? line.product?.sku ?? "Sem codigo"} - Estoque ${line.product?.stock ?? 0}`}
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
            {selectedCustomer ? <div className="text-xs text-slate-500">Limite fiado: {formatCurrency(selectedCustomer.creditLimit)} - Saldo {formatCurrency(selectedCustomer.balance)}</div> : null}
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
          {cashClosedBlocksSale ? (
            <div className="rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-200">
              Caixa fechado. Abra o caixa para finalizar vendas.
            </div>
          ) : null}
          {!canSell ? (
            <div className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700 dark:bg-red-950 dark:text-red-200">
              Operador sem permissao para vender.
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
          <Button className={`${focusMode ? "mt-6 h-16" : "mt-5 h-14"} w-full text-base`} disabled={!canOpenPayment} onClick={openPayment}>
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

      {creditAuthOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-8">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl dark:bg-slate-950">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-black">Autorizar fiado</h2>
                <p className="mt-1 text-sm text-slate-500">A venda ultrapassa o limite do cliente. Informe PIN ou senha de gerente/admin.</p>
              </div>
              <button className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-900" onClick={() => setCreditAuthOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="mt-5 grid gap-3">
              <input className="field h-12 w-full" value={creditAuthForm.login} onChange={(event) => setCreditAuthForm({ ...creditAuthForm, login: event.target.value })} placeholder="Login gerente/admin" />
              <div className="grid grid-cols-2 gap-2">
                <button className={`h-10 rounded-lg text-sm font-bold ${creditAuthForm.mode === "pin" ? "bg-ink text-white dark:bg-white dark:text-ink" : "bg-slate-100 dark:bg-slate-900"}`} onClick={() => setCreditAuthForm({ ...creditAuthForm, mode: "pin" })}>PIN</button>
                <button className={`h-10 rounded-lg text-sm font-bold ${creditAuthForm.mode === "password" ? "bg-ink text-white dark:bg-white dark:text-ink" : "bg-slate-100 dark:bg-slate-900"}`} onClick={() => setCreditAuthForm({ ...creditAuthForm, mode: "password" })}>Senha</button>
              </div>
              <input
                className="field h-12 w-full"
                type="password"
                value={creditAuthForm.credential}
                onChange={(event) => setCreditAuthForm({ ...creditAuthForm, credential: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void authorizeStoreCreditLimit();
                }}
                placeholder={creditAuthForm.mode === "pin" ? "PIN do gerente" : "Senha do gerente"}
                autoFocus
              />
            </div>
            {creditAuthError ? <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{creditAuthError}</div> : null}
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setCreditAuthOpen(false)}>Cancelar</Button>
              <Button disabled={!creditAuthForm.credential || !creditAuthForm.login.trim()} onClick={() => void authorizeStoreCreditLimit()}>Autorizar</Button>
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
                ref={productSearchRef}
                className="field w-full"
                value={productSearch}
                onChange={(event) => setProductSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && visibleProducts.length === 1) addProductToSale(visibleProducts[0]);
                }}
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
                      className={`w-full rounded-lg border p-4 text-left transition ${
                        product.active && product.stock > 0
                          ? "border-slate-200 hover:border-cobalt hover:bg-blue-50 dark:border-slate-800 dark:hover:bg-slate-900"
                          : "border-slate-200 opacity-55 dark:border-slate-800"
                      }`}
                      onClick={() => addProductToSale(product)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-bold">{product.name}</div>
                          <div className="mt-1 text-xs text-slate-500">{product.barcode ?? product.sku ?? "Sem codigo"} - Estoque {product.stock}</div>
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
                  {storeCreditLimitExceeded ? (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                      <div className="font-bold">Limite de fiado excedido.</div>
                      <div className="mt-1">Saldo atual + venda: {formatCurrency((selectedCustomer?.balance ?? 0) + totals.total)} de limite {formatCurrency(selectedCustomer?.creditLimit ?? 0)}.</div>
                      {storeCreditAuthorizationToken ? (
                        <div className="mt-2 font-bold text-emerald-700 dark:text-emerald-300">Autorizado para esta venda.</div>
                      ) : (
                        <Button className="mt-3 h-10 px-3" variant="secondary" onClick={() => setCreditAuthOpen(true)}>Autorizar limite</Button>
                      )}
                    </div>
                  ) : null}
                </section>
              ) : null}

              {paymentMethod === "pix" ? (
                <section className="rounded-lg bg-slate-50 p-5 dark:bg-slate-900">
                  {pixBlocked ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                      Pix e um recurso premium. Ative uma licenca com modulo Pix para usar este meio de pagamento.
                    </div>
                  ) : pixNotConfigured ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                      Configure o Pix em Configuracoes &gt; Pix.
                    </div>
                  ) : (
                    <div className="grid gap-4">
                      <div className="grid grid-cols-4 gap-4">
                        <div>
                          <div className="text-xs font-bold uppercase text-slate-500">Valor</div>
                          <div className="mt-1 text-2xl font-black">{formatCurrency(totals.total)}</div>
                        </div>
                        <div>
                          <div className="text-xs font-bold uppercase text-slate-500">Provider</div>
                          <div className="mt-1 font-bold">{pixProviderLabel}</div>
                        </div>
                        <div>
                          <div className="text-xs font-bold uppercase text-slate-500">Status</div>
                          <div className={`mt-1 inline-flex rounded-full px-3 py-1 text-xs font-black ${
                            pixCharge?.status === "paid"
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                              : pixCharge?.status === "error" || pixCharge?.status === "expired" || pixCharge?.status === "cancelled"
                                ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                                : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                          }`}>
                            {pixLoading ? "gerando" : pixCharge ? pixStatusLabel[pixCharge.status] : "aguardando"}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-bold uppercase text-slate-500">Tempo</div>
                          <div className="mt-1 font-bold">{pixCountdown !== undefined ? `${Math.floor(pixCountdown / 60)}:${String(pixCountdown % 60).padStart(2, "0")}` : "15:00"}</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-4">
                        <div className="flex h-[220px] items-center justify-center rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800">
                          {pixLoading ? (
                            <Skeleton className="h-full w-full" />
                          ) : pixCharge?.qrCode ? (
                            <img className="h-full w-full object-contain" src={pixCharge.qrCode} alt="QR Code Pix" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center rounded-lg bg-slate-100 text-center text-xs font-bold text-slate-500 dark:bg-slate-900">
                              QR Code indisponivel
                              <br />
                              use copia e cola
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                          <div className="text-xs font-bold uppercase text-slate-500">Pix copia e cola</div>
                          <div className="mt-3 max-h-32 overflow-auto break-all font-mono text-xs">
                            {pixCharge?.payloadPix ?? pixCharge?.qrCodePayload ?? "Gerando cobranca Pix..."}
                          </div>
                          {pixCharge?.providerPaymentId ? <div className="mt-3 text-xs text-slate-500">Pagamento: {pixCharge.providerPaymentId}</div> : null}
                          {pixCharge?.providerStatus ? <div className="mt-1 text-xs text-slate-500">Provider status: {pixCharge.providerStatus}</div> : null}
                          {pixCharge?.errorMessage ? <div className="mt-3 rounded-lg bg-amber-50 p-3 text-xs font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-200">{pixCharge.errorMessage}</div> : null}
                          {pixCharge?.manualConfirmation ? <div className="mt-3 rounded-lg bg-blue-50 p-3 text-xs font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-200">Confirmacao manual registrada para manter o PDV operando offline.</div> : null}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <Button variant="secondary" disabled={!pixCharge} onClick={() => void copyPixPayload()}>Copiar</Button>
                        <Button variant="secondary" disabled={!pixCharge || pixCharge.status !== "waiting"} onClick={() => void cancelPixCharge()}>Cancelar cobranca</Button>
                        <Button disabled={!pixCharge || pixCharge.status === "paid"} onClick={() => void confirmPixManually()}>
                          Confirmar pagamento manualmente
                        </Button>
                      </div>
                      <div className="text-xs text-slate-500">O NexPDV consulta o status automaticamente. Se o PagBank ou a internet falhar, a confirmacao manual mantem a venda funcionando offline.</div>
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
