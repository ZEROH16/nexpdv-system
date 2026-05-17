import { useState } from "react";
import { Layout } from "@/components/Layout";
import { Dashboard } from "@/pages/Dashboard";
import { Companies, Logs, Plans, SyncMonitor, Users } from "@/pages/Tables";
import { Login } from "@/pages/Login";
import { api, type Session } from "@/services/api";

export const App = () => {
  const [session, setSession] = useState<Session | undefined>(() => api.restore());
  const [page, setPage] = useState("dashboard");

  if (!session) return <Login onLogin={setSession} />;

  const logout = () => {
    api.logout();
    setSession(undefined);
  };

  return (
    <Layout session={session} page={page} onPage={setPage} onLogout={logout}>
      {page === "dashboard" ? <Dashboard /> : null}
      {page === "companies" ? <Companies /> : null}
      {page === "users" ? <Users /> : null}
      {page === "plans" ? <Plans /> : null}
      {page === "sync" ? <SyncMonitor /> : null}
      {page === "logs" ? <Logs /> : null}
    </Layout>
  );
};
