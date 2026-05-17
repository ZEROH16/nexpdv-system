import type { ReactNode } from "react";

export const EmptyState = ({ title, children }: { title: string; children?: ReactNode }) => (
  <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white/70 p-8 text-center dark:border-slate-700 dark:bg-slate-900/70">
    <strong className="text-sm text-slate-900 dark:text-white">{title}</strong>
    {children ? <p className="mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">{children}</p> : null}
  </div>
);
