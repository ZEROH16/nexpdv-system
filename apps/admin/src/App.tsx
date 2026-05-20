import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { Dashboard } from "@/pages/Dashboard";
import { Audit, Companies, Devices, Licenses, Logs, Plans, SyncMonitor, Users } from "@/pages/Tables";
import { Login } from "@/pages/Login";
import { api, type FirstAccessRequired, type FirstAccessSetup as FirstAccessSetupData, type Session } from "@/services/api";

const protectedPages = ["dashboard", "companies", "users", "plans", "licenses", "devices", "sync", "audit", "logs"];
const pageByPath = (path: string) => {
  const page = path.replace(/^\//, "") || "dashboard";
  return protectedPages.includes(page) ? page : "dashboard";
};

const replacePath = (path: string) => {
  if (window.location.pathname !== path) window.history.replaceState(null, "", path);
};

type FirstAccessState = FirstAccessRequired & { password: string };

export const App = () => {
  const [session, setSession] = useState<Session | undefined>(() => api.restore());
  const [firstAccess, setFirstAccess] = useState<FirstAccessState>();
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

  if (checking) return <div className="flex min-h-screen items-center justify-center bg-[#080B12] text-sm font-black text-slate-300">Validando sessao segura...</div>;

  if (!session && firstAccess) {
    return (
      <FirstAccessSetup
        state={firstAccess}
        onBack={() => {
          setFirstAccess(undefined);
          replacePath("/login");
        }}
        onDone={(nextSession) => {
          setFirstAccess(undefined);
          setSession(nextSession);
          setPageState("dashboard");
          replacePath("/dashboard");
        }}
      />
    );
  }

  if (!session) {
    return (
      <Login
        onFirstAccess={(state) => {
          setFirstAccess(state);
          replacePath("/first-access");
        }}
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
    setFirstAccess(undefined);
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

const FirstAccessSetup = ({ state, onDone, onBack }: { state: FirstAccessState; onDone: (session: Session) => void; onBack: () => void }) => {
  const [initialToken, setInitialToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [setup, setSetup] = useState<FirstAccessSetupData>();
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState<string[]>([]);
  const [completedSession, setCompletedSession] = useState<Session>();
  const [message, setMessage] = useState(state.message);
  const [loading, setLoading] = useState(false);

  const validatePassword = () => {
    if (newPassword.length < 8) {
      setMessage("A nova senha precisa ter pelo menos 8 caracteres.");
      return false;
    }
    if (newPassword !== confirmPassword) {
      setMessage("A confirmacao da senha nao confere.");
      return false;
    }
    return true;
  };

  const start = async () => {
    if (!validatePassword()) return;
    setLoading(true);
    setMessage("Validando token inicial e gerando QR Code 2FA...");
    try {
      const result = await api.firstAccessStart({ email: state.email, password: state.password, initialToken });
      setSetup(result);
      setMessage("Leia o QR Code no app autenticador e informe o codigo de 6 digitos.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel iniciar o primeiro acesso.");
    } finally {
      setLoading(false);
    }
  };

  const complete = async () => {
    if (!setup || !validatePassword()) return;
    setLoading(true);
    setMessage("Validando 2FA e concluindo primeiro acesso...");
    try {
      const result = await api.firstAccessComplete({ firstAccessSessionToken: setup.firstAccessSessionToken, newPassword, twoFactorCode: code });
      setCompletedSession(result);
      setRecovery(result.recoveryCodes);
      setMessage("Primeiro acesso concluido. Guarde os codigos de recuperacao antes de entrar no painel.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel concluir o primeiro acesso.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#080B12] p-6 text-white">
      <section className="w-full max-w-4xl rounded-lg border border-white/10 bg-[#0D1320] p-8 shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white text-xl font-black text-ink">N</div>
            <h1 className="mt-6 text-3xl font-black">Primeiro acesso Admin</h1>
            <p className="mt-2 max-w-xl text-sm font-semibold text-slate-400">
              {state.name}, informe o token gerado no terminal, defina sua senha definitiva e configure 2FA obrigatorio.
            </p>
          </div>
          <button className="rounded-lg border border-white/10 px-4 py-2 text-xs font-black text-slate-300 hover:text-white" type="button" onClick={onBack}>
            Voltar ao login
          </button>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_280px]">
          <div className="grid gap-3">
            <label className="text-xs font-black uppercase text-slate-500">Email</label>
            <input className="field opacity-70" value={state.email} readOnly />
            <label className="text-xs font-black uppercase text-slate-500">Token inicial</label>
            <input className="field font-mono" value={initialToken} onChange={(event) => setInitialToken(event.target.value.trim())} placeholder="Cole o token exibido no terminal" disabled={Boolean(setup)} />
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-xs font-black uppercase text-slate-500">Nova senha</label>
                <input className="field mt-2" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type="password" autoComplete="new-password" disabled={Boolean(setup)} />
              </div>
              <div>
                <label className="text-xs font-black uppercase text-slate-500">Confirmar senha</label>
                <input className="field mt-2" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" autoComplete="new-password" disabled={Boolean(setup)} />
              </div>
            </div>

            {!setup ? (
              <button className="mt-2 h-11 rounded-lg bg-white text-sm font-black text-ink disabled:opacity-60" onClick={start} disabled={loading || !initialToken}>
                {loading ? "Preparando..." : "Validar token e configurar 2FA"}
              </button>
            ) : null}

            {setup ? (
              <div className="grid gap-3 rounded-lg border border-cobalt/30 bg-cobalt/10 p-4">
                <label className="text-xs font-black uppercase text-slate-300">Codigo do autenticador</label>
                <input className="field" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" inputMode="numeric" maxLength={6} />
                {!recovery.length ? (
                  <button className="h-10 rounded-lg bg-white px-4 text-sm font-black text-ink disabled:opacity-60" onClick={complete} disabled={loading || code.length < 6}>
                    {loading ? "Concluindo..." : "Concluir primeiro acesso"}
                  </button>
                ) : (
                  <button className="h-10 rounded-lg bg-white px-4 text-sm font-black text-ink" onClick={() => completedSession && onDone(completedSession)}>
                    Entrar no painel
                  </button>
                )}
              </div>
            ) : null}

            <div className="rounded-lg bg-white/5 p-3 text-sm font-bold text-slate-300 ring-1 ring-white/10">{message}</div>
          </div>

          <div className="rounded-lg border border-white/10 bg-black/20 p-4">
            {setup ? (
              <div className="grid gap-3">
                <img className="mx-auto rounded-lg bg-white p-3" src={setup.qrCodeDataUrl} alt="QR Code 2FA" />
                <div>
                  <div className="text-xs font-black uppercase text-slate-500">Secret manual</div>
                  <div className="mt-1 break-all rounded-lg bg-white/5 p-3 font-mono text-xs text-cyan-100">{setup.secret}</div>
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-56 items-center justify-center rounded-lg border border-dashed border-white/10 text-center text-sm font-bold text-slate-500">
                O QR Code 2FA aparece aqui apos validar o token inicial.
              </div>
            )}
          </div>
        </div>

        {recovery.length ? (
          <div className="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
            <div className="text-sm font-black text-amber-100">Codigos de recuperacao</div>
            <p className="mt-1 text-xs font-bold text-amber-100/80">Guarde estes codigos em local seguro. Eles nao serao exibidos novamente.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 md:grid-cols-4">
              {recovery.map((item) => (
                <span key={item} className="rounded bg-black/20 p-2 text-center font-mono text-xs font-bold text-amber-100">
                  {item}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
};

const TwoFactorSetup = ({ onDone }: { onDone: () => void }) => {
  const [setup, setSetup] = useState<{ secret: string; qrCodeDataUrl: string }>();
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState<string[]>([]);
  const [message, setMessage] = useState("2FA obrigatorio para administradores SaaS.");
  const [loading, setLoading] = useState(false);

  const start = async () => {
    setLoading(true);
    setMessage("Gerando QR Code 2FA...");
    try {
      setSetup(await api.setup2fa());
      setMessage("Leia o QR Code no Google Authenticator, Authy ou Microsoft Authenticator.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel iniciar o 2FA.");
    } finally {
      setLoading(false);
    }
  };

  const enable = async () => {
    setLoading(true);
    setMessage("Validando codigo 2FA...");
    try {
      const result = await api.enable2fa(code);
      setRecovery(result.recoveryCodes);
      setMessage("2FA ativado. Guarde os codigos de recuperacao antes de continuar.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Codigo 2FA invalido.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <section className="rounded-lg border border-amber-500/30 bg-[#0D1320] p-6 shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-amber-100">Configuracao obrigatoria de 2FA</h1>
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
              <input className="field" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Codigo 2FA de 6 digitos" inputMode="numeric" maxLength={6} />
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
                  {recovery.map((item) => (
                    <span key={item} className="rounded bg-black/20 p-2 font-mono">
                      {item}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
};
