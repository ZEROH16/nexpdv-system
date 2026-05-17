import { create } from "zustand";
import type { Customer, PaymentMethod, Product } from "@nexpdv/shared";
import { roundMoney } from "@nexpdv/shared";

const readBooleanPreference = (key: string, fallback: boolean): boolean => {
  if (typeof window === "undefined") return fallback;
  return window.localStorage.getItem(key) === null ? fallback : window.localStorage.getItem(key) === "true";
};

const writeBooleanPreference = (key: string, value: boolean): void => {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(key, String(value));
  }
};

export interface CartLine {
  id: string;
  product?: Product;
  description: string;
  unitPrice: number;
  cost: number;
  custom?: boolean;
  category?: string;
  notes?: string;
  quantity: number;
  discount: number;
}

interface PdvState {
  page: string;
  cart: CartLine[];
  customer?: Customer;
  saleDiscount: number;
  focusMode: boolean;
  sidebarPinned: boolean;
  notes: string;
  payments: Array<{ method: PaymentMethod; amount: number }>;
  setPage: (page: string) => void;
  setFocusMode: (value: boolean) => void;
  setSidebarPinned: (value: boolean) => void;
  addProduct: (product: Product) => void;
  addCustomItem: (item: { description?: string; unitPrice: number; quantity: number; category?: string; notes?: string }) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  updateItemDiscount: (productId: string, discount: number) => void;
  removeProduct: (productId: string) => void;
  setCustomer: (customer?: Customer) => void;
  setSaleDiscount: (value: number) => void;
  setNotes: (value: string) => void;
  setPayment: (method: PaymentMethod, amount: number) => void;
  clearSale: () => void;
}

export const usePdvStore = create<PdvState>((set) => ({
  page: "dashboard",
  cart: [],
  saleDiscount: 0,
  focusMode: false,
  sidebarPinned: readBooleanPreference("nexpdv.sidebarPinned", false),
  notes: "",
  payments: [{ method: "cash", amount: 0 }],
  setPage: (page) => set({ page }),
  setFocusMode: (focusMode) => set({ focusMode }),
  setSidebarPinned: (sidebarPinned) => {
    writeBooleanPreference("nexpdv.sidebarPinned", sidebarPinned);
    set({ sidebarPinned });
  },
  addProduct: (product) =>
    set((state) => {
      const found = state.cart.find((line) => line.id === product.id);
      if (found) {
        return {
          cart: state.cart.map((line) =>
            line.id === product.id ? { ...line, quantity: Math.min(line.quantity + 1, product.stock) } : line
          )
        };
      }
      return { cart: [{ id: product.id, product, description: product.name, unitPrice: product.price, cost: product.cost, quantity: 1, discount: 0 }, ...state.cart] };
    }),
  addCustomItem: (item) =>
    set((state) => ({
      cart: [
        {
          id: `misc_${Date.now()}`,
          description: item.description?.trim() || "Produto diverso",
          unitPrice: roundMoney(item.unitPrice),
          cost: 0,
          quantity: Math.max(1, item.quantity),
          discount: 0,
          custom: true,
          category: item.category,
          notes: item.notes
        },
        ...state.cart
      ]
    })),
  updateQuantity: (productId, quantity) =>
    set((state) => ({
      cart: state.cart.map((line) =>
        line.id === productId ? { ...line, quantity: Math.max(1, line.product ? Math.min(quantity, line.product.stock) : quantity) } : line
      )
    })),
  updateItemDiscount: (productId, discount) =>
    set((state) => ({
      cart: state.cart.map((line) => (line.id === productId ? { ...line, discount: Math.max(0, discount) } : line))
    })),
  removeProduct: (productId) => set((state) => ({ cart: state.cart.filter((line) => line.id !== productId) })),
  setCustomer: (customer) => set({ customer }),
  setSaleDiscount: (saleDiscount) => set({ saleDiscount: Math.max(0, saleDiscount) }),
  setNotes: (notes) => set({ notes }),
  setPayment: (method, amount) =>
    set((state) => ({
      payments: state.payments.some((payment) => payment.method === method)
        ? state.payments.map((payment) => (payment.method === method ? { ...payment, amount: roundMoney(amount) } : payment))
        : [...state.payments, { method, amount: roundMoney(amount) }]
    })),
  clearSale: () => set({ cart: [], customer: undefined, saleDiscount: 0, notes: "", payments: [{ method: "cash", amount: 0 }] })
}));

export const getCartTotals = (cart: CartLine[], saleDiscount: number, payments: Array<{ amount: number }>) => {
  const subtotal = roundMoney(cart.reduce((sum, line) => sum + line.unitPrice * line.quantity - line.discount, 0));
  const total = roundMoney(Math.max(subtotal - saleDiscount, 0));
  const paid = roundMoney(payments.reduce((sum, payment) => sum + payment.amount, 0));
  return {
    subtotal,
    total,
    paid,
    change: roundMoney(Math.max(paid - total, 0)),
    remaining: roundMoney(Math.max(total - paid, 0))
  };
};
