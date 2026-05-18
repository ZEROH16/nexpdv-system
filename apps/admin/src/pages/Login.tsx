import { useState } from "react";
import type { Session } from "@/services/api";
import { api } from "@/services/api";

export const Login = ({ onLogin }: { onLogin: (session: Session) => void }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [needs2fa, setNeeds2fa] = useState(false);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    setError(undefined);
    try {
      onLogin(await api.login(email, password, twoFactorCode || undefined, recoveryCode || undefined));
    } catch (err) {
      if ((err as Error & { payload?: { requiresTwoFactor?: boolean } }).payload?.requiresTwoFactor) setNeeds2fa(true);
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
        <p className="mt-2 text-sm font-semibold text-slate-400">Controle SaaS, licenciamento e operação centralizada.</p>
        <div className="mt-8 grid gap-3">
          <input className="field" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" autoComplete="username" />
          <input className="field" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Senha" type="password" autoComplete="current-password" />
          {needs2fa ? (
            <div className="grid gap-3 rounded-lg border border-cobalt/30 bg-cobalt/10 p-3">
              <input className="field" value={twoFactorCode} onChange={(event) => setTwoFactorCode(event.target.value)} placeholder="Código 2FA" inputMode="numeric" />
              <input className="field" value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value)} placeholder="Código de recuperação, se necessário" />
            </div>
          ) : null}
          <button className="h-11 rounded-lg bg-white text-sm font-black text-ink disabled:opacity-60" onClick={submit} disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </button>
          <button className="text-left text-xs font-bold text-slate-400 hover:text-white" type="button" onClick={() => setError("Recuperação preparada: solicite redefinição ao super admin do NexPDV.")}>
            Esqueci minha senha
          </button>
          {error ? <div className="rounded-lg bg-red-500/10 p-3 text-sm font-bold text-red-200 ring-1 ring-red-500/20">{error}</div> : null}
        </div>
      </section>
    </div>
  );
};
