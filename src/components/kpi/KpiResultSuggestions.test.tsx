import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { api } from "@/services/api";
import { queryKeys } from "@/lib/queryKeys";
import { KpiAssistantContext, type KpiAssistantValue, type KpiRunView } from "@/hooks/useKpiAssistant";
import { KpiResultSuggestions } from "@/components/kpi/KpiResultSuggestions";
import type { Framework, KpiSuggestion } from "@/types/api";
import { createTestQueryClient, renderWithClient } from "@/test/utils";
import {
  makeIndicator,
  makeKpiAssistantValue,
  makeKpiRun,
  makeKpiSuggestion,
  makeKpiWarning,
  sampleResultNodes,
} from "@/test/fixtures";

vi.mock("@/services/api", () => ({ api: { acceptKpiSuggestion: vi.fn(), rejectKpiSuggestion: vi.fn() } }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/components/project/IndicatorDialog", () => ({ IndicatorDialog: ({ trigger }: { trigger: ReactNode }) => trigger }));

const nodes = sampleResultNodes();
const o1 = nodes[1];
const first = makeKpiSuggestion({ id: "s-1", sortOrder: 1, suggestion: { name: "First indicator", nameAr: "المؤشر الأول", rationale: "Fits the first way." } });
const second = makeKpiSuggestion({ id: "s-2", sortOrder: 2, libraryId: "FS-02", suggestion: { name: "Second indicator", nameAr: "المؤشر الثاني", rationale: "Fits the second way." } });

function view(overrides: Partial<KpiRunView> = {}): KpiRunView {
  return {
    run: null, scope: "result", resultId: "o1", step: "retrieval", status: "running", startedAt: "", takingLonger: false,
    refresh: () => undefined, ...overrides,
  };
}

function renderList(value: Partial<KpiAssistantValue>, { result = o1, focusFallback = () => null as HTMLElement | null, client = createTestQueryClient() } = {}) {
  return renderWithClient(
    <KpiAssistantContext.Provider value={makeKpiAssistantValue(value)}>
      <button type="button" id="fallback">Suggest KPIs for O1</button>
      <KpiResultSuggestions result={result} nodes={nodes} focusFallback={focusFallback} />
    </KpiAssistantContext.Provider>,
    client,
  );
}

const pending = (...items: KpiSuggestion[]) => (resultId: string) => items.filter((s) => s.resultId === resultId);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.acceptKpiSuggestion).mockImplementation(async (id) => ({
    indicator: makeIndicator({ id: `ind-${id}` }), suggestion: { ...first, id, status: "accepted" }, warnings: [],
  }));
});

