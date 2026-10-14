import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import "@/i18n";
import { KpiAssistantContext, type KpiAssistantValue, type KpiRunView } from "@/hooks/useKpiAssistant";
import { SuggestKpisButton } from "@/components/kpi/SuggestKpisButton";
import { kpiNoticeId } from "@/lib/kpiSuggestions";
import { makeKpiAssistantValue, makeResultNode } from "@/test/fixtures";

const outcome = makeResultNode({ id: "o1", code: "O1", level: "outcome" });
const activity = makeResultNode({ id: "a1", code: "A1.1", level: "activity" });

function runningView(scope: KpiRunView["scope"]): KpiRunView {
  return {
    run: null, scope, resultId: scope === "framework" ? null : "o1", step: "context", status: "running",
    startedAt: new Date().toISOString(), takingLonger: false, refresh: () => undefined,
  };
}

function renderWith(value: KpiAssistantValue, ui: ReactNode) {
  return render(<KpiAssistantContext.Provider value={value}>{ui}</KpiAssistantContext.Provider>);
}

describe("SuggestKpisButton", () => {
  it("requests suggestions for one result from a row and for all results from the header", async () => {
    const request = vi.fn();
    const user = userEvent.setup({ delay: null });
    renderWith(makeKpiAssistantValue({ request }), <><SuggestKpisButton variant="row" result={outcome} /><SuggestKpisButton variant="header" /></>);
    const row = screen.getByRole("button", { name: "Suggest KPIs for O1" });
    expect(row).toHaveAttribute("id", "kpi-suggest-o1");
    expect(row).toHaveTextContent("Suggest KPIs");
    await user.click(row);
    expect(request).toHaveBeenLastCalledWith({ scope: "result", resultId: "o1" });
    await user.click(screen.getByRole("button", { name: "Suggest KPIs for all results" }));
    expect(request).toHaveBeenLastCalledWith({ scope: "framework" });
  });

  it("renders nothing for donor viewers (assistant disabled) and for activities", () => {
    const { container, unmount } = renderWith(makeKpiAssistantValue({ enabled: false }), <SuggestKpisButton variant="header" />);
    expect(container).toBeEmptyDOMElement();
    unmount();
    const second = renderWith(makeKpiAssistantValue(), <SuggestKpisButton variant="row" result={activity} />);
    expect(second.container).toBeEmptyDOMElement();
  });

  it("is aria-disabled while a run for the result or the framework runs, and does not request again", async () => {
    const request = vi.fn();
    const user = userEvent.setup({ delay: null });
    const { unmount } = renderWith(
      makeKpiAssistantValue({ request, runFor: (t) => ("scope" in t ? null : runningView("result")) }),
      <SuggestKpisButton variant="row" result={outcome} />,
    );
    const busy = screen.getByRole("button", { name: "Suggest KPIs for O1" });
    expect(busy).toHaveAttribute("aria-disabled", "true");
    await user.click(busy);
    expect(request).not.toHaveBeenCalled();
    unmount();
    renderWith(
      makeKpiAssistantValue({ request, runFor: (t) => ("scope" in t ? runningView("framework") : null) }),
      <SuggestKpisButton variant="row" result={outcome} />,
    );
    expect(screen.getByRole("button", { name: "Suggest KPIs for O1" })).toHaveAttribute("aria-disabled", "true");
  });

  it("stays visible but aria-disabled when the AI is not configured, described by the notice", async () => {
    const request = vi.fn();
    renderWith(
      makeKpiAssistantValue({ request, aiConfigured: false }),
      <>
        <p id={kpiNoticeId("p-1")}>AI suggestions are not set up yet</p>
        <SuggestKpisButton variant="header" />
      </>,
    );
    const button = screen.getByRole("button", { name: "Suggest KPIs for all results" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAccessibleDescription("AI suggestions are not set up yet");
    await userEvent.setup({ delay: null }).click(button);
    expect(request).not.toHaveBeenCalled();
  });

  it("is labelled in Arabic", () => {
    renderWith(makeKpiAssistantValue({ lang: "ar" }), <SuggestKpisButton variant="row" result={outcome} />);
    expect(screen.getByRole("button", { name: "اقتراح مؤشرات للنتيجة O1" })).toHaveTextContent("اقتراح مؤشرات");
  });

  it("is a 44 px touch target on phones in both variants (UX_STANDARDS §7)", () => {
    renderWith(makeKpiAssistantValue(), <><SuggestKpisButton variant="header" /><SuggestKpisButton variant="row" result={outcome} /></>);
    // The header button keeps the usual 36 px from sm up; the row button is 32 px there.
    expect(screen.getByRole("button", { name: "Suggest KPIs for all results" })).toHaveClass("min-h-11", "sm:min-h-9");
    expect(screen.getByRole("button", { name: "Suggest KPIs for O1" })).toHaveClass("h-11", "sm:h-8");
  });

  it("renders nothing on a read-only (archived) project", () => {
    const { container } = renderWith(makeKpiAssistantValue({ writable: false }), <><SuggestKpisButton variant="header" /><SuggestKpisButton variant="row" result={outcome} /></>);
    expect(container).toBeEmptyDOMElement();
  });
});
