import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { FirstAccessRequired, Session } from "@/services/api";
import { api } from "@/services/api";

export const Login = ({
  onLogin,
  onFirstAccess
}: {
  onLogin: (session: Session) => void;
  onFirstAccess: (state: FirstAccessRequired & { password: string }) => void;
}) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [needs2fa, setNeeds2fa] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [loading, setLoading] = useState(false);
  const twoFactorInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (needs2fa) twoFactorInputRef.current?.focus();
  }, [needs2fa]);

  const resetSecondFactor = () => {
    if (!needs2fa) return;
    setNeeds2fa(false);
    setTwoFactorCode("");
    setRecoveryCode("");
    setMessage(undefined);
  };

  const submit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (loading) return;
    if (needs2fa && !twoFactorCode.trim() && !recoveryCode.trim()) {
      setError("Digite o codigo 2FA.");
      twoFactorInputRef.current?.focus();
      return;
    }
    setLoading(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const result = await api.login(email, password, twoFactorCode || undefined, recoveryCode || undefined);
      if ("firstAccessRequired" in result) {
        onFirstAccess({ ...result, password });
        return;
      }
      onLogin(result);
    } catch (err) {
      const requiresTwoFactor = (err as Error & { payload?: { requiresTwoFactor?: boolean } }).payload?.requiresTwoFactor;
      if (requiresTwoFactor && !twoFactorCode.trim() && !recoveryCode.trim()) {
        setNeeds2fa(true);
        setMessage("Digite o codigo do autenticador.");
        return;
      }
      if (requiresTwoFactor) setNeeds2fa(true);
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
        <p className="mt-2 text-sm font-semibold text-slate-400">Controle SaaS, licenciamento e operacao centralizada.</p>
        <form className="mt-8 grid gap-3" onSubmit={submit}>
          <input className="field" value={email} onChange={(event) => { setEmail(event.target.value); resetSecondFactor(); }} placeholder="Email" autoComplete="username" />
          <input className="field" value={password} onChange={(event) => { setPassword(event.target.value); resetSecondFactor(); }} placeholder="Senha" type="password" autoComplete="current-password" />
          {needs2fa ? (
            <div className="grid gap-3 rounded-lg border border-cobalt/30 bg-cobalt/10 p-3">
              <input ref={twoFactorInputRef} className="field" value={twoFactorCode} onChange={(event) => setTwoFactorCode(event.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="Codigo 2FA" inputMode="numeric" autoComplete="one-time-code" />
              <input className="field" value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value)} placeholder="Codigo de recuperacao, se necessario" />
            </div>
          ) : null}
          <button className="h-11 rounded-lg bg-white text-sm font-black text-ink disabled:opacity-60" type="submit" disabled={loading}>
            {loading ? "Entrando..." : needs2fa ? "Validar 2FA" : "Entrar"}
          </button>
          <button className="text-left text-xs font-bold text-slate-400 hover:text-white" type="button" onClick={() => setError("Recuperacao preparada: solicite redefinicao ao super admin do NexPDV.")}>
            Esqueci minha senha
          </button>
          {message ? <div className="rounded-lg bg-cobalt/10 p-3 text-sm font-bold text-cyan-100 ring-1 ring-cobalt/30">{message}</div> : null}
          {error ? <div className="rounded-lg bg-red-500/10 p-3 text-sm font-bold text-red-200 ring-1 ring-red-500/20">{error}</div> : null}
        </form>
      </section>
    </div>
  );
};
