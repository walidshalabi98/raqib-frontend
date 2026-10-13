import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import { KpiAssistantContext, type KpiAssistantValue, type KpiRunView } from "@/hooks/useKpiAssistant";
import { KpiFrameworkPanel } from "@/components/kpi/KpiFrameworkPanel";
import { makeKpiAssistantValue, makeKpiRun, makeKpiWarning } from "@/test/fixtures";

function renderPanel(value: KpiAssistantValue) {
  return render(<KpiAssistantContext.Provider value={value}><KpiFrameworkPanel /></KpiAssistantContext.Provider>);
}

const frameworkView = (overrides: Partial<KpiRunView> = {}): KpiRunView => ({
  run: makeKpiRun({ scope: "framework", resultId: null, status: "running", step: "retrieval" }),
  scope: "framework", resultId: null, step: "retrieval", status: "running", startedAt: "", takingLonger: false,
  refresh: () => undefined, ...overrides,
});

describe("KpiFrameworkPanel", () => {
  it("shows the not-configured notice with the id the Suggest buttons point at", () => {
    renderPanel(makeKpiAssistantValue({ aiConfigured: false }));
    const notice = screen.getByText("AI suggestions are not set up yet").parentElement?.parentElement as HTMLElement;
    expect(notice).toHaveAttribute("id", "kpi-not-configured-p-1");
    expect(notice).toHaveTextContent("An administrator needs to add the Anthropic API key on the server.");
  });

  it("shows framework progress with the framework estimate, and Refresh once it takes longer", async () => {
    const refresh = vi.fn();
    const { rerender } = renderPanel(makeKpiAssistantValue({ runFor: (t) => ("scope" in t ? frameworkView() : null) }));
    expect(screen.getByText("Preparing suggestions for all results")).toBeInTheDocument();
    expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("Matching standard indicators…");
    expect(screen.getByText("This usually takes one to two minutes.")).toBeInTheDocument();
    rerender(
      <KpiAssistantContext.Provider value={makeKpiAssistantValue({ runFor: (t) => ("scope" in t ? frameworkView({ takingLonger: true, refresh }) : null) })}>
        <KpiFrameworkPanel />
      </KpiAssistantContext.Provider>,
    );
    await userEvent.setup({ delay: null }).click(screen.getByRole("button", { name: "Refresh" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("lists the latest framework run's gaps, with AI notes labelled", () => {
    const latest = makeKpiRun({
      scope: "framework", resultId: null, frameworkWarnings: [
        makeKpiWarning("accountability_added", { params: { libraryId: "AC-01", code: "O1" } }),
        makeKpiWarning("model_note", { params: { message: "No outcome covers protection." } }),
      ],
    });
    renderPanel(makeKpiAssistantValue({ latestFrameworkRun: latest }));
    const gaps = screen.getByRole("region", { name: "Gaps Raqib noticed" });
    const items = within(gaps).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Humanitarian project without an accountability indicator: AC-01 was added to O1.");
    expect(items[1]).toHaveTextContent("AI note: No outcome covers protection.");
    expect(within(items[1]).getByText("No outcome covers protection.")).toHaveAttribute("lang", "en");
  });

  it("shows a failed framework run as an alert with Retry, in Arabic too", async () => {
    const retry = vi.fn();
    const error = { code: "ai_unavailable", message: "The AI service is busy or unreachable. Try again in a few minutes.", retry };
    const { unmount } = renderPanel(makeKpiAssistantValue({ errorFor: (t) => ("scope" in t ? error : null) }));
    expect(screen.getByRole("alert")).toHaveTextContent(error.message);
    await userEvent.setup({ delay: null }).click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalled();
    unmount();
    renderPanel(makeKpiAssistantValue({ lang: "ar", aiConfigured: false }));
    expect(screen.getByText("اقتراحات الذكاء الاصطناعي غير مفعّلة بعد")).toBeInTheDocument();
  });

  it("shows a failed suggestion list as an alert with Retry", async () => {
    const retry = vi.fn();
    renderPanel(makeKpiAssistantValue({ listError: { message: "Could not load the KPI suggestions.", retry } }));
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load the KPI suggestions.");
    await userEvent.setup({ delay: null }).click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("renders nothing for donor viewers, and only its empty status region when there is nothing to show", () => {
    const { container, unmount } = renderPanel(makeKpiAssistantValue({ enabled: false, aiConfigured: false }));
    expect(container).toBeEmptyDOMElement();
    unmount();
    const second = renderPanel(makeKpiAssistantValue({ latestFrameworkRun: makeKpiRun({ scope: "framework", frameworkWarnings: [] }) }));
    expect(second.container.children).toHaveLength(1);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(screen.getByRole("status")).toHaveClass("sr-only");
  });

  it("announces a framework run that completes, in a status region that stays mounted (UX-05, WCAG 4.1.3)", () => {
    const running = frameworkView();
    const done = frameworkView({
      run: makeKpiRun({ id: running.run?.id, scope: "framework", resultId: null, status: "completed", step: "done", suggestionCount: 5 }),
      status: "completed",
      step: "done",
    });
    const panel = (view: KpiRunView) => (
      <KpiAssistantContext.Provider value={makeKpiAssistantValue({ runFor: (t) => ("scope" in t ? view : null) })}>
        <KpiFrameworkPanel />
      </KpiAssistantContext.Provider>
    );
    const { rerender } = render(panel(running));
    // Two status regions while running: the progress steps' and the panel's own (empty).
    expect(screen.getAllByRole("status")).toHaveLength(2);
    const region = screen.getAllByRole("status").find((el) => el.classList.contains("sr-only")) as HTMLElement;
    expect(region).toBeEmptyDOMElement();
    rerender(panel(done));
    // The same element (never re-created) now holds the announcement; the progress steps are gone.
    expect(region).toBeInTheDocument();
    expect(region).toHaveTextContent("5 suggestions ready across all results");
    expect(screen.queryByText("Preparing suggestions for all results")).not.toBeInTheDocument();
  });

  it("does not announce a framework run that had already completed when the panel mounted", () => {
    const done = frameworkView({ run: makeKpiRun({ scope: "framework", resultId: null, status: "completed", suggestionCount: 3 }), status: "completed", step: "done" });
    renderPanel(makeKpiAssistantValue({ runFor: (t) => ("scope" in t ? done : null) }));
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("announces in Arabic, with Arabic plural forms", () => {
    const running = frameworkView();
    const done = frameworkView({ run: makeKpiRun({ scope: "framework", resultId: null, status: "completed", suggestionCount: 2 }), status: "completed", step: "done" });
    const panel = (view: KpiRunView) => (
      <KpiAssistantContext.Provider value={makeKpiAssistantValue({ lang: "ar", runFor: (t) => ("scope" in t ? view : null) })}>
        <KpiFrameworkPanel />
      </KpiAssistantContext.Provider>
    );
    const { rerender } = render(panel(running));
    rerender(panel(done));
    const region = screen.getAllByRole("status").find((el) => el.classList.contains("sr-only")) as HTMLElement;
    expect(region).toHaveTextContent("اقتراحان جاهزان لجميع النتائج");
    expect(region).toHaveAttribute("lang", "ar");
  });
});
