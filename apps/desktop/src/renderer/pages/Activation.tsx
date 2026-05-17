import { HelpCircle, MonitorDot } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/Button";
import { desktopApi } from "@/services/desktopApi";

export const Activation = ({ onActivated }: { onActivated: () => void }) => {
  const [form, setForm] = useState({ ownerEmail: "", licenseKey: "", companyName: "" });
  const [helpOpen, setHelpOpen] = useState(false);
  const [message, setMessage] = useState<string>();

  const activate = async () => {
    setMessage(undefined);
    try {
      await desktopApi.system.activate(form);
      onActivated();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel ativar o sistema.");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-cloud p-8 text-slate-900 dark:bg-slate-950 dark:text-white">
      <section className="w-full max-w-xl rounded-lg border border-slate-200 bg-white p-8 shadow-panel dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-ink text-white dark:bg-white dark:text-ink">
            <MonitorDot size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-black">NexPDV</h1>
            <p className="text-sm text-slate-500">Ativacao inicial do sistema</p>
          </div>
        </div>
        <div className="mt-8 grid gap-4">
          <label className="text-sm font-semibold">Email do dono<input className="field mt-1 w-full" value={form.ownerEmail} onChange={(event) => setForm({ ...form, ownerEmail: event.target.value })} /></label>
          <label className="text-sm font-semibold">Chave de ativacao<input className="field mt-1 w-full uppercase" value={form.licenseKey} onChange={(event) => setForm({ ...form, licenseKey: event.target.value })} /></label>
          <label className="text-sm font-semibold">Nome do estabelecimento<input className="field mt-1 w-full" value={form.companyName} onChange={(event) => setForm({ ...form, companyName: event.target.value })} /></label>
          <Button className="h-12" disabled={!form.ownerEmail || !form.licenseKey || !form.companyName} onClick={activate}>Ativar sistema</Button>
          <Button variant="secondary" onClick={() => setHelpOpen(true)}><HelpCircle size={16} />Preciso de ajuda</Button>
          {message ? <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{message}</div> : null}
        </div>
        <div className="mt-6 rounded-lg bg-slate-50 p-4 text-xs text-slate-500 dark:bg-slate-950">
          Chaves de teste: NEXPDV-OFFLINE-2026 ou NEXPDV-CLOUD-2026
        </div>
      </section>

      {helpOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-8">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl dark:bg-slate-950">
            <h2 className="text-xl font-black">Suporte NexPDV</h2>
            <p className="mt-2 text-sm text-slate-500">Informe seu email e chave de ativacao ao suporte para liberar o ambiente.</p>
            <div className="mt-5 rounded-lg bg-slate-50 p-4 text-sm dark:bg-slate-900">
              <div><strong>WhatsApp:</strong> (00) 00000-0000</div>
              <div><strong>Email:</strong> suporte@nexpdv.com.br</div>
            </div>
            <div className="mt-6 flex justify-end">
              <Button onClick={() => setHelpOpen(false)}>Entendi</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
