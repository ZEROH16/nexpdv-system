import { useEffect, useState } from "react";
import { desktopApi, type SyncState } from "@/services/desktopApi";

export const useSyncStatus = () => {
  const [state, setState] = useState<SyncState>({ online: navigator.onLine, running: false, pending: 0 });

  useEffect(() => {
    desktopApi.sync.status().then(setState).catch(() => undefined);
    const unsubscribe = desktopApi.sync.onStatus((payload) => setState(payload as SyncState));
    const updateOnline = () => setState((current) => ({ ...current, online: navigator.onLine }));
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      unsubscribe();
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  return state;
};
