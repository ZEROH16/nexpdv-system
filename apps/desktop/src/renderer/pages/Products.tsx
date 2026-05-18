import { Download, PackagePlus, Plus, Save, Upload, X } from "lucide-react";
import { useState } from "react";
import type { Product, ProductStockMovementType } from "@nexpdv/shared";
import { formatCurrency } from "@nexpdv/shared";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { useAsync } from "@/hooks/useAsync";
import { desktopApi } from "@/services/desktopApi";

const emptyProduct: Partial<Product> = {
  name: "",
  barcode: "",
  sku: "",
  brand: "",
  cost: 0,
  price: 0,
  stock: 0,
  minStock: 0,
  unit: "UN",
  expirationDate: "",
  locationEnabled: false,
  aisle: "",
  shelf: "",
  gondola: "",
  sector: "",
  active: true
};

export const Products = () => {
  const [search, setSearch] = useState("");
  const [lowStock, setLowStock] = useState(false);
  const [activeFilter, setActiveFilter] = useState<"active" | "inactive" | "all">("active");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [expiringSoon, setExpiringSoon] = useState(false);
  const [form, setForm] = useState<Partial<Product>>(emptyProduct);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [movementProduct, setMovementProduct] = useState<Product>();
  const [movementForm, setMovementForm] = useState<{ type: ProductStockMovementType; quantity: number; reason: string }>({ type: "entry", quantity: 1, reason: "" });
  const [message, setMessage] = useState<string>();
  const { data, loading, refresh } = useAsync(
    () => desktopApi.products.list({ search, lowStock, active: activeFilter, categoryId: categoryFilter || undefined, expiringDays: expiringSoon ? 30 : undefined, pageSize: 100 }),
    [activeFilter, categoryFilter, expiringSoon, lowStock, search]
  );
  const { data: categories } = useAsync(() => desktopApi.products.categories(), []);
  const { data: systemState, refresh: refreshSystem } = useAsync(() => desktopApi.system.state(), []);
  const { data: stockHistory, refresh: refreshStockHistory } = useAsync(
    () => movementProduct?.id ? desktopApi.products.stockMovements(movementProduct.id) : Promise.resolve([]),
    [movementProduct?.id]
  );

  const openNew = () => {
    setForm(emptyProduct);
    setDrawerOpen(true);
  };

  const openEdit = (product: Product) => {
    setForm(product);
    setDrawerOpen(true);
  };

  const save = async () => {
    try {
      const saved = await desktopApi.products.save(form);
      setDrawerOpen(false);
      setForm(emptyProduct);
      setMessage(`${saved.name} salvo.`);
      refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel salvar o produto.");
    }
  };

  const saveMovement = async () => {
    if (!movementProduct) return;
    try {
      const updated = await desktopApi.products.stockMovement({ ...movementForm, productId: movementProduct.id });
      setMovementProduct(updated);
      setMovementForm({ type: "entry", quantity: 1, reason: "" });
      setMessage("Movimentacao de estoque registrada.");
      refresh();
      refreshStockHistory();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel movimentar o estoque.");
    }
  };

  const importCsv = async (file?: File) => {
    if (!file) return;
    const csv = await file.text();
    const result = await desktopApi.products.importCsv(csv);
    setMessage(`${result.imported} produtos importados.`);
    refresh();
  };

  const downloadTemplate = () => {
    const header = "nome,codigo,sku,categoria,marca,custo,preco,estoque,minimo,unidade\n";
    const url = URL.createObjectURL(new Blob([header], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "modelo-produtos-nexpdv.csv";
    link.click();
  };

  return (
    <div className="space-y-4">
      <section className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800">
          <div className="flex gap-3">
            <input className="field w-80" placeholder="Pesquisar produtos" value={search} onChange={(event) => setSearch(event.target.value)} />
            <select className="field" value={activeFilter} onChange={(event) => setActiveFilter(event.target.value as typeof activeFilter)}>
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
              <option value="all">Todos</option>
            </select>
            <select className="field" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              <option value="">Categorias</option>
              {categories?.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
            <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold dark:border-slate-700">
              <input type="checkbox" checked={lowStock} onChange={(event) => setLowStock(event.target.checked)} />
              Estoque baixo
            </label>
            <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold dark:border-slate-700">
              <input type="checkbox" checked={expiringSoon} onChange={(event) => setExpiringSoon(event.target.checked)} />
              Validade proxima
            </label>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={openNew}>
              <Plus size={16} />
              Novo produto
            </Button>
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900">
              <Upload size={16} />
              CSV
              <input className="hidden" type="file" accept=".csv,text/csv" onChange={(event) => importCsv(event.target.files?.[0])} />
            </label>
            <Button variant="secondary" onClick={downloadTemplate}>
              <Download size={16} />
              Modelo CSV
            </Button>
          </div>
        </div>
        {message ? <div className="border-b border-slate-200 px-5 py-3 text-sm dark:border-slate-800">{message}</div> : null}
        {loading ? (
          <div className="p-6 text-sm text-slate-500">Carregando...</div>
        ) : data?.data.length ? (
          <table className="w-full border-collapse">
            <thead className="table-head">
              <tr>
                <th className="px-4 py-3">Produto</th>
                <th className="px-4 py-3">Codigo</th>
                <th className="px-4 py-3">Preco</th>
                <th className="px-4 py-3">Estoque</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {data.data.map((product) => (
                <tr key={product.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-950" onClick={() => openEdit(product)}>
                  <td className="table-cell">
                    <div className="font-semibold">{product.name}</div>
                    <div className="text-xs text-slate-500">{product.brand || product.categoryName}</div>
                  </td>
                  <td className="table-cell">{product.barcode || product.sku}</td>
                  <td className="table-cell font-bold">{formatCurrency(product.price)}</td>
                  <td className="table-cell">
                    <span className={product.stock <= product.minStock ? "font-bold text-amber-600" : ""}>{product.stock}</span>
                  </td>
                  <td className="table-cell">
                    <StatusBadge tone={product.active ? "green" : "slate"}>{product.active ? "Ativo" : "Inativo"}</StatusBadge>
                  </td>
                  <td className="table-cell">
                    <Button className="h-9 px-3" variant="secondary" onClick={(event) => {
                      event.stopPropagation();
                      setMovementProduct(product);
                    }}>
                      <PackagePlus size={15} />
                      Estoque
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-6">
            <EmptyState title="Nenhum produto encontrado" />
          </div>
        )}
      </section>

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/45">
          <aside className="flex h-full w-[520px] flex-col bg-white shadow-2xl dark:bg-slate-950">
            <div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800">
              <div>
                <h2 className="text-xl font-black">{form.id ? "Editar produto" : "Novo produto"}</h2>
                <p className="text-sm text-slate-500">Cadastro comercial e estoque.</p>
              </div>
              <button className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-900" onClick={() => setDrawerOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-5">
              <div className="grid gap-3">
                <label className="text-sm font-semibold">
                  Nome do produto
                  <input className="field mt-1 w-full" value={form.name ?? ""} onChange={(event) => setForm({ ...form, name: event.target.value })} />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm font-semibold">
                    Codigo de barras
                    <input className="field mt-1 w-full" value={form.barcode ?? ""} onChange={(event) => setForm({ ...form, barcode: event.target.value })} />
                  </label>
                  <label className="text-sm font-semibold">
                    SKU
                    <input className="field mt-1 w-full" value={form.sku ?? ""} onChange={(event) => setForm({ ...form, sku: event.target.value })} />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm font-semibold">
                    Categoria
                    <input className="field mt-1 w-full" list="product-categories" value={form.categoryName ?? ""} onChange={(event) => setForm({ ...form, categoryId: categories?.find((category) => category.name === event.target.value)?.id, categoryName: event.target.value } as Partial<Product>)} />
                    <datalist id="product-categories">
                      {categories?.map((category) => <option key={category.id} value={category.name} />)}
                    </datalist>
                  </label>
                  <label className="text-sm font-semibold">
                    Marca
                    <input className="field mt-1 w-full" value={form.brand ?? ""} onChange={(event) => setForm({ ...form, brand: event.target.value })} />
                  </label>
                </div>
                <label className="text-sm font-semibold">
                  Unidade
                  <input className="field mt-1 w-full" value={form.unit ?? "UN"} onChange={(event) => setForm({ ...form, unit: event.target.value })} />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm font-semibold">
                    Preco de custo
                    <input className="field mt-1 w-full" type="number" placeholder="0,00" value={form.cost || ""} onChange={(event) => setForm({ ...form, cost: Number(event.target.value) })} />
                  </label>
                  <label className="text-sm font-semibold">
                    Preco de venda
                    <input className="field mt-1 w-full" type="number" placeholder="0,00" value={form.price || ""} onChange={(event) => setForm({ ...form, price: Number(event.target.value) })} />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm font-semibold">
                    Estoque atual
                    <input className="field mt-1 w-full" type="number" placeholder="0" value={form.stock || ""} onChange={(event) => setForm({ ...form, stock: Number(event.target.value) })} />
                  </label>
                  <label className="text-sm font-semibold">
                    Estoque minimo
                    <input className="field mt-1 w-full" type="number" placeholder="0" value={form.minStock || ""} onChange={(event) => setForm({ ...form, minStock: Number(event.target.value) })} />
                  </label>
                </div>
                <label className="text-sm font-semibold">
                  Validade
                  <input className="field mt-1 w-full" type="date" value={form.expirationDate?.slice(0, 10) ?? ""} onChange={(event) => setForm({ ...form, expirationDate: event.target.value })} />
                </label>
                <label className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm font-semibold dark:border-slate-700">
                  <input
                    type="checkbox"
                    checked={systemState?.locationControl ?? false}
                    onChange={async (event) => {
                      await desktopApi.system.settings({ locationControl: event.target.checked });
                      refreshSystem();
                    }}
                  />
                  Usar controle por localizacao
                </label>
                {systemState?.locationControl ? (
                  <div className="grid grid-cols-2 gap-3">
                    <input className="field" placeholder="Corredor" value={form.aisle ?? ""} onChange={(event) => setForm({ ...form, locationEnabled: true, aisle: event.target.value })} />
                    <input className="field" placeholder="Prateleira" value={form.shelf ?? ""} onChange={(event) => setForm({ ...form, locationEnabled: true, shelf: event.target.value })} />
                    <input className="field" placeholder="Gondola" value={form.gondola ?? ""} onChange={(event) => setForm({ ...form, locationEnabled: true, gondola: event.target.value })} />
                    <input className="field" placeholder="Setor" value={form.sector ?? ""} onChange={(event) => setForm({ ...form, locationEnabled: true, sector: event.target.value })} />
                  </div>
                ) : null}
                <label className="flex h-10 items-center gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={form.active ?? true}
                    onChange={(event) => {
                      const next = event.target.checked;
                      if (!next && !window.confirm("Deseja inativar este produto? Ele nao aparecera na Frente de Caixa.")) return;
                      setForm({ ...form, active: next });
                    }}
                  />
                  Ativo
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 p-5 dark:border-slate-800">
              <Button variant="ghost" onClick={() => setDrawerOpen(false)}>Cancelar</Button>
              <Button onClick={save} disabled={!form.name}>
                <Save size={16} />
                Salvar
              </Button>
            </div>
          </aside>
        </div>
      ) : null}

      {movementProduct ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-8">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg bg-white p-6 shadow-2xl dark:bg-slate-950">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-black">Movimentar estoque</h2>
                <p className="text-sm text-slate-500">{movementProduct.name} - atual: {movementProduct.stock}</p>
              </div>
              <button className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-900" onClick={() => setMovementProduct(undefined)}>
                <X size={20} />
              </button>
            </div>
            <div className="mt-5 grid grid-cols-[1fr_120px_1fr_auto] gap-3">
              <select className="field" value={movementForm.type} onChange={(event) => setMovementForm({ ...movementForm, type: event.target.value as ProductStockMovementType })}>
                <option value="entry">Entrada manual</option>
                <option value="exit">Saida manual</option>
                <option value="adjustment">Ajuste de saldo</option>
                <option value="loss">Perda</option>
                <option value="expiration">Vencimento</option>
              </select>
              <input className="field" type="number" min={0} value={movementForm.quantity || ""} onChange={(event) => setMovementForm({ ...movementForm, quantity: Number(event.target.value) })} />
              <input className="field" placeholder="Motivo/observacao" value={movementForm.reason} onChange={(event) => setMovementForm({ ...movementForm, reason: event.target.value })} />
              <Button disabled={movementForm.quantity <= 0} onClick={saveMovement}>Registrar</Button>
            </div>
            <div className="mt-6">
              <h3 className="text-sm font-black uppercase text-slate-500">Historico recente</h3>
              <div className="mt-3 space-y-2">
                {stockHistory?.length ? stockHistory.map((item) => (
                  <div key={item.id} className="grid grid-cols-3 gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-900">
                    <span className="font-semibold">{item.type} - {item.quantity}</span>
                    <span className="text-slate-500">{item.previousStock} -&gt; {item.newStock}</span>
                    <span className="text-right text-slate-500">{new Date(item.createdAt).toLocaleString("pt-BR")}</span>
                  </div>
                )) : <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500 dark:bg-slate-900">Nenhuma movimentacao registrada.</div>}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
