import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { api } from "@/services/api";
import { ApiError } from "@/lib/apiError";
import { queryKeys } from "@/lib/queryKeys";
import { KPI_RESULT_POLL_CAP_MS } from "@/lib/kpiSuggestions";
import { AuthProvider } from "@/contexts/AuthContext";
import type { AppLanguage } from "@/i18n";
import { KpiAssistantProvider } from "@/components/kpi/KpiAssistantProvider";
import { KpiFrameworkPanel } from "@/components/kpi/KpiFrameworkPanel";
import { KpiResultSuggestions } from "@/components/kpi/KpiResultSuggestions";
import { SuggestKpisButton } from "@/components/kpi/SuggestKpisButton";
import type { KpiRun, KpiSuggestion } from "@/types/api";
import { createTestQueryClient, nameWithIsolatedPart, renderWithClient } from "@/test/utils";
import {
  makeAuthUser,
  makeKpiAssistantStatus,
  makeKpiRun,
  makeKpiSuggestion,
  makeKpiSuggestionList,
  sampleResultNodes,
} from "@/test/fixtures";

vi.mock("@/services/api", () => ({
  api: {
    getUser: vi.fn(),
    getToken: vi.fn(() => "token"),
    getKpiAssistantStatus: vi.fn(),
    getKpiSuggestions: vi.fn(),
    requestKpiSuggestions: vi.fn(),
    getKpiSuggestionRun: vi.fn(),
    acceptKpiSuggestion: vi.fn(),
    rejectKpiSuggestion: vi.fn(),
  },
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/components/project/IndicatorDialog", () => ({ IndicatorDialog: ({ trigger }: { trigger: ReactNode }) => trigger }));

const nodes = sampleResultNodes();
const o1Suggestion = makeKpiSuggestion({ id: "s-1", runId: "run-1", suggestion: { name: "Households with acceptable FCS" } });

function Chain({ lang = "en" }: { lang?: AppLanguage }) {
  return (
    <AuthProvider>
      <KpiAssistantProvider projectId="p-1" frameworkId="fw-1" lang={lang}>
        <SuggestKpisButton variant="header" />
        <KpiFrameworkPanel />
        <ul>
          {nodes.map((node) => (
            <li key={node.id} data-testid={`row-${node.code}`}>
              <span>{node.code}</span>
              <SuggestKpisButton variant="row" result={node} />
              <KpiResultSuggestions result={node} nodes={nodes} focusFallback={() => null} />
            </li>
          ))}
        </ul>
      </KpiAssistantProvider>
    </AuthProvider>
  );
}

function renderChain(lang: AppLanguage = "en") {
  const client = createTestQueryClient();
  return { client, ...renderWithClient(<Chain lang={lang} />, client) };
}

const row = (code: string) => screen.getByTestId(`row-${code}`);
const runningRun = (overrides: Partial<KpiRun> = {}) => {
  const now = new Date().toISOString();
  return makeKpiRun({ status: "running", step: "model", suggestionCount: 0, finishedAt: null, createdAt: now, updatedAt: now, ...overrides });
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getUser).mockReturnValue(makeAuthUser({ role: "me_officer" }));
  vi.mocked(api.getKpiAssistantStatus).mockResolvedValue(makeKpiAssistantStatus());
  vi.mocked(api.getKpiSuggestions).mockResolvedValue(makeKpiSuggestionList());
});

afterEach(() => {
  vi.useRealTimers();
});

describe("KpiAssistantProvider (useKpiSuggestions through the components)", () => {
  it("200: the finished run's cards appear under the result and are announced", async () => {
    const run = makeKpiRun({ suggestionCount: 1 });
    vi.mocked(api.requestKpiSuggestions).mockResolvedValue({ run, suggestions: [o1Suggestion], httpStatus: 200 });
    vi.mocked(api.getKpiSuggestions)
      .mockResolvedValueOnce(makeKpiSuggestionList())
      .mockResolvedValue(makeKpiSuggestionList({ suggestions: [o1Suggestion] }));
    const user = userEvent.setup({ delay: null });
    renderChain();
    await user.click(await screen.findByRole("button", { name: "Suggest KPIs for O1" }));
    expect(api.requestKpiSuggestions).toHaveBeenCalledWith("p-1", { scope: "result", resultId: "o1" });
    expect(await within(row("O1")).findByRole("heading", { name: "Households with acceptable FCS" })).toBeInTheDocument();
    expect(within(row("O2")).queryByRole("article")).not.toBeInTheDocument();
    await waitFor(() => expect(within(row("O1")).getAllByRole("status").slice(-1)[0]).toHaveTextContent("1 suggestion ready for O1"));
    await waitFor(() => expect(api.getKpiSuggestions).toHaveBeenCalledTimes(2));
  });

  it("shows the timed steps during the synchronous wait", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(api.requestKpiSuggestions).mockReturnValue(new Promise(() => undefined));
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    renderChain();
    await user.click(await screen.findByRole("button", { name: "Suggest KPIs for O1" }));
    expect(within(row("O1")).getByRole("listitem", { current: "step" })).toHaveTextContent("Reading your results chain…");
    expect(screen.getByRole("button", { name: "Suggest KPIs for O1" })).toHaveAttribute("aria-disabled", "true");
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(within(row("O1")).getByRole("listitem", { current: "step" })).toHaveTextContent("Matching standard indicators…");
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(within(row("O1")).getByRole("listitem", { current: "step" })).toHaveTextContent("Writing suggestions…");
    // A second click while waiting sends nothing.
    await user.click(screen.getByRole("button", { name: "Suggest KPIs for O1" }));
    expect(api.requestKpiSuggestions).toHaveBeenCalledTimes(1);
  });

  it("202: polls the run with back-off until it completes, then shows its suggestions", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const running = runningRun({ id: "run-2" });
    vi.mocked(api.requestKpiSuggestions).mockResolvedValue({ run: running, httpStatus: 202 });
    const done = makeKpiRun({ id: "run-2", suggestionCount: 1, createdAt: running.createdAt });
    const fresh = makeKpiSuggestion({ id: "s-9", runId: "run-2", suggestion: { name: "Polled indicator" } });
    let serverSuggestions: KpiSuggestion[] = [];
    vi.mocked(api.getKpiSuggestions).mockImplementation(async () => makeKpiSuggestionList({ suggestions: serverSuggestions }));
    vi.mocked(api.getKpiSuggestionRun)
      .mockResolvedValueOnce({ run: { ...running, step: "validation" }, suggestions: [] })
      .mockImplementation(async () => {
        serverSuggestions = [fresh];
        return { run: done, suggestions: [fresh] };
      });
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    renderChain();
    await user.click(await screen.findByRole("button", { name: "Suggest KPIs for O1" }));
    await waitFor(() => expect(api.getKpiSuggestionRun).toHaveBeenCalledWith("run-2"));
    await waitFor(() => expect(within(row("O1")).getByRole("listitem", { current: "step" })).toHaveTextContent("Checking quality…"));
    expect(api.getKpiSuggestionRun).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(2_100); });
    await waitFor(() => expect(api.getKpiSuggestionRun).toHaveBeenCalledTimes(2));
    expect(await within(row("O1")).findByRole("heading", { name: "Polled indicator" })).toBeInTheDocument();
    expect(within(row("O1")).queryByText("Preparing suggestions for O1")).not.toBeInTheDocument();
    // The list was refetched after the run finished; polling stopped.
    await waitFor(() => expect(api.getKpiSuggestions).toHaveBeenCalledTimes(3));
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(api.getKpiSuggestionRun).toHaveBeenCalledTimes(2);
  });

  it("shows 'taking longer' and Refresh at the polling cap when every poll returns the same running run", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const running = runningRun({ id: "run-stuck" });
    vi.mocked(api.requestKpiSuggestions).mockResolvedValue({ run: running, httpStatus: 202 });
    // Identical bodies (no heartbeat between polls): structural sharing keeps the same data, so no poll re-renders.
    vi.mocked(api.getKpiSuggestionRun).mockImplementation(async () => ({ run: { ...running }, suggestions: [] }));
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    renderChain();
    await user.click(await screen.findByRole("button", { name: "Suggest KPIs for O1" }));
    await waitFor(() => expect(api.getKpiSuggestionRun).toHaveBeenCalledWith("run-stuck"));
    await act(async () => { await vi.advanceTimersByTimeAsync(KPI_RESULT_POLL_CAP_MS - 5_000); });
    expect(within(row("O1")).queryByText("This is taking longer than expected.")).not.toBeInTheDocument();

    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(within(row("O1")).getAllByText("This is taking longer than expected.").length).toBeGreaterThan(0);
    expect(within(row("O1")).getByRole("button", { name: "Refresh" })).toBeInTheDocument();
    // Polling stopped at the cap; Refresh asks once more.
    const polls = vi.mocked(api.getKpiSuggestionRun).mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(api.getKpiSuggestionRun).toHaveBeenCalledTimes(polls);
    await user.click(within(row("O1")).getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(api.getKpiSuggestionRun).toHaveBeenCalledTimes(polls + 1));
  });

  it("polls a 202 run from the client's own request time, whatever the server clock says", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // The server's clock is 3 minutes behind the client's: by the client's clock the run looks 3 minutes old.
    const serverNow = new Date(Date.now() - 3 * 60_000).toISOString();
    const running = runningRun({ id: "run-skew", createdAt: serverNow, updatedAt: serverNow });
    vi.mocked(api.requestKpiSuggestions).mockResolvedValue({ run: running, httpStatus: 202 });
    vi.mocked(api.getKpiSuggestionRun).mockImplementation(async () => ({ run: { ...running }, suggestions: [] }));
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    renderChain();
    await user.click(await screen.findByRole("button", { name: "Suggest KPIs for O1" }));
    await waitFor(() => expect(api.getKpiSuggestionRun).toHaveBeenCalledTimes(1));
    await act(async () => { await vi.advanceTimersByTimeAsync(2_100); });
    await waitFor(() => expect(api.getKpiSuggestionRun).toHaveBeenCalledTimes(2));
    expect(within(row("O1")).queryByText("This is taking longer than expected.")).not.toBeInTheDocument();
    expect(within(row("O1")).getByText("Preparing suggestions for O1")).toBeInTheDocument();
  });

  it("announces a finished framework run to screen readers (UX-05)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const running = runningRun({ id: "run-fw", scope: "framework", resultId: null });
    vi.mocked(api.requestKpiSuggestions).mockResolvedValue({ run: running, httpStatus: 202 });
    const o2 = makeKpiSuggestion({ id: "s-o2", resultId: "o2", resultCode: "O2", runId: "run-fw", suggestion: { name: "Nutrition practice indicator" } });
    const fromRun = { ...o1Suggestion, runId: "run-fw" };
    const done = makeKpiRun({ id: "run-fw", scope: "framework", resultId: null, suggestionCount: 2, createdAt: running.createdAt });
    let serverSuggestions: KpiSuggestion[] = [];
    vi.mocked(api.getKpiSuggestions).mockImplementation(async () => makeKpiSuggestionList({ suggestions: serverSuggestions }));
    vi.mocked(api.getKpiSuggestionRun)
      .mockResolvedValueOnce({ run: running, suggestions: [] })
      .mockImplementation(async () => {
        serverSuggestions = [fromRun, o2];
        return { run: done, suggestions: [fromRun, o2] };
      });
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    renderChain();
    await user.click(await screen.findByRole("button", { name: "Suggest KPIs for all results" }));
    expect(await screen.findByText("Preparing suggestions for all results")).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(3_100); });
    expect(await within(row("O2")).findByRole("heading", { name: "Nutrition practice indicator" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole("status").some((el) => el.textContent === "2 suggestions ready across all results")).toBe(true));
  });

  it("409 run_in_progress: follows the run that is already preparing suggestions", async () => {
    vi.mocked(api.requestKpiSuggestions).mockRejectedValue(new ApiError("Busy", 409, "run_in_progress", { runId: "run-busy" }));
    vi.mocked(api.getKpiSuggestionRun).mockResolvedValue({ run: runningRun({ id: "run-busy", step: "retrieval" }), suggestions: [] });
    const user = userEvent.setup({ delay: null });
    renderChain();
    await user.click(await screen.findByRole("button", { name: "Suggest KPIs for O1" }));
    await waitFor(() => expect(api.getKpiSuggestionRun).toHaveBeenCalledWith("run-busy"));
    await waitFor(() => expect(within(row("O1")).getByRole("listitem", { current: "step" })).toHaveTextContent("Matching standard indicators…"));
    expect(within(row("O1")).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("409 run_in_progress from another result's run: says so where it was asked and shows that run's progress", async () => {
    vi.mocked(api.requestKpiSuggestions).mockRejectedValue(new ApiError("Busy", 409, "run_in_progress", { runId: "run-o2" }));
    vi.mocked(api.getKpiSuggestionRun).mockResolvedValue({ run: runningRun({ id: "run-o2", resultId: "o2" }), suggestions: [] });
    const user = userEvent.setup({ delay: null });
    renderChain();
    await user.click(await screen.findByRole("button", { name: "Suggest KPIs for all results" }));
    expect(await screen.findByText("Suggestions are already being prepared here.")).toBeInTheDocument();
    expect(await within(row("O2")).findByText("Preparing suggestions for O2")).toBeInTheDocument();
  });

  it("503: shows the not-configured notice and disables the buttons", async () => {
    vi.mocked(api.requestKpiSuggestions).mockRejectedValue(new ApiError("AI suggestions are not set up yet.", 503, "ai_not_configured"));
    vi.mocked(api.getKpiAssistantStatus)
      .mockResolvedValueOnce(makeKpiAssistantStatus())
      .mockResolvedValue(makeKpiAssistantStatus({ aiConfigured: false }));
    const user = userEvent.setup({ delay: null });
    renderChain();
    await user.click(await screen.findByRole("button", { name: "Suggest KPIs for O1" }));
    expect(await screen.findByText("AI suggestions are not set up yet")).toBeInTheDocument();
    const header = screen.getByRole("button", { name: "Suggest KPIs for all results" });
    expect(header).toHaveAttribute("aria-disabled", "true");
    expect(header).toHaveAccessibleDescription(/An administrator needs to add the Anthropic API key/);
    expect(within(row("O1")).getByRole("alert")).toHaveTextContent("AI suggestions are not set up yet. Ask your administrator to add the Anthropic API key.");
    await waitFor(() => expect(api.getKpiAssistantStatus).toHaveBeenCalledTimes(2));
    expect(screen.getByText("AI suggestions are not set up yet")).toBeInTheDocument();
  });

  it("shows the notice from the status before any request", async () => {
    vi.mocked(api.getKpiAssistantStatus).mockResolvedValue(makeKpiAssistantStatus({ aiConfigured: false }));
    renderChain("ar");
    expect(await screen.findByText("اقتراحات الذكاء الاصطناعي غير مفعّلة بعد")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "اقتراح مؤشرات للنتيجة O1" })).toHaveAttribute("aria-disabled", "true");
  });

  it("429: shows the rate-limit or budget message under the result", async () => {
    vi.mocked(api.requestKpiSuggestions)
      .mockRejectedValueOnce(new ApiError("Too many requests.", 429))
      .mockRejectedValueOnce(new ApiError("Budget", 429, "budget_reached"));
    const user = userEvent.setup({ delay: null });
    renderChain();
    await user.click(await screen.findByRole("button", { name: "Suggest KPIs for O1" }));
    expect(await within(row("O1")).findByRole("alert")).toHaveTextContent("Too many requests right now. Wait a minute and try again.");
    await user.click(within(row("O1")).getByRole("button", { name: "Try again" }));
    expect(await within(row("O1")).findByText(/reached today's AI budget/)).toBeInTheDocument();
    expect(within(row("O1")).queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it.each([
    ["organisation", "en", "Your organisation has reached its hourly limit of KPI suggestions. Try again later.", "Try again"],
    ["user", "en", "You have reached your hourly limit of AI requests (KPI suggestions, frameworks, reports and analyses count together). Try again later.", "Try again"],
    ["organisation", "ar", "بلغت مؤسستك حدّها من اقتراحات المؤشرات لهذه الساعة. حاول لاحقًا.", "إعادة المحاولة"],
  ] as const)("429 rate_limited (scope %s, %s): says who reached the hourly limit (UX-08)", async (scope, lang, message, retry) => {
    vi.mocked(api.requestKpiSuggestions).mockRejectedValue(new ApiError("Limit", 429, "rate_limited", { scope }));
    const user = userEvent.setup({ delay: null });
    renderChain(lang);
    const suggest = lang === "ar" ? "اقتراح مؤشرات للنتيجة O1" : "Suggest KPIs for O1";
    await user.click(await screen.findByRole("button", { name: suggest }));
    expect(await within(row("O1")).findByRole("alert")).toHaveTextContent(message);
    // No Retry: pressing it now meets the same hourly limiter; the message says to try later (UX-08 re-check).
    expect(within(row("O1")).queryByRole("button", { name: retry })).not.toBeInTheDocument();
    expect(api.requestKpiSuggestions).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["level_cap", "Every result already has as many indicators as its level allows, so there is nothing to suggest."],
    ["donor_cap", "Every result already has as many indicators as the donor allows, so there is nothing to suggest."],
    ["no_results", "There is nothing to suggest yet: add a goal (impact), outcome or output to the results chain first."],
    [undefined, "Every result already has as many indicators as allowed, so there is nothing to suggest."],
    ["something_new", "Every result already has as many indicators as allowed, so there is nothing to suggest."],
  ])("422 nothing_to_suggest (reason %s): explains why, without Retry", async (reason, message) => {
    vi.mocked(api.requestKpiSuggestions).mockRejectedValue(new ApiError("Nothing", 422, "nothing_to_suggest", reason ? { reason } : undefined));
    const user = userEvent.setup({ delay: null });
    renderChain();
    await user.click(await screen.findByRole("button", { name: "Suggest KPIs for all results" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("422 nothing_to_suggest in Arabic names the donor limit", async () => {
    vi.mocked(api.requestKpiSuggestions).mockRejectedValue(new ApiError("Nothing", 422, "nothing_to_suggest", { reason: "donor_cap" }));
    const user = userEvent.setup({ delay: null });
    renderChain("ar");
    await user.click(await screen.findByRole("button", { name: "اقتراح مؤشرات للنتيجة O1" }));
    expect(await within(row("O1")).findByRole("alert")).toHaveTextContent("لكل نتيجة العدد الأقصى من المؤشرات الذي يسمح به المانح، فلا يوجد ما يُقترح.");
  });

  it("a failed run shows its translated error with Retry, which asks again", async () => {
    vi.mocked(api.getKpiSuggestions)
      .mockResolvedValueOnce(makeKpiSuggestionList())
      .mockResolvedValueOnce(makeKpiSuggestionList())
      .mockResolvedValue(makeKpiSuggestionList({ suggestions: [o1Suggestion] }));
    vi.mocked(api.requestKpiSuggestions)
      .mockResolvedValueOnce({ run: makeKpiRun({ status: "failed", errorCode: "ai_refused", suggestionCount: 0 }), suggestions: [], httpStatus: 200 })
      .mockResolvedValueOnce({ run: makeKpiRun({ id: "run-3", suggestionCount: 1 }), suggestions: [o1Suggestion], httpStatus: 200 });
    const user = userEvent.setup({ delay: null });
    renderChain();
    await user.click(await screen.findByRole("button", { name: "Suggest KPIs for O1" }));
    expect(await within(row("O1")).findByRole("alert")).toHaveTextContent("The AI declined this request. Try again, or add indicators from the library.");
    await user.click(within(row("O1")).getByRole("button", { name: "Try again" }));
    expect(api.requestKpiSuggestions).toHaveBeenLastCalledWith("p-1", { scope: "result", resultId: "o1" });
    expect(await within(row("O1")).findByRole("heading", { name: "Households with acceptable FCS" })).toBeInTheDocument();
    expect(within(row("O1")).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("times a run adopted from a cached list from when the list answered, not from now (TQ-07 re-check)", async () => {
    // The list was fetched 3 minutes ago; the run was then 30 s old by the server's clock: 3.5 minutes old now.
    const cachedAt = Date.now() - 3 * 60_000;
    const atCache = new Date(cachedAt).toISOString();
    const run = runningRun({ id: "run-cached", createdAt: new Date(cachedAt - 30_000).toISOString(), updatedAt: atCache, serverNow: atCache });
    const list = makeKpiSuggestionList({ activeRuns: [run] });
    vi.mocked(api.getKpiSuggestions).mockResolvedValue(list);
    vi.mocked(api.getKpiSuggestionRun).mockResolvedValue({ run: { ...run, serverNow: new Date().toISOString() }, suggestions: [] });
    const client = createTestQueryClient();
    client.setQueryData(queryKeys.kpiSuggestions("p-1"), list, { updatedAt: cachedAt });
    renderWithClient(<Chain />, client);
    // Past the 2-minute cap at once: "taking longer" and Refresh, rather than 3 more minutes of polling.
    await waitFor(() => expect(within(row("O1")).getAllByText("This is taking longer than expected.").length).toBeGreaterThan(0));
    expect(within(row("O1")).getByRole("button", { name: "Refresh" })).toBeInTheDocument();
  });

  it("resumes a framework run reported by the list after a reload and shows 'taking longer' past the cap", async () => {
    // Created 11 minutes ago by the server's clock (its last heartbeat is now).
    const old = new Date(Date.now() - 11 * 60_000).toISOString();
    const frameworkRun = runningRun({ id: "run-fw", scope: "framework", resultId: null, step: "model", createdAt: old });
    vi.mocked(api.getKpiSuggestions).mockResolvedValue(makeKpiSuggestionList({ activeRuns: [frameworkRun] }));
    vi.mocked(api.getKpiSuggestionRun).mockResolvedValue({ run: frameworkRun, suggestions: [] });
    const user = userEvent.setup({ delay: null });
    renderChain();
    expect(await screen.findByText("Preparing suggestions for all results")).toBeInTheDocument();
    expect(api.getKpiSuggestionRun).toHaveBeenCalledWith("run-fw");
    await waitFor(() => expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument());
    expect(screen.getAllByText("This is taking longer than expected.")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Suggest KPIs for O1" })).toHaveAttribute("aria-disabled", "true");
    const calls = vi.mocked(api.getKpiSuggestionRun).mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(vi.mocked(api.getKpiSuggestionRun).mock.calls.length).toBe(calls + 1));
  });

  it("a suggestion list that fails to load shows an alert with Retry, which loads it again", async () => {
    vi.mocked(api.getKpiSuggestions).mockRejectedValueOnce(new ApiError("Server error", 500));
    vi.mocked(api.getKpiSuggestions).mockResolvedValueOnce(makeKpiSuggestionList({ suggestions: [o1Suggestion] }));
    renderChain();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the KPI suggestions.");
    await userEvent.setup({ delay: null }).click(screen.getByRole("button", { name: "Try again" }));
    expect(await within(row("O1")).findByRole("heading", { name: "Households with acceptable FCS" })).toBeInTheDocument();
    expect(screen.queryByText("Could not load the KPI suggestions.")).not.toBeInTheDocument();
    expect(api.getKpiSuggestions).toHaveBeenCalledTimes(2);
  });

  it("shows the latest framework run's gaps and puts its suggestions under each result", async () => {
    const latest = makeKpiRun({ id: "run-fw", scope: "framework", resultId: null, frameworkWarnings: [
      { code: "accountability_missing", severity: "warning", message: "Humanitarian project without an accountability indicator.", params: {}, penalty: 0 },
    ] });
    const o2 = makeKpiSuggestion({ id: "s-o2", resultId: "o2", resultCode: "O2", runId: "run-fw", suggestion: { name: "Nutrition practice indicator" } });
    vi.mocked(api.getKpiSuggestions).mockResolvedValue(makeKpiSuggestionList({ suggestions: [o1Suggestion, o2], latestFrameworkRun: latest }));
    renderChain();
    expect(await screen.findByRole("region", { name: "Gaps Raqib noticed" })).toHaveTextContent("Humanitarian project without an accountability indicator.");
    expect(within(row("O2")).getByRole("heading", { name: "Nutrition practice indicator" })).toBeInTheDocument();
    expect(within(row("O1")).getByRole("heading", { name: "Households with acceptable FCS" })).toBeInTheDocument();
    expect(within(row("Goal")).queryByRole("article")).not.toBeInTheDocument();
  });

  it("removes an accepted card at once and refreshes the framework, suggestions and quality check", async () => {
    vi.mocked(api.getKpiSuggestions).mockResolvedValue(makeKpiSuggestionList({ suggestions: [o1Suggestion] }));
    vi.mocked(api.acceptKpiSuggestion).mockResolvedValue({ indicator: {} as never, suggestion: { ...o1Suggestion, status: "accepted" }, warnings: [] });
    const user = userEvent.setup({ delay: null });
    const { client } = renderChain();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await user.click(await screen.findByRole("button", { name: "Accept “Households with acceptable FCS”" }));
    await waitFor(() => expect(within(row("O1")).queryByRole("article")).not.toBeInTheDocument());
    const keys = invalidate.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey));
    expect(keys).toEqual(expect.arrayContaining([
      JSON.stringify(queryKeys.framework("p-1")),
      JSON.stringify(queryKeys.kpiSuggestions("p-1")),
      JSON.stringify(queryKeys.indicatorQuality("fw-1")),
    ]));
  });

  it("shows no KPI UI and calls nothing for donor viewers", async () => {
    vi.mocked(api.getUser).mockReturnValue(makeAuthUser({ role: "donor_viewer" }));
    renderChain();
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole("button", { name: /Suggest KPIs/ })).not.toBeInTheDocument();
    expect(api.getKpiAssistantStatus).not.toHaveBeenCalled();
    expect(api.getKpiSuggestions).not.toHaveBeenCalled();
  });

  it("alternatives of a rejected suggestion appear under its stub", async () => {
    // The server's pending list: the suggestion, then nothing after the rejection, then its alternative.
    let serverSuggestions: KpiSuggestion[] = [o1Suggestion];
    vi.mocked(api.getKpiSuggestions).mockImplementation(async () => makeKpiSuggestionList({ suggestions: serverSuggestions }));
    vi.mocked(api.rejectKpiSuggestion).mockImplementation(async () => {
      serverSuggestions = [];
      return { suggestion: { ...o1Suggestion, status: "rejected", rejectReason: "wording" } };
    });
    const alternative: KpiSuggestion = makeKpiSuggestion({ id: "s-alt", alternativeOfSuggestionId: "s-1", suggestion: { name: "Better worded indicator" } });
    vi.mocked(api.requestKpiSuggestions).mockImplementation(async () => {
      serverSuggestions = [alternative];
      return { run: makeKpiRun({ id: "run-alt", scope: "alternatives", sourceSuggestionId: "s-1" }), suggestions: [alternative], httpStatus: 200 };
    });
    const user = userEvent.setup({ delay: null });
    renderChain();
    await user.click(await screen.findByRole("button", { name: "Reject “Households with acceptable FCS”" }));
    await user.click(screen.getByRole("radio", { name: "Wording needs work" }));
    await user.click(screen.getByRole("button", { name: "Reject suggestion" }));
    await user.click(await screen.findByRole("button", { name: "Show alternatives to “Households with acceptable FCS”" }));
    expect(api.requestKpiSuggestions).toHaveBeenCalledWith("p-1", { scope: "alternatives", suggestionId: "s-1" });
    const group = await within(row("O1")).findByRole("list", { name: nameWithIsolatedPart("Alternatives to “Households with acceptable FCS”") });
    expect(within(group).getByRole("heading", { name: "Better worded indicator" })).toBeInTheDocument();
    expect(within(row("O1")).getByRole("heading", { name: "Rejected: Households with acceptable FCS" })).toBeInTheDocument();
  });
});
