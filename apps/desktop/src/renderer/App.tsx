import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { Skeleton } from "@/components/Skeleton";
import { StatusBadge } from "@/components/StatusBadge";
import { UpdateModal } from "@/components/UpdateModal";
import { useAsync } from "@/hooks/useAsync";
import { usePdvStore } from "@/store/usePdvStore";
import { desktopApi } from "@/services/desktopApi";
import { Activation } from "@/pages/Activation";
import { CashRegisterPage } from "@/pages/CashRegisterPage";
import { Customers } from "@/pages/Customers";
import { Dashboard } from "@/pages/Dashboard";
import { Management } from "@/pages/Management";
import { Pos } from "@/pages/Pos";
import { Products } from "@/pages/Products";
import { Reports } from "@/pages/Reports";
import { SalesHistory } from "@/pages/SalesHistory";
import { Settings } from "@/pages/Settings";
import { Login } from "@/pages/Login";
import { OwnerOnboarding } from "@/pages/OwnerOnboarding";
import { useEffect } from "react";
import type { LicenseGuardState } from "@/services/desktopApi";

const pages: Record<string, JSX.Element> = {
  dashboard: <Dashboard />,
  pos: <Pos />,
  products: <Products />,
  customers: <Customers />,
  cash: <CashRegisterPage />,
  management: <Management />,
  sales: <SalesHistory />,
  reports: <Reports />,
  settings: <Settings />
};

const supportWhatsAppUrl = "https://wa.me/5516992928855";
const supportEmailUrl = "mailto:pedropericini@icloud.com?subject=Suporte%20NexPDV";

const LicenseBlocked = ({ state, onRetry }: { state: LicenseGuardState; onRetry: () => Promise<void> }) => (
  <div className="flex min-h-screen items-center justify-center bg-cloud p-8 text-slate-900 dark:bg-slate-950 dark:text-white">
    <section className="w-full max-w-xl rounded-lg border border-slate-200 bg-white p-8 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black">Licenca bloqueada ou invalida</h1>
          <p className="mt-3 text-sm text-slate-500">Licenca bloqueada ou invalida. Entre em contato com o suporte NexPDV.</p>
        </div>
        <StatusBadge tone="red">{state.status}</StatusBadge>
      </div>
      <div className="mt-5 rounded-lg bg-slate-50 p-4 text-sm dark:bg-slate-950">
        <div className="font-semibold">{state.message}</div>
        <div className="mt-2 text-xs text-slate-500">
          Ultima validacao online: {state.lastOnlineValidatedAt ? new Date(state.lastOnlineValidatedAt).toLocaleString("pt-BR") : "nao registrada"}
        </div>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button onClick={() => void onRetry()}>Tentar novamente</Button>
        <Button variant="secondary" onClick={() => void desktopApi.system.openExternal(supportWhatsAppUrl)}>Suporte</Button>
        <Button variant="ghost" onClick={() => void desktopApi.system.openExternal(supportEmailUrl)}>Enviar email</Button>
      </div>
    </section>
    <UpdateModal />
  </div>
);

export const App = () => {
  const page = usePdvStore((state) => state.page);
  const { data: systemState, loading, refresh } = useAsync(() => desktopApi.system.state(), []);
  const { data: authState, loading: authLoading, refresh: refreshAuth } = useAsync(() => desktopApi.auth.state(), []);

  useEffect(() => {
    const listener = () => refreshAuth();
    window.addEventListener("nexpdv:auth-changed", listener);
    return () => window.removeEventListener("nexpdv:auth-changed", listener);
  }, [refreshAuth]);

  useEffect(() => {
    const unsubscribe = desktopApi.license.onStatus(() => {
      void refresh();
    });
    return unsubscribe;
  }, [refresh]);

  useEffect(() => {
    if (!authState?.session || authState.session.locked || !authState.settings.autoLockEnabled) return undefined;
    let timer: number | undefined;
    const resetTimer = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void desktopApi.auth.lock().then(refreshAuth);
      }, authState.settings.autoLockMinutes * 60_000);
    };
    const events = ["mousemove", "keydown", "click", "touchstart"];
    events.forEach((event) => window.addEventListener(event, resetTimer));
    resetTimer();
    return () => {
      if (timer) window.clearTimeout(timer);
      events.forEach((event) => window.removeEventListener(event, resetTimer));
    };
  }, [authState?.session, authState?.settings.autoLockEnabled, authState?.settings.autoLockMinutes, refreshAuth]);

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-cloud p-8 dark:bg-slate-950">
        <Skeleton className="h-[calc(100vh-64px)]" />
      </div>
    );
  }

  const withUpdates = (content: JSX.Element) => (
    <>
      {content}
      <UpdateModal />
    </>
  );

  if (!systemState?.activated) {
    return withUpdates(<Activation onActivated={refresh} />);
  }

  if (!systemState.licenseGuard.allowed) {
    return <LicenseBlocked state={systemState.licenseGuard} onRetry={async () => { await desktopApi.license.validate(); await refresh(); }} />;
  }

  if (systemState.ownerOnboardingRequired) {
    return withUpdates(<OwnerOnboarding systemState={systemState} onCompleted={() => void Promise.all([refresh(), refreshAuth()])} />);
  }

  if (authState?.settings.requireLoginOnStart && !authState.session) {
    return withUpdates(<Login authState={authState} devUsersEnabled={systemState.devUsersEnabled} onAuthenticated={refreshAuth} />);
  }

  if (authState?.session?.locked) {
    return withUpdates(<Login authState={authState} locked devUsersEnabled={systemState.devUsersEnabled} onAuthenticated={refreshAuth} />);
  }

  return withUpdates(<Layout authState={authState} onAuthChanged={refreshAuth}>{pages[page] ?? <Dashboard />}</Layout>);
};
