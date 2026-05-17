import type { ReactNode } from "react";

export const StatCard = ({
  label,
  value,
  tone = "default",
  icon
}: {
  label: string;
  value: string;
  tone?: "default" | "good" | "warn";
  icon?: ReactNode;
}) => {
  const toneClass = tone === "good" ? "text-mint" : tone === "warn" ? "text-amber-500" : "text-cobalt";
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</span>
        <span className={toneClass}>{icon}</span>
      </div>
      <strong className="mt-3 block text-2xl font-bold tracking-normal text-slate-950 dark:text-white">{value}</strong>
    </section>
  );
};
