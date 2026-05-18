import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { Dashboard } from "@/pages/Dashboard";
import { Audit, Companies, Devices, Licenses, Logs, Plans, SyncMonitor, Users } from "@/pages/Tables";
import { Login } from "@/pages/Login";
import { api, type Session } from "@/services/api";

export const App = () => {
  const [session, setSession] = useState<Session | undefined>(() => api.restore());
  const [page, setPage] = useState("dashboard");
  const [checking, setChecking] = useState(Boolean(session));

  useEffect(() => {
    if (!session) return;
    api.me()
      .then((user) => setSession({ ...session, user }))
      .catch(async () => {
        try {
          const refreshed = await api.refresh();
          setSession(refreshed);
        } catch {
          await api.logout();
          setSession(undefined);
        }
      })
      .finally(() => setChecking(false));
  }, []);

  if (checking) return <div className="flex min-h-screen items-center justify-center bg-[#080B12] text-sm font-black text-slate-300">Validando sessão segura...</div>;

  if (!session) return <Login onLogin={setSession} />;

  const logout = async () => {
    await api.logout();
    setSession(undefined);
  };

  return (
    <Layout session={session} page={page} onPage={setPage} onLogout={logout}>
      {session.requiresTwoFactorSetup || !session.user.twoFactorEnabled ? <TwoFactorSetup onDone={() => setSession({ ...session, requiresTwoFactorSetup: false, user: { ...session.user, twoFactorEnabled: true } })} /> : null}
      {page === "dashboard" ? <Dashboard /> : null}
      {page === "companies" ? <Companies /> : null}
      {page === "users" ? <Users /> : null}
      {page === "plans" ? <Plans /> : null}
      {page === "licenses" ? <Licenses /> : null}
      {page === "devices" ? <Devices /> : null}
      {page === "sync" ? <SyncMonitor /> : null}
      {page === "audit" ? <Audit /> : null}
      {page === "logs" ? <Logs /> : null}
    </Layout>
  );
};

const TwoFactorSetup = ({ onDone }: { onDone: () => void }) => {
  const [setup, setSetup] = useState<{ secret: string; qrCodeDataUrl: string }>();
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState<string[]>([]);
  const [message, setMessage] = useState("2FA obrigatório para administradores SaaS.");

  const start = async () => {
    setSetup(await api.setup2fa());
    setMessage("Leia o QR Code no Google Authenticator, Authy ou Microsoft Authenticator.");
  };
  const enable = async () => {
    try {
      const result = await api.enable2fa(code);
      setRecovery(result.recoveryCodes);
      setMessage("2FA ativado. Guarde os códigos de recuperação em local seguro.");
      onDone();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Código inválido.");
    }
  };

  return (
    <section className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-black text-amber-100">Segurança 2FA</h2>
          <p className="mt-1 text-sm font-semibold text-amber-100/80">{message}</p>
        </div>
        {!setup ? <button className="h-10 rounded-lg bg-amber-200 px-4 text-sm font-black text-amber-950" onClick={start}>Configurar 2FA</button> : null}
      </div>
      {setup ? (
        <div className="mt-4 grid gap-4 md:grid-cols-[240px_1fr]">
          <img className="rounded-lg bg-white p-3" src={setup.qrCodeDataUrl} alt="QR Code 2FA" />
          <div className="space-y-3">
            <div className="font-mono text-xs text-amber-100">{setup.secret}</div>
            <input className="field" value={code} onChange={(event) => setCode(event.target.value)} placeholder="Código 2FA" inputMode="numeric" />
            <button className="h-10 rounded-lg bg-white px-4 text-sm font-black text-ink" onClick={enable}>Ativar 2FA</button>
            {recovery.length ? <div className="grid grid-cols-2 gap-2 text-xs font-bold text-amber-100">{recovery.map((item) => <span key={item} className="rounded bg-black/20 p-2 font-mono">{item}</span>)}</div> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
};