describe("KpiResultSuggestions", () => {
  it("renders cards in rank order with a one-line rationale and one AI label for the list", () => {
    renderList({ pendingFor: pending(second, first) });
    const list = screen.getByRole("list", { name: "Suggested indicators for O1" });
    expect(list).toHaveAccessibleDescription("AI suggested — review before approval");
    expect(screen.getAllByRole("note")).toHaveLength(1);
    const cards = within(list).getAllByRole("article");
    expect(cards.map((c) => within(c).getByRole("heading").textContent)).toEqual(["First indicator", "Second indicator"]);
    expect(within(cards[0]).getAllByText("Fits the first way.")[0].parentElement?.className).toContain("line-clamp-1");
  });

  it("shows named progress steps while a run for the result runs", () => {
    renderList({ runFor: (t) => ("scope" in t ? null : view()) });
    expect(screen.getByText("Preparing suggestions for O1")).toBeInTheDocument();
    expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("Matching standard indicators…");
    expect(screen.getByText("This usually takes about 15 seconds.")).toBeInTheDocument();
  });

  it("shows an error as an alert with Retry only when it can help", async () => {
    const retry = vi.fn();
    const { unmount } = renderList({
      errorFor: (t) => ("scope" in t ? null : { code: "rate_limited", message: "You have asked for many suggestions this hour. Try again later.", retry }),
    });
    expect(screen.getByRole("alert")).toHaveTextContent("You have asked for many suggestions this hour. Try again later.");
    await userEvent.setup({ delay: null }).click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalled();
    unmount();
    renderList({ errorFor: (t) => ("scope" in t ? null : { code: "nothing_to_suggest", message: "Every result already has as many indicators as allowed, so there is nothing to suggest." }) });
    expect(screen.getByRole("alert")).toHaveTextContent("nothing to suggest");
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("announces finished suggestions without moving focus, and shows the run's notes", () => {
    const run = makeKpiRun({ suggestionCount: 2, frameworkWarnings: [makeKpiWarning("result_cap", { params: { code: "O1", cap: 4, dropped: 1 } })] });
    renderList({ pendingFor: pending(first, second), runFor: (t) => ("scope" in t ? null : view({ run, status: "completed", step: "done" })) });
    expect(screen.getByRole("status")).toHaveTextContent("2 suggestions ready for O1");
    expect(document.body).toHaveFocus();
    expect(screen.getByText(/O1: kept 4 indicators per result/)).toBeInTheDocument();
  });

  it("shows the empty state after a run with nothing new, with Suggest again", async () => {
    const request = vi.fn();
    renderList({ request, runFor: (t) => ("scope" in t ? null : view({ run: makeKpiRun({ suggestionCount: 0 }), status: "completed", step: "done" })) });
    expect(screen.getByText("No new suggestions for O1. Nothing else in the library fits, or your organisation rejected the matches.")).toBeInTheDocument();
    await userEvent.setup({ delay: null }).click(screen.getByRole("button", { name: "Suggest again" }));
    expect(request).toHaveBeenCalledWith({ scope: "result", resultId: "o1" });
  });

  it("renders nothing before any request, for activities and for donor viewers", () => {
    const { container, unmount } = renderList({});
    expect(container.querySelector("article, [role=alert], ul")).toBeNull();
    unmount();
    const activity = { ...nodes[2], id: "a1", level: "activity" as const };
    const second = renderList({ pendingFor: () => [first] }, { result: activity });
    expect(second.container.querySelector("article")).toBeNull();
    second.unmount();
    const third = renderList({ enabled: false, pendingFor: pending(first) });
    expect(third.container.querySelector("article")).toBeNull();
  });

  it("nests alternatives under their source and groups the others by source", () => {
    const client = createTestQueryClient();
    client.setQueryData<Partial<Framework>>(queryKeys.framework("p-1"), { indicators: [makeIndicator({ id: "ind-7", indicatorText: "Existing FCS indicator" })] });
    const nested = makeKpiSuggestion({ id: "alt-1", alternativeOfSuggestionId: "s-1", suggestion: { name: "Alternative to first" } });
    const ofIndicator = makeKpiSuggestion({ id: "alt-2", alternativeOfIndicatorId: "ind-7", suggestion: { name: "Alternative to indicator" } });
    const ofUnknown = makeKpiSuggestion({ id: "alt-3", alternativeOfSuggestionId: "gone", suggestion: { name: "Alternative to earlier" } });
    renderList({ pendingFor: pending(first, nested, ofIndicator, ofUnknown) }, { client });
    const nestedList = screen.getByRole("list", { name: "Alternatives to “First indicator”" });
    expect(within(nestedList).getByRole("heading", { name: "Alternative to first" })).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Alternatives to “Existing FCS indicator”" })).getByRole("heading")).toHaveTextContent("Alternative to indicator");
    expect(within(screen.getByRole("list", { name: "Alternatives to an earlier suggestion" })).getByRole("heading")).toHaveTextContent("Alternative to earlier");
  });

  it("moves focus to the next card after an accept, then to the Suggest KPIs button, and announces it", async () => {
    const user = userEvent.setup({ delay: null });
    renderList({ pendingFor: pending(first, second) }, { focusFallback: () => document.getElementById("fallback") });
    await user.click(screen.getByRole("button", { name: "Accept “First indicator”" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Second indicator" })).toHaveFocus());
    expect(screen.queryByRole("heading", { name: "First indicator" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Indicator added to O1");
    await user.click(screen.getByRole("button", { name: "Accept “Second indicator”" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Suggest KPIs for O1" })).toHaveFocus());
  });

  it("moves focus to the previous card when the last one is dismissed from its stub", async () => {
    vi.mocked(api.rejectKpiSuggestion).mockImplementation(async (id, body) => ({ suggestion: { ...second, id, status: "rejected", rejectReason: body.reason } }));
    const user = userEvent.setup({ delay: null });
    renderList({ pendingFor: pending(first, second) });
    await user.click(screen.getByRole("button", { name: "Reject “Second indicator”" }));
    await user.click(screen.getByRole("radio", { name: "Duplicate" }));
    await user.click(screen.getByRole("button", { name: "Reject suggestion" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Rejected: Second indicator" })).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "First indicator" })).toHaveFocus());
    expect(screen.queryByText("Rejected: Second indicator")).not.toBeInTheDocument();
  });

  it("works in Arabic, right to left", () => {
    const { container } = renderList({ lang: "ar", pendingFor: pending(first) });
    expect(container.querySelector("[dir=rtl][lang=ar]")).not.toBeNull();
    expect(screen.getByRole("list", { name: "المؤشرات المقترحة للنتيجة O1" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "المؤشر الأول" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "قبول «المؤشر الأول»" })).toBeInTheDocument();
  });
});
