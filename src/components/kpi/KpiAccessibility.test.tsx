import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import axe from "axe-core";
import "@/i18n";
import { KpiAssistantContext } from "@/hooks/useKpiAssistant";
import { KpiSuggestionCard } from "@/components/kpi/KpiSuggestionCard";
import { RejectReasonPicker } from "@/components/kpi/RejectReasonPicker";
import { KpiProgressSteps } from "@/components/kpi/KpiProgressSteps";
import { KpiFrameworkPanel } from "@/components/kpi/KpiFrameworkPanel";
import { KpiResultSuggestions } from "@/components/kpi/KpiResultSuggestions";
import { makeKpiAssistantValue, makeKpiRun, makeKpiSuggestion, makeKpiWarning, sampleResultNodes } from "@/test/fixtures";

/**
 * axe checks of the KPI Assistant components in English and Arabic (design 9.8; CLAUDE.md rule 4, WCAG 2.2 AA).
 * jsdom cannot compute colours, so colour contrast is checked on the screenshot pages instead (design 9.9); the region
 * rule needs a whole page.
 */
vi.mock("@/components/project/IndicatorDialog", () => ({ IndicatorDialog: ({ trigger }: { trigger: ReactNode }) => trigger }));

async function violations(ui: ReactNode): Promise<string[]> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container, unmount } = render(<QueryClientProvider client={client}><main>{ui}</main></QueryClientProvider>);
  // Open every collapsed panel so its content is checked too.
  container.querySelectorAll("[hidden]").forEach((el) => el.removeAttribute("hidden"));
  try {
    const result = await axe.run(container, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
    return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`);
  } finally {
    unmount();
  }
}

const nodes = sampleResultNodes();
const suggestion = makeKpiSuggestion({ warnings: [makeKpiWarning("target_in_name"), makeKpiWarning("sex_added")] });
const alternative = makeKpiSuggestion({ id: "s-2", alternativeOfSuggestionId: "s-1", suggestion: { name: "Alternative indicator" } });

describe.each(["en", "ar"] as const)("KPI Assistant components pass axe (%s)", (lang) => {
  it("suggestion card", async () => {
    expect(await violations(
      <KpiAssistantContext.Provider value={makeKpiAssistantValue({ lang })}>
        <p id="ai-label">AI</p>
        <ul><li><KpiSuggestionCard suggestion={suggestion} result={nodes[1]} nodes={nodes} aiLabelId="ai-label" lang={lang} /></li></ul>
      </KpiAssistantContext.Provider>,
    )).toEqual([]);
  });

  it("reject reason picker", async () => {
    expect(await violations(
      <KpiAssistantContext.Provider value={makeKpiAssistantValue({ lang })}>
        <RejectReasonPicker suggestion={suggestion} lang={lang} onRejected={() => undefined} onCancel={() => undefined} />
      </KpiAssistantContext.Provider>,
    )).toEqual([]);
  });

  it("progress steps", async () => {
    expect(await violations(
      <KpiProgressSteps step="model" scope="result" lang={lang} code="O1" takingLonger onRefresh={() => undefined} />,
    )).toEqual([]);
  });

  it("framework panel (notice, run error, list error, gaps)", async () => {
    const latest = makeKpiRun({ scope: "framework", frameworkWarnings: [makeKpiWarning("model_note", { params: { message: "Note" } })] });
    expect(await violations(
      <KpiAssistantContext.Provider value={makeKpiAssistantValue({
        lang,
        aiConfigured: false,
        latestFrameworkRun: latest,
        errorFor: (t) => ("scope" in t ? { code: "internal", message: "Error", retry: () => undefined } : null),
        listError: { message: "List error", retry: () => undefined },
      })}>
        <KpiFrameworkPanel />
      </KpiAssistantContext.Provider>,
    )).toEqual([]);
  });

  it("result suggestions with alternatives", async () => {
    expect(await violations(
      <KpiAssistantContext.Provider value={makeKpiAssistantValue({ lang, pendingFor: (id) => (id === "o1" ? [suggestion, alternative] : []) })}>
        <KpiResultSuggestions result={nodes[1]} nodes={nodes} focusFallback={() => null} />
      </KpiAssistantContext.Provider>,
    )).toEqual([]);
  });
});

describe("axe harness", () => {
  it("reports a button without a name (so a pass above means something)", async () => {
    expect(await violations(<button type="button" />)).not.toEqual([]);
  });
});
