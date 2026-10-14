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

/**
 * An accessible-name matcher for a label whose interpolated name sits in its own <bdi> (labelWithName in
 * KpiResultSuggestions). jsdom reports no `display` for inline elements, so dom-accessibility-api pads them with spaces
 * ("Alternatives to “ X ”"); browsers do not. The padding next to the quotes is dropped before comparing.
 */
export function nameWithIsolatedPart(expected: string): (accessibleName: string) => boolean {
  return (accessibleName) => accessibleName.replace(/([“«])\s+/g, "$1").replace(/\s+([”»])/g, "$1") === expected;
}
