import { LockKeyhole, MonitorDot, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { desktopApi, type AuthState } from "@/services/desktopApi";

interface LoginProps {
  authState?: AuthState;
  locked?: boolean;
  devUsersEnabled?: boolean;
  onAuthenticated: () => void;
}

export const Login = ({ authState, locked = false, devUsersEnabled = false, onAuthenticated }: LoginProps) => {
  const [login, setLogin] = useState(authState?.lastOperatorLogin ?? authState?.user?.username ?? "");
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"pin" | "password">("pin");
  const [rememberOperator, setRememberOperator] = useState(authState?.settings.rememberLastOperator ?? true);
  const [message, setMessage] = useState<string>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLogin(authState?.lastOperatorLogin ?? authState?.user?.username ?? "");
    setRememberOperator(authState?.settings.rememberLastOperator ?? true);
  }, [authState]);

  const submit = async () => {
    setLoading(true);
    setMessage(undefined);
    try {
      if (locked) {
        await desktopApi.auth.unlock({ login, pin: mode === "pin" ? pin : undefined, password: mode === "password" ? password : undefined });
      } else {
        await desktopApi.auth.login({ login, pin: mode === "pin" ? pin : undefined, password: mode === "password" ? password : undefined, rememberOperator });
      }
      setPin("");
      setPassword("");
      onAuthenticated();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel autenticar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-cloud p-8 text-slate-900 dark:bg-slate-950 dark:text-white">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-7 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-ink text-white dark:bg-white dark:text-ink">
            <MonitorDot size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-normal">NexPDV</h1>
            <p className="text-sm text-slate-500">{locked ? "PDV bloqueado" : "Acesso operacional"}</p>
          </div>
        </div>

        <div className="mt-7 rounded-lg bg-slate-50 p-4 dark:bg-slate-950">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-300">
            {locked ? <LockKeyhole size={17} /> : <UserRound size={17} />}
            {locked ? `Sessao de ${authState?.user?.name ?? "operador"}` : "Entre com operador, gerente ou administrador"}
          </div>
        </div>

        <div className="mt-5 grid gap-3">
          {!locked ? (
            <label className="text-sm font-semibold">
              Login do operador
              <input className="field mt-1 w-full" value={login} onChange={(event) => setLogin(event.target.value)} autoFocus />
            </label>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <button className={`h-10 rounded-lg text-sm font-bold ${mode === "pin" ? "bg-ink text-white dark:bg-white dark:text-ink" : "bg-slate-100 dark:bg-slate-950"}`} onClick={() => setMode("pin")}>
              PIN rapido
            </button>
            <button className={`h-10 rounded-lg text-sm font-bold ${mode === "password" ? "bg-ink text-white dark:bg-white dark:text-ink" : "bg-slate-100 dark:bg-slate-950"}`} onClick={() => setMode("password")}>
              Senha
            </button>
          </div>

          {mode === "pin" ? (
            <label className="text-sm font-semibold">
              PIN numerico
              <input
                className="field mt-1 h-14 w-full text-center text-2xl font-black tracking-[0.25em]"
                inputMode="numeric"
                type="password"
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 8))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void submit();
                }}
                autoFocus={locked}
              />
            </label>
          ) : (
            <label className="text-sm font-semibold">
              Senha
              <input
                className="field mt-1 h-12 w-full"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void submit();
                }}
                autoFocus={locked}
              />
            </label>
          )}

          {!locked ? (
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={rememberOperator} onChange={(event) => setRememberOperator(event.target.checked)} />
              Lembrar ultimo operador
            </label>
          ) : null}
        </div>

        {message ? <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{message}</div> : null}

        <Button className="mt-6 h-12 w-full" disabled={loading || (mode === "pin" ? !pin : !password) || (!locked && !login.trim())} onClick={() => void submit()}>
          {locked ? "Desbloquear PDV" : "Entrar"}
        </Button>

        {!locked && devUsersEnabled ? (
          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-950">
            Desenvolvimento: operador PIN 0000, gerente PIN 1234, admin PIN 9999. Senha gerente/admin: 123456.
          </div>
        ) : null}
      </section>
    </main>
  );
};
