import type { PixProviderCode } from "@nexpdv/shared";
import { MockPixProvider } from "./mockPixProvider";
import { PagBankPixProvider } from "./pagBankPixProvider";
import type { PixProviderClient, PixProviderContext } from "./types";

export const normalizePixProvider = (provider?: string): PixProviderCode => {
  const normalized = provider?.trim().toLowerCase();
  return normalized === "pagbank" ? "pagbank" : "mock";
};

export const createPixProvider = (context: PixProviderContext): PixProviderClient => {
  const provider = normalizePixProvider(context.config.provider);
  if (provider === "pagbank") return new PagBankPixProvider(context);
  return new MockPixProvider(context);
};

