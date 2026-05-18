import { useState } from "react";
import type { Session } from "@/services/api";
import { api } from "@/services/api";

export const Login = ({ onLogin }: { onLogin: (session: Session) => void }) => {
  const [email, setEmail] = useState("admin@nexpdv.com.br");
  const [password, setPassword] = useState("123456");
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    setError(undefined);
    try {
      onLogin(await api.login(email, password));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel entrar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#080B12] p-6 text-white">
      <section className="w-full max-w-md rounded-lg border border-white/10 bg-[#0D1320] p-8 shadow-panel">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white text-xl font-black text-ink">N</div>
        <h1 className="mt-6 text-3xl font-black">NexPDV Admin</h1>
        <p className="mt-2 text-sm font-semibold text-slate-400">Controle SaaS, operacao e sincronizacao.</p>
        <div className="mt-8 grid gap-3">
          <input className="field" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" />
          <input className="field" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Senha" type="password" />
          <button className="h-11 rounded-lg bg-white text-sm font-black text-ink disabled:opacity-60" onClick={submit} disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </button>
          {error ? <div className="rounded-lg bg-red-50 p-3 text-sm font-bold text-red-700">{error}</div> : null}
        </div>
      </section>
    </div>
  );
};
