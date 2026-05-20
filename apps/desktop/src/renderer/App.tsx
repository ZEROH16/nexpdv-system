import { Layout } from "@/components/Layout";
import { Skeleton } from "@/components/Skeleton";
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
