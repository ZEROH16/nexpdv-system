import { ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { desktopApi, type SystemState } from "@/services/desktopApi";

interface OwnerOnboardingProps {
  systemState: SystemState;
  onCompleted: () => void;
}

export const OwnerOnboarding = ({ systemState, onCompleted }: OwnerOnboardingProps) => {
  const loginRef = useRef<HTMLInputElement>(null);
  const ownerEmail = systemState.ownerEmail ?? systemState.license?.ownerEmail ?? systemState.company.ownerEmail ?? "";
  const [form, setForm] = useState({
    name: "",
    email: ownerEmail,
    username: "",
    password: "",
    confirmPassword: "",
    pin: "",
    confirmPin: ""
  });
  const [message, setMessage] = useState<string>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setForm((current) => ({ ...current, email: current.email || ownerEmail }));
  }, [ownerEmail]);

  useEffect(() => {
    loginRef.current?.focus();
  }, []);

  const formError = useMemo(() => {
    if (!form.name.trim()) return "Informe o nome do dono.";
    if (!form.email.trim()) return "Informe o email do dono.";
    if (!form.username.trim()) return "Informe um login.";
    if (form.password.length < 8) return "A senha precisa ter pelo menos 8 caracteres.";
    if (form.password !== form.confirmPassword) return "A confirmacao de senha nao confere.";
    if (!/^\d{4,6}$/.test(form.pin)) return "PIN deve ser numerico com 4 a 6 digitos.";
    if (form.pin !== form.confirmPin) return "A confirmacao do PIN nao confere.";
    return undefined;
  }, [form]);

  const submit = async () => {
    if (formError) {
      setMessage(formError);
      return;
    }
    setLoading(true);
    setMessage(undefined);
    try {
      await desktopApi.system.createOwnerAccess(form);
      onCompleted();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel criar o acesso do dono.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-cloud p-8 text-slate-900 dark:bg-slate-950 dark:text-white">
      <section className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white p-8 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-ink text-white dark:bg-white dark:text-ink">
              <ShieldCheck size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-normal">Criar acesso do dono</h1>
              <p className="text-sm text-slate-500">Primeiro administrador local da empresa ativada.</p>
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-right text-xs text-slate-500 dark:bg-slate-950">
            <div className="font-bold text-slate-700 dark:text-slate-200">{systemState.license?.plan ?? "OFFLINE"}</div>
            <div>{systemState.company.tradeName ?? systemState.company.name ?? "NexPDV"}</div>
          </div>
        </div>

        <div className="mt-7 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-950 dark:bg-blue-950/40 dark:text-blue-100">
          <div className="flex gap-2 font-bold"><UserRound size={17} />Este usuario tera permissoes totais.</div>
          <p className="mt-1 text-blue-800/80 dark:text-blue-100/75">Depois desta etapa, o PDV libera o login operacional e o dono podera criar caixas, gerentes e administradores em Gestao.</p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <label className="text-sm font-semibold">
            Nome do dono
            <input className="field mt-1 w-full" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </label>
          <label className="text-sm font-semibold">
            Email do dono
            <input className="field mt-1 w-full" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          </label>
          <label className="col-span-2 text-sm font-semibold">
            Login
            <input ref={loginRef} className="field mt-1 w-full" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />
          </label>
          <label className="text-sm font-semibold">
            Senha
            <input className="field mt-1 w-full" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
          </label>
          <label className="text-sm font-semibold">
            Confirmar senha
            <input className="field mt-1 w-full" type="password" value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} />
          </label>
          <label className="text-sm font-semibold">
            PIN rapido
            <input className="field mt-1 w-full text-center text-lg font-black tracking-[0.2em]" inputMode="numeric" type="password" value={form.pin} onChange={(event) => setForm({ ...form, pin: event.target.value.replace(/\D/g, "").slice(0, 6) })} />
          </label>
          <label className="text-sm font-semibold">
            Confirmar PIN
            <input
              className="field mt-1 w-full text-center text-lg font-black tracking-[0.2em]"
              inputMode="numeric"
              type="password"
              value={form.confirmPin}
              onChange={(event) => setForm({ ...form, confirmPin: event.target.value.replace(/\D/g, "").slice(0, 6) })}
              onKeyDown={(event) => {
                if (event.key === "Enter") void submit();
              }}
            />
          </label>
        </div>

        {message ? <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{message}</div> : null}

        <div className="mt-6 flex justify-end">
          <Button className="h-12 px-6" disabled={loading} onClick={() => void submit()}>
            {loading ? "Criando acesso..." : "Criar acesso e ir para login"}
          </Button>
        </div>
      </section>
    </main>
  );
};
