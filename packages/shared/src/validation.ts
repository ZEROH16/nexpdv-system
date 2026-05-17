import type { Payment, Product, SaleItem } from "./entities.js";

export class DomainError extends Error {
  constructor(message: string, public code = "DOMAIN_ERROR") {
    super(message);
  }
}

export const assertPositiveMoney = (value: number, field: string): void => {
  if (!Number.isFinite(value) || value < 0) {
    throw new DomainError(`${field} deve ser um valor positivo.`, "INVALID_MONEY");
  }
};

export const calculateMargin = (cost: number, price: number): number => {
  if (price <= 0) return 0;
  return Number((((price - cost) / price) * 100).toFixed(2));
};

export const ensureProductCanSell = (product: Product, quantity: number): void => {
  if (!product.active) {
    throw new DomainError("Produto inativo.", "PRODUCT_INACTIVE");
  }
  if (quantity <= 0) {
    throw new DomainError("Quantidade invalida.", "INVALID_QUANTITY");
  }
  if (product.stock < quantity) {
    throw new DomainError("Estoque insuficiente para concluir a venda.", "INSUFFICIENT_STOCK");
  }
};

export const calculateSaleTotals = (
  items: SaleItem[],
  payments: Payment[],
  discount = 0
): { subtotal: number; total: number; paid: number; change: number; profit: number } => {
  const subtotal = roundMoney(items.reduce((sum, item) => sum + item.total, 0));
  const total = roundMoney(Math.max(subtotal - discount, 0));
  const paid = roundMoney(payments.reduce((sum, payment) => sum + payment.amount, 0));
  const change = roundMoney(Math.max(paid - total, 0));
  const cost = roundMoney(items.reduce((sum, item) => sum + item.cost * item.quantity, 0));
  const profit = roundMoney(total - cost);
  return { subtotal, total, paid, change, profit };
};

export const roundMoney = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
