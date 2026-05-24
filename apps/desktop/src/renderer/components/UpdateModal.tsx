import { DownloadCloud, RefreshCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { desktopApi, type UpdateState } from "@/services/desktopApi";
import { Button } from "./Button";

const shouldShow = (state?: UpdateState): boolean =>
  Boolean(state?.enabled && ["checking", "available", "downloading", "downloaded", "installing", "error"].includes(state.status));

export const UpdateModal = () => {
  const [state, setState] = useState<UpdateState>();

  useEffect(() => {
    let mounted = true;
    void desktopApi.updates.status().then((value) => {
      if (mounted) setState(value);
    });
    const unsubscribe = desktopApi.updates.onStatus((value) => setState(value as UpdateState));
    void desktopApi.updates.check().catch(() => undefined);
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  if (!shouldShow(state)) return null;

  const progress = Math.max(0, Math.min(100, state?.progress ?? 0));
  const title =
    state?.status === "checking"
      ? "Verificando atualizacao"
      : state?.status === "downloading"
        ? "Baixando atualizacao"
        : state?.status === "downloaded"
          ? "Atualizacao pronta"
          : state?.status === "installing"
            ? "Instalando atualizacao"
          : state?.status === "error"
            ? "Falha na atualizacao"
            : "Atualizacao disponivel";

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-6">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-ink text-white dark:bg-white dark:text-ink">
            {state?.status === "checking" ? <RefreshCcw className="animate-spin" size={21} /> : <DownloadCloud size={21} />}
          </div>
          <div>
            <h2 className="text-lg font-black">{title}</h2>
            <p className="text-sm text-slate-500">Canal {state?.channel ?? "stable"} - versao atual {state?.currentVersion}</p>
          </div>
        </div>

        <div className="mt-5 rounded-lg bg-slate-50 p-4 text-sm dark:bg-slate-950">
          <div className="font-semibold">{state?.message}</div>
          {state?.version ? <div className="mt-1 text-slate-500">Versao disponivel: {state.version}</div> : null}
          {state?.status === "downloading" || state?.status === "downloaded" ? (
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div className="h-full rounded-full bg-cobalt transition-all" style={{ width: `${state.status === "downloaded" ? 100 : progress}%` }} />
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          {state?.status === "downloaded" ? (
            <Button onClick={() => void desktopApi.updates.install()}>Atualizar agora</Button>
          ) : null}
          {state?.status !== "checking" && state?.status !== "downloading" && state?.status !== "downloaded" && state?.status !== "installing" ? (
            <Button variant="secondary" onClick={() => void desktopApi.updates.remindLater().then(setState)}>
              Lembrar depois
            </Button>
          ) : null}
        </div>
      </section>
    </div>
  );
};
