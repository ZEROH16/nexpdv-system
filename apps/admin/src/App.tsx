import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { Dashboard } from "@/pages/Dashboard";
import { Audit, Companies, Devices, Licenses, Logs, Plans, SyncMonitor, Users } from "@/pages/Tables";
import { Login } from "@/pages/Login";
import { api, type Session } from "@/services/api";

const protectedPages = ["dashboard", "companies", "users", "plans", "licenses", "devices", "sync", "audit", "logs"];
const pageByPath = (path: string) => {
  const page = path.replace(/^\//, "") || "dashboard";
  return protectedPages.includes(page) ? page : "dashboard";
};

const replacePath = (path: string) => {
  if (window.location.pathname !== path) window.history.replaceState(null, "", path);
};

export const App = () => {
  const [session, setSession] = useState<Session | undefined>(() => api.restore());
  const [page, setPageState] = useState(() => pageByPath(window.location.pathname));
  const [checking, setChecking] = useState(Boolean(session));

  useEffect(() => {
    if (!session) {
      replacePath("/login");
      setChecking(false);
      return;
    }

    api.me()
      .then((user) => {
        setSession({ ...session, user });
        if (window.location.pathname === "/login") replacePath(`/${page}`);
      })
      .catch(async () => {
        try {
          const refreshed = await api.refresh();
          setSession(refreshed);
          if (window.location.pathname === "/login") replacePath(`/${page}`);
        } catch {
          await api.logout();
          setSession(undefined);
          replacePath("/login");
        }
      })
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    const onPopState = () => setPageState(pageByPath(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const setPage = (nextPage: string) => {
    setPageState(nextPage);
    window.history.pushState(null, "", `/${nextPage}`);
  };

  if (checking) return <div className="flex min-h-screen items-center justify-center bg-[#080B12] text-sm font-black text-slate-300">Validando sessão segura...</div>;

  if (!session) {
    return (
      <Login
        onLogin={(nextSession) => {
          setSession(nextSession);
          setPageState("dashboard");
          replacePath("/dashboard");
        }}
      />
    );
  }

  const logout = async () => {
    await api.logout();
    setSession(undefined);
    replacePath("/login");
  };

  const needsTwoFactorSetup = session.requiresTwoFactorSetup || (session.user.platformRole === "super_admin" && !session.user.twoFactorEnabled);

  return (
    <Layout session={session} page={page} onPage={setPage} onLogout={logout}>
      {needsTwoFactorSetup ? (
        <TwoFactorSetup onDone={() => setSession({ ...session, requiresTwoFactorSetup: false, user: { ...session.user, twoFactorEnabled: true } })} />
      ) : (
        <>
          {page === "dashboard" ? <Dashboard /> : null}
          {page === "companies" ? <Companies /> : null}
          {page === "users" ? <Users /> : null}
          {page === "plans" ? <Plans /> : null}
          {page === "licenses" ? <Licenses /> : null}
          {page === "devices" ? <Devices /> : null}
          {page === "sync" ? <SyncMonitor /> : null}
          {page === "audit" ? <Audit /> : null}
          {page === "logs" ? <Logs /> : null}
        </>
      )}
    </Layout>
  );
};

const TwoFactorSetup = ({ onDone }: { onDone: () => void }) => {
  const [setup, setSetup] = useState<{ secret: string; qrCodeDataUrl: string }>();
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState<string[]>([]);
  const [message, setMessage] = useState("2FA obrigatório para super administradores SaaS.");
  const [loading, setLoading] = useState(false);

  const start = async () => {
    setLoading(true);
    setMessage("Gerando QR Code 2FA...");
    try {
      setSetup(await api.setup2fa());
      setMessage("Leia o QR Code no Google Authenticator, Authy ou Microsoft Authenticator.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível iniciar o 2FA.");
    } finally {
      setLoading(false);
    }
  };

  const enable = async () => {
    setLoading(true);
    setMessage("Validando código 2FA...");
    try {
      const result = await api.enable2fa(code);
      setRecovery(result.recoveryCodes);
      setMessage("2FA ativado. Guarde os códigos de recuperação antes de continuar.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Código 2FA inválido.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <section className="rounded-lg border border-amber-500/30 bg-[#0D1320] p-6 shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-amber-100">Configuração obrigatória de 2FA</h1>
            <p className="mt-1 text-sm font-semibold text-amber-100/80">{message}</p>
          </div>
          {!setup ? (
            <button className="h-10 rounded-lg bg-amber-200 px-4 text-sm font-black text-amber-950 disabled:opacity-60" onClick={start} disabled={loading}>
              {loading ? "Preparando..." : "Configurar 2FA"}
            </button>
          ) : null}
        </div>

        {setup ? (
          <div className="mt-6 grid gap-5 md:grid-cols-[240px_1fr]">
            <img className="rounded-lg bg-white p-3" src={setup.qrCodeDataUrl} alt="QR Code 2FA" />
            <div className="space-y-3">
              <div>
                <div className="text-xs font-black uppercase text-slate-400">Secret</div>
                <div className="mt-1 rounded-lg bg-white/5 p-3 font-mono text-xs text-amber-100">{setup.secret}</div>
              </div>
              <input className="field" value={code} onChange={(event) => setCode(event.target.value)} placeholder="Código 2FA de 6 dígitos" inputMode="numeric" maxLength={6} />
              {!recovery.length ? (
                <button className="h-10 rounded-lg bg-white px-4 text-sm font-black text-ink disabled:opacity-60" onClick={enable} disabled={loading || code.length < 6}>
                  {loading ? "Confirmando..." : "Confirmar 2FA"}
                </button>
              ) : (
                <button className="h-10 rounded-lg bg-white px-4 text-sm font-black text-ink" onClick={onDone}>
                  Continuar para o painel
                </button>
              )}
              {recovery.length ? (
                <div className="grid grid-cols-2 gap-2 text-xs font-bold text-amber-100">
                  {recovery.map((item) => <span key={item} className="rounded bg-black/20 p-2 font-mono">{item}</span>)}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
};
