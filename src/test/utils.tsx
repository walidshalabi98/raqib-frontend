import type { ReactElement, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import "@/i18n";

/** A query client for one test: no retries, no caching between tests. */
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
}

/** Renders `ui` inside a fresh QueryClientProvider. */
export function renderWithClient(ui: ReactElement, client = createTestQueryClient()) {
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, ...render(ui, { wrapper }) };
}
