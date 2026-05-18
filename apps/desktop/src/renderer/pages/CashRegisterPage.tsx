import { Banknote, Lock, MinusCircle, PlusCircle, Wallet } from "lucide-react";
import { useState } from "react";
import { formatCurrency, formatDateTime } from "@nexpdv/shared";
import { Button } from "@/components/Button";
import { Skeleton } from "@/components/Skeleton";
import { StatCard } from "@/components/StatCard";
import { useAsync } from "@/hooks/useAsync";
import { desktopApi } from "@/services/desktopApi";

type MovementType = "income" | "expense" | "withdrawal";

const movementLabels: Record<MovementType, string> = {
  income: "Entrada",
  expense: "Saida",
  withdrawal: "Sangria"
};

export const CashRegisterPage = () => {
  const [openingAmount, setOpeningAmount] = useState(100);
  const [movementOpen, setMovementOpen] = useState(false);
  const [movement, setMovement] = useState({ type: "income" as MovementType, description: "", amount: 0 });
  const [closingOpen, setClosingOpen] = useState(false);
  const [countedAmount, setCountedAmount] = useState(0);
  const [closingNotes, setClosingNotes] = useState("");
  const [message, setMessage] = useState<string>();
  const { data: summary, loading, refresh } = useAsync(() => desktopApi.cash.summary(), []);
  const cashRegister = summary?.cashRegister;
  const outputTotal = (summary?.expenseTotal ?? 0) + (summary?.withdrawalTotal ?? 0);
  const difference = countedAmount - (summary?.expectedAmount ?? 0);

  const open = async () => {
    try {
      await desktopApi.cash.open(openingAmount);
      setMessage("Caixa aberto.");
      refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel abrir o caixa.");
    }
  };

  const openMovement = (type: MovementType) => {
    setMovement({ type, description: movementLabels[type], amount: 0 });
    setMovementOpen(true);
  };

  const addMovement = async () => {
    try {
      await desktopApi.cash.movement(movement);
      setMovementOpen(false);
      setMovement({ type: "income", description: "", amount: 0 });
      setMessage(`${movementLabels[movement.type]} registrada.`);
      refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel registrar a movimentacao.");
    }
  };

  const startClosing = () => {
    setCountedAmount(summary?.expectedAmount ?? 0);
    setClosingNotes("");
    setClosingOpen(true);
  };

  const close = async () => {
    if (!cashRegister) return;
    try {
      const closed = await desktopApi.cash.close({ cashRegisterId: cashRegister.id, countedAmount, closingNotes });
      setClosingOpen(false);
      setMessage(`Caixa fechado. Diferenca: ${formatCurrency(closed.difference ?? 0)}${closingNotes ? " com observacao registrada." : "."}`);
      refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel fechar o caixa.");
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (!cashRegister) {
    return (
      <div className="mx-auto max-w-xl">
        <section className="panel p-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-slate-100 text-ink dark:bg-slate-900 dark:text-white">
            <Lock size={26} />
          </div>
          <h2 className="mt-5 text-2xl font-black">Caixa fechado</h2>
          <p className="mt-2 text-sm text-slate-500">Informe o valor inicial para liberar as vendas do turno.</p>
          <label className="mt-6 block text-sm font-semibold">
            Valor inicial
            <input className="field mt-2 h-12 w-full text-lg font-bold" type="number" min={0} value={openingAmount} onChange={(event) => setOpeningAmount(Number(event.target.value))} />
          </label>
          <Button className="mt-5 h-12 w-full text-base" onClick={open}>
            <PlusCircle size={18} />
            Abrir caixa
          </Button>
          {message ? <div className="mt-4 rounded-lg bg-slate-100 p-3 text-sm dark:bg-slate-950">{message}</div> : null}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="panel p-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="inline-flex rounded-lg bg-emerald-50 px-3 py-1 text-xs font-bold uppercase text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              Caixa aberto
            </div>
            <h2 className="mt-4 text-2xl font-black">Turno em andamento</h2>
            <p className="mt-1 text-sm text-slate-500">
              Aberto desde {formatDateTime(cashRegister.openedAt)} por {cashRegister.operatorName}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => openMovement("income")}>
              <PlusCircle size={16} />
              Registrar entrada
            </Button>
            <Button variant="secondary" onClick={() => openMovement("expense")}>
              <MinusCircle size={16} />
              Registrar saida
            </Button>
            <Button variant="secondary" onClick={() => openMovement("withdrawal")}>
              <Wallet size={16} />
              Sangria
            </Button>
            <Button variant="danger" onClick={startClosing}>
              <Lock size={16} />
              Fechar caixa
            </Button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-5 gap-4">
        <StatCard label="Valor inicial" value={formatCurrency(cashRegister.openingAmount)} icon={<Banknote size={20} />} />
        <StatCard label="Total vendido" value={formatCurrency(summary?.salesTotal ?? 0)} icon={<Banknote size={20} />} tone="good" />
        <StatCard label="Entradas" value={formatCurrency(summary?.incomeTotal ?? 0)} icon={<PlusCircle size={20} />} tone="good" />
        <StatCard label="Saidas/Sangrias" value={formatCurrency(outputTotal)} icon={<MinusCircle size={20} />} tone={outputTotal ? "warn" : "default"} />
        <StatCard label="Valor esperado" value={formatCurrency(summary?.expectedAmount ?? 0)} icon={<Wallet size={20} />} tone="good" />
      </div>

      <section className="panel p-6">
        <h2 className="text-lg font-black">Resumo do caixa</h2>
        <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
          <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-950">
            <span className="text-slate-500">Operador</span>
            <strong className="mt-1 block">{cashRegister.operatorName}</strong>
          </div>
          <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-950">
            <span className="text-slate-500">Aberto desde</span>
            <strong className="mt-1 block">{formatDateTime(cashRegister.openedAt)}</strong>
          </div>
          <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-950">
            <span className="text-slate-500">Sangrias</span>
            <strong className="mt-1 block">{formatCurrency(summary?.withdrawalTotal ?? 0)}</strong>
          </div>
          <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-950">
            <span className="text-slate-500">Saidas operacionais</span>
            <strong className="mt-1 block">{formatCurrency(summary?.expenseTotal ?? 0)}</strong>
          </div>
        </div>
        {message ? <div className="mt-5 rounded-lg bg-slate-100 p-3 text-sm dark:bg-slate-950">{message}</div> : null}
      </section>

      {movementOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-8">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-2xl dark:bg-slate-950">
            <h2 className="text-xl font-black">{movementLabels[movement.type]}</h2>
            <div className="mt-5 grid gap-3">
              <input className="field" placeholder="Descricao" value={movement.description} onChange={(event) => setMovement({ ...movement, description: event.target.value })} />
              <input className="field h-12 text-lg font-bold" type="number" min={0} value={movement.amount} onChange={(event) => setMovement({ ...movement, amount: Number(event.target.value) })} />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setMovementOpen(false)}>
                Cancelar
              </Button>
              <Button disabled={!movement.description || movement.amount <= 0} onClick={addMovement}>
                Registrar
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {closingOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-8">
          <div className="w-full max-w-xl rounded-lg bg-white p-6 shadow-2xl dark:bg-slate-950">
            <h2 className="text-xl font-black">Fechamento do caixa</h2>
            <div className="mt-5 grid grid-cols-2 gap-4">
              <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-900">
                <div className="text-xs font-bold uppercase text-slate-500">Valor esperado</div>
                <div className="mt-1 text-2xl font-black">{formatCurrency(summary?.expectedAmount ?? 0)}</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-900">
                <div className="text-xs font-bold uppercase text-slate-500">Diferenca</div>
                <div className={`mt-1 text-2xl font-black ${difference === 0 ? "text-mint" : "text-amber-600"}`}>{formatCurrency(difference)}</div>
              </div>
            </div>
            <label className="mt-5 block text-sm font-semibold">
              Valor contado
              <input className="field mt-2 h-12 w-full text-lg font-bold" type="number" min={0} value={countedAmount} onChange={(event) => setCountedAmount(Number(event.target.value))} autoFocus />
            </label>
            <label className="mt-4 block text-sm font-semibold">
              Observacoes
              <textarea className="field mt-2 h-24 w-full py-2" value={closingNotes} onChange={(event) => setClosingNotes(event.target.value)} />
            </label>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setClosingOpen(false)}>
                Cancelar
              </Button>
              <Button variant="danger" onClick={close}>
                Confirmar fechamento
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
