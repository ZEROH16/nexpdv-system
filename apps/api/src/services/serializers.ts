import type { Product, Sale } from "@prisma/client";

export const money = (value: unknown) => Number(value ?? 0);

export const serializeProduct = (product: Product) => ({
  ...product,
  cost: money(product.cost),
  price: money(product.price),
  margin: money(product.margin),
  stock: money(product.stock),
  minStock: money(product.minStock)
});

export const serializeSale = (sale: Sale & { items?: any[]; payments?: any[] }) => ({
  ...sale,
  subtotal: money(sale.subtotal),
  discount: money(sale.discount),
  total: money(sale.total),
  profit: money(sale.profit),
  items: sale.items?.map((item) => ({
    ...item,
    quantity: money(item.quantity),
    unitPrice: money(item.unitPrice),
    discount: money(item.discount),
    total: money(item.total),
    cost: money(item.cost)
  })),
  payments: sale.payments?.map((payment) => ({
    ...payment,
    amount: money(payment.amount),
    change: money(payment.change)
  }))
});
