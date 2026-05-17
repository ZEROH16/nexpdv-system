export const formatCurrency = (value: number): string =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(Number.isFinite(value) ? value : 0);

export const formatPercent = (value: number): string =>
  new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(value / 100);

export const formatDateTime = (isoDate: string): string =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(isoDate));

export const onlyDigits = (value: string): string => value.replace(/\D/g, "");

export const saleNumber = (date = new Date()): string => {
  const stamp = date.toISOString().replace(/\D/g, "").slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `NV-${stamp}-${suffix}`;
};
