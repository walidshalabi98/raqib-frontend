import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { toast } from "sonner";
import AIWizard from "@/pages/AIWizard";
import { api } from "@/services/api";
import { AuthProvider } from "@/contexts/AuthContext";
import { ApiError } from "@/lib/apiError";
import { renderWithClient } from "@/test/utils";
import { makeAuthUser, makeKpiRun } from "@/test/fixtures";
import type { Framework, ProjectDetail, UserRole } from "@/types/api";

vi.mock("@/services/api", () => ({
  api: {
    getDocuments: vi.fn(),
    uploadDocument: vi.fn(),
    generateFramework: vi.fn(),
    checkGenerationStatus: vi.fn(),
    getFramework: vi.fn(),
    requestKpiSuggestions: vi.fn(),
    getKpiAssistantStatus: vi.fn(),
    getProject: vi.fn(),
    getUser: vi.fn(() => null),
    getToken: vi.fn(() => null),
  },
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

const FAILURE = "Framework generation did not finish (the run was interrupted). Generate a new version to try again.";

function renderWizard() {
  return renderWithClient(
    <MemoryRouter initialEntries={["/projects/p-1/wizard"]}>
      <Routes>
        <Route path="/projects/:id/wizard" element={<AIWizard />} />
        <Route path="/projects/:id" element={<p>Project page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getUser).mockReturnValue(null);
  vi.mocked(api.getDocuments).mockResolvedValue([]);
  vi.mocked(api.getProject).mockResolvedValue({ id: "p-1", status: "setup" } as ProjectDetail);
  vi.mocked(api.generateFramework).mockResolvedValue({ frameworkId: "fw-2", status: "processing" });
});

describe("AIWizard framework generation", () => {
  it("shows the backend's failure message, stops polling and offers the start button again", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.mocked(api.checkGenerationStatus)
        .mockResolvedValueOnce({ frameworkId: "fw-2", status: "processing" })
        .mockResolvedValue({ frameworkId: "fw-2", status: "failed", message: FAILURE });
      const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
      renderWizard();

      await user.click(await screen.findByRole("button", { name: /Upload & Process/ }));
      await vi.advanceTimersByTimeAsync(2_000);
      await vi.advanceTimersByTimeAsync(3_000);

      const alert = await screen.findByRole("alert");
      expect(within(alert).getByText("Framework generation failed")).toBeInTheDocument();
      expect(within(alert).getByText(FAILURE)).toBeInTheDocument();
      expect(alert.querySelector("svg")).not.toBeNull();
      expect(toast.error).toHaveBeenCalledWith("Framework generation failed", { description: FAILURE });
      // Back on the upload step: starting again is the retry.
      expect(screen.getByRole("button", { name: /Upload & Process/ })).toBeInTheDocument();

      const calls = vi.mocked(api.checkGenerationStatus).mock.calls.length;
      expect(calls).toBe(2);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(api.checkGenerationStatus).toHaveBeenCalledTimes(calls);
      expect(api.getFramework).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("moves to the review step with the framework the status returns", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const framework = {
        id: "fw-2",
        indicators: [{ id: "i-1", indicatorText: "% of youth employed", level: "outcome", dataCollectionMethod: "hh_survey", targetValue: null }],
      } as unknown as Framework;
      vi.mocked(api.checkGenerationStatus).mockResolvedValue({ frameworkId: "fw-2", status: "completed", framework });
      const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
      renderWizard();

      await user.click(await screen.findByRole("button", { name: /Upload & Process/ }));
      await vi.advanceTimersByTimeAsync(3_000);
      expect(await screen.findByText("% of youth employed")).toBeInTheDocument();
      expect(api.getFramework).not.toHaveBeenCalled();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("warns that names and addresses are not removed, next to the upload, and refuses .doc files", async () => {
    renderWizard();
    const warning = await screen.findByText(/Raqib cannot remove names or addresses/);
    const input = document.querySelector('input[type="file"]');
    expect(input).toHaveAttribute("accept", ".pdf,.docx,.xlsx");
    expect(input).toHaveAttribute("aria-describedby", warning.parentElement?.id);
  });
});

describe("AIWizard alternatives (KPI Assistant, design 9.5)", () => {
  const framework = {
    id: "fw-2",
    indicators: [{ id: "i-1", indicatorText: "% of youth employed", level: "outcome", dataCollectionMethod: "hh_survey", targetValue: null }],
  } as unknown as Framework;
  const ALTERNATIVES = "Show alternatives to “% of youth employed”";

  /** Renders the wizard for a user of `role` and runs generation until the review step. */
  async function toReview(role: UserRole = "me_officer") {
    vi.mocked(api.getUser).mockReturnValue(makeAuthUser({ role }));
    vi.mocked(api.checkGenerationStatus).mockResolvedValue({ frameworkId: "fw-2", status: "completed", framework });
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    renderWithClient(
      <AuthProvider>
        <MemoryRouter initialEntries={["/projects/p-1/wizard"]}>
          <Routes>
            <Route path="/projects/:id/wizard" element={<AIWizard />} />
            <Route path="/projects/:id" element={<p>Project page</p>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );
    await user.click(await screen.findByRole("button", { name: /Upload & Process/ }));
    await vi.advanceTimersByTimeAsync(3_000);
    await screen.findByText("% of youth employed");
    return user;
  }

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("asks the KPI Assistant for alternatives and links to the framework tab", async () => {
    const run = makeKpiRun({ id: "run-alt", scope: "alternatives", resultId: "o1", sourceIndicatorId: "i-1", status: "running", step: "model", finishedAt: null });
    vi.mocked(api.requestKpiSuggestions).mockResolvedValue({ run, httpStatus: 202 });
    const user = await toReview();
    await user.click(screen.getByRole("button", { name: ALTERNATIVES }));
    await waitFor(() => expect(api.requestKpiSuggestions).toHaveBeenCalledWith("p-1", { scope: "alternatives", indicatorId: "i-1" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    const [message, options] = vi.mocked(toast.success).mock.calls[0] as unknown as [string, { action: { label: string; onClick: () => void } }];
    expect(message).toBe("Alternatives are being prepared. Review them on the framework page.");
    expect(options.action.label).toBe("Open the framework");
    // No "check back shortly" stub any more.
    expect(toast.success).not.toHaveBeenCalledWith(expect.stringMatching(/check back/));
    options.action.onClick();
    expect(await screen.findByText("Project page")).toBeInTheDocument();
  });

  it.each([
    ["503 not configured", new ApiError("AI is not configured", 503, "ai_not_configured"),
      "AI suggestions are not set up yet. Ask your administrator to add the Anthropic API key."],
    ["503 without a code", new ApiError("Service unavailable", 503),
      "AI suggestions are not set up yet. Ask your administrator to add the Anthropic API key."],
    ["422 not linked to a result", new ApiError("Link the indicator to a result first.", 422, "not_suggestable"),
      "Raqib suggests indicators for goals, outcomes and outputs only. Link the indicator to one of them first."],
    ["422 nothing to suggest", new ApiError("Nothing to suggest", 422, "nothing_to_suggest"),
      "Every result already has as many indicators as allowed, so there is nothing to suggest."],
    ["422 nothing to suggest (donor limit)", new ApiError("Nothing to suggest", 422, "nothing_to_suggest", { reason: "donor_cap" }),
      "Every result already has as many indicators as the donor allows, so there is nothing to suggest."],
    ["409 stale", new ApiError("Stale", 409, "stale"), "The framework changed while suggestions were prepared. Try again."],
    ["409 run in progress", new ApiError("Running", 409, "run_in_progress", { runId: "run-1" }), "Suggestions are already being prepared here."],
    ["429 without a code", new ApiError("Too many requests", 429), "Too many requests right now. Wait a minute and try again."],
    ["429 organisation limit", new ApiError("Limit", 429, "rate_limited", { scope: "organisation" }),
      "Your organisation has reached its hourly limit of KPI suggestions. Try again later."],
    ["429 personal limit", new ApiError("Limit", 429, "rate_limited", { scope: "user" }),
      "You have reached your hourly limit of AI requests (KPI suggestions, frameworks, reports and analyses count together). Try again later."],
    ["429 budget", new ApiError("Budget", 429, "budget_reached"),
      "Your organisation has reached today's AI budget. Try again tomorrow or ask your administrator."],
  ])("shows a translated error for %s", async (_case, error, message) => {
    vi.mocked(api.requestKpiSuggestions).mockRejectedValue(error);
    const user = await toReview();
    await user.click(screen.getByRole("button", { name: ALTERNATIVES }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("says how many alternatives are ready when the run finished within the wait (200)", async () => {
    vi.mocked(api.requestKpiSuggestions).mockResolvedValue({
      run: makeKpiRun({ scope: "alternatives", sourceIndicatorId: "i-1", status: "completed", suggestionCount: 2 }),
      suggestions: [],
      httpStatus: 200,
    });
    const user = await toReview();
    await user.click(screen.getByRole("button", { name: ALTERNATIVES }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    const [message, options] = vi.mocked(toast.success).mock.calls[0] as unknown as [string, { action: { label: string } }];
    expect(message).toBe("2 alternatives ready. Review them on the framework page.");
    expect(options.action.label).toBe("Open the framework");
    expect(toast.success).not.toHaveBeenCalledWith("Alternatives are being prepared. Review them on the framework page.", expect.anything());
  });

  it("says that no alternatives were found when the finished run has none (200, suggestionCount 0)", async () => {
    vi.mocked(api.requestKpiSuggestions).mockResolvedValue({
      run: makeKpiRun({ scope: "alternatives", sourceIndicatorId: "i-1", status: "completed", suggestionCount: 0 }),
      suggestions: [],
      httpStatus: 200,
    });
    const user = await toReview();
    await user.click(screen.getByRole("button", { name: ALTERNATIVES }));
    await waitFor(() => expect(toast.info).toHaveBeenCalledWith(
      "No alternatives found for this indicator. Nothing else in the library fits, or your organisation rejected the matches.",
    ));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("reports a run that failed within the wait (200 with a failed run)", async () => {
    vi.mocked(api.requestKpiSuggestions).mockResolvedValue({
      run: makeKpiRun({ scope: "alternatives", sourceIndicatorId: "i-1", status: "failed", errorCode: "ai_refused" }),
      suggestions: [],
      httpStatus: 200,
    });
    const user = await toReview();
    await user.click(screen.getByRole("button", { name: ALTERNATIVES }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("The AI declined this request. Try again, or add indicators from the library."));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("does not offer alternatives to donor viewers", async () => {
    await toReview("donor_viewer");
    expect(screen.queryByRole("button", { name: ALTERNATIVES })).not.toBeInTheDocument();
  });
});

describe("AIWizard on an archived project", () => {
  it("sends the user back to the read-only project page without loading or changing anything", async () => {
    vi.mocked(api.getProject).mockResolvedValue({ id: "p-1", status: "archived" } as ProjectDetail);
    renderWizard();
    expect(await screen.findByText("Project page")).toBeInTheDocument();
    expect(api.getDocuments).not.toHaveBeenCalled();
    expect(api.generateFramework).not.toHaveBeenCalled();
  });
});
