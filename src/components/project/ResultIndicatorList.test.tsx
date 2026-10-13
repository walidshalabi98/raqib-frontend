import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KpiAssistantContext, type KpiAssistantValue, type KpiRunView } from "@/hooks/useKpiAssistant";
import { ResultIndicatorList } from "@/components/project/ResultIndicatorList";
import type { AppLanguage } from "@/i18n";
import type { Indicator, IndicatorQuality } from "@/types/api";
import { renderWithClient } from "@/test/utils";
import { makeIndicator, makeIndicatorQuality, makeKpiAssistantValue, makeKpiWarning, sampleResultNodes } from "@/test/fixtures";

const AI_LABEL = "AI suggested — review before approval";
const o1 = sampleResultNodes()[1];

const library = makeIndicator({ id: "ind-lib", indicatorText: "% of households with acceptable FCS", provenance: "library", isApproved: true });
const aiNew = makeIndicator({
  id: "ind-ai", indicatorText: "Average coping strategy index", indicatorTextAr: null, provenance: "ai_suggested",
  isApproved: false, libraryId: null, standardReferenceCode: null,
});
const aiApproved = makeIndicator({ id: "ind-ai-ok", indicatorText: "Number of vouchers redeemed", provenance: "ai_generated", isApproved: true, libraryId: "FS-04", standardReferenceCode: null });

const weak = makeIndicatorQuality({
  indicatorId: "ind-ai",
  qualityScore: 60,
  qualityBand: "weak",
  needsAlternatives: true,
  warnings: [
    makeKpiWarning("target_in_name", { penalty: 15 }),
    makeKpiWarning("double_barrelled", { penalty: 10 }),
    makeKpiWarning("sex_added", { penalty: 0 }),
  ],
});

function renderList({
  indicators = [library, aiNew, aiApproved] as Indicator[],
  quality = [weak] as IndicatorQuality[],
  value = {} as Partial<KpiAssistantValue>,
  lang = "en" as AppLanguage,
} = {}) {
  const request = vi.fn();
  renderWithClient(
    <KpiAssistantContext.Provider value={makeKpiAssistantValue({ request, lang, ...value })}>
      <ResultIndicatorList id="o1-indicators" result={o1} indicators={indicators}
        quality={new Map(quality.map((q) => [q.indicatorId, q]))} lang={lang} />
    </KpiAssistantContext.Provider>,
  );
  return { request, list: document.getElementById("o1-indicators") as HTMLElement };
}

/** The indicator's own list item (not a nested warning item). */
const itemOf = (name: string) => {
  const list = document.getElementById("o1-indicators") as HTMLElement;
  return Array.from(list.children).find((li) => li.textContent?.includes(name)) as HTMLElement;
};

describe("ResultIndicatorList", () => {
  it("shows each indicator's source: provenance, standard badge and library id", () => {
    const { list } = renderList();
    expect(list.tagName).toBe("UL");
    expect(list.children).toHaveLength(3);

    const lib = itemOf("% of households with acceptable FCS");
    expect(within(lib).getByText("From the indicator library")).toBeInTheDocument();
    expect(within(lib).getByText("WFP CRF")).toHaveAttribute("dir", "ltr");
    expect(within(lib).getByText("FS-01")).toHaveAttribute("dir", "ltr");

    expect(within(itemOf("Average coping strategy index")).getByText("Custom")).toBeInTheDocument();
    expect(within(itemOf("Number of vouchers redeemed")).getByText("Library FS-04")).toBeInTheDocument();
  });

  it("labels AI-made indicators until the indicator itself is approved (D18)", () => {
    renderList();
    expect(within(itemOf("Average coping strategy index")).getByRole("note")).toHaveTextContent(AI_LABEL);
    expect(within(itemOf("Number of vouchers redeemed")).queryByText(AI_LABEL)).not.toBeInTheDocument();
    expect(within(itemOf("% of households with acceptable FCS")).queryByText(AI_LABEL)).not.toBeInTheDocument();
  });

  it("offers alternatives for a weak indicator, with only the notes that cost points", async () => {
    const user = userEvent.setup({ delay: null });
    const { request } = renderList();
    const item = itemOf("Average coping strategy index");
    expect(within(item).getByText("Quality: Weak (60/100)")).toBeInTheDocument();
    expect(within(item).getByText("Raqib found quality problems in this indicator. It can suggest alternatives.")).toBeInTheDocument();
    expect(within(item).getByText("Move the target out of the name.")).toBeInTheDocument();
    expect(within(item).getByText("The name may measure two things at once.")).toBeInTheDocument();
    expect(within(item).queryByText("Sex disaggregation added because the indicator counts people.")).not.toBeInTheDocument();

    const button = within(item).getByRole("button", { name: "Show alternatives to “Average coping strategy index”" });
    expect(button).toHaveAccessibleDescription("Raqib found quality problems in this indicator. It can suggest alternatives.");
    await user.click(button);
    expect(request).toHaveBeenCalledWith({ scope: "alternatives", indicatorId: "ind-ai" });

    // Indicators without quality problems get no prompt.
    expect(within(itemOf("% of households with acceptable FCS")).queryByRole("button")).not.toBeInTheDocument();
  });

  it("keeps Show alternatives visible but unavailable while the AI is not configured or a run is active", async () => {
    const user = userEvent.setup({ delay: null });
    const first = renderList({ value: { aiConfigured: false } });
    let button = screen.getByRole("button", { name: /^Show alternatives to/ });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAttribute("aria-describedby", "kpi-not-configured-p-1");
    await user.click(button);
    expect(first.request).not.toHaveBeenCalled();
    document.body.innerHTML = "";

    const running: KpiRunView = {
      run: null, scope: "result", resultId: "o1", step: "model", status: "running", startedAt: "", takingLonger: false, refresh: () => undefined,
    };
    const second = renderList({ value: { runFor: (target) => ("scope" in target ? null : running) } });
    button = screen.getByRole("button", { name: /^Show alternatives to/ });
    expect(button).toHaveAttribute("aria-disabled", "true");
    await user.click(button);
    expect(second.request).not.toHaveBeenCalled();
  });

  it("gives an indicator without a result no button (alternatives are suggested for a result)", () => {
    renderList({ indicators: [{ ...aiNew, resultId: null }] });
    expect(screen.getByText("Raqib found quality problems in this indicator. It can suggest alternatives.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows no KPI prompt to roles without the assistant", () => {
    renderList({ value: { enabled: false } });
    expect(screen.queryByText(/Raqib found quality problems/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    // The indicators themselves are still listed.
    expect(document.getElementById("o1-indicators")?.children).toHaveLength(3);
  });

  it("shows Arabic names and labels in Arabic", () => {
    renderList({ lang: "ar" });
    const [name] = screen.getAllByText("نسبة الأسر ذات درجة استهلاك غذائي مقبولة");
    expect(name).toHaveAttribute("lang", "ar");
    expect(name).toHaveAttribute("dir", "rtl");
    // No Arabic name: the English one stays, marked as English.
    expect(screen.getByText("Average coping strategy index")).toHaveAttribute("lang", "en");
    expect(screen.getByRole("button", { name: /^عرض بدائل/ })).toBeInTheDocument();
  });
});
