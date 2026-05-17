import type { ReactNode } from "react";

export const Metric = ({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) => (
  <section className="panel p-5">
    <div className="flex items-center justify-between">
      <span className="text-sm font-semibold text-slate-500">{label}</span>
      <span className="text-cobalt">{icon}</span>
    </div>
    <strong className="mt-3 block text-3xl font-black text-ink">{value}</strong>
  </section>
);
