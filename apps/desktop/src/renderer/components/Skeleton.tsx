export const Skeleton = ({ className = "" }: { className?: string }) => (
  <div className={`animate-pulse rounded-lg bg-slate-200/80 dark:bg-slate-800 ${className}`} />
);
