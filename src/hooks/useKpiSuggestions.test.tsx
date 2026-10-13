import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { api } from "@/services/api";
import { ApiError } from "@/lib/apiError";
import { queryKeys } from "@/lib/queryKeys";
import { AuthProvider } from "@/contexts/AuthContext";
import { invalidateFrameworkData } from "@/hooks/useFrameworkData";
import {
  useAcceptKpiSuggestion,
  useIndicatorQuality,
  useKpiAssistantStatus,
  useRejectKpiSuggestion,
  useRequestKpiSuggestions,
} from "@/hooks/useKpiSuggestions";
import { createTestQueryClient } from "@/test/utils";
import {
  makeAuthUser,
  makeIndicatorQuality,
  makeKpiAssistantStatus,
  makeKpiRun,
  makeKpiSuggestion,
  makeKpiSuggestionList,
} from "@/test/fixtures";

vi.mock("@/services/api", () => ({
  api: {
    getUser: vi.fn(),
    getToken: vi.fn(() => "token"),
    getKpiAssistantStatus: vi.fn(),
    getIndicatorQuality: vi.fn(),
    requestKpiSuggestions: vi.fn(),
    acceptKpiSuggestion: vi.fn(),
    rejectKpiSuggestion: vi.fn(),
  },
}));

function setup(role = "me_officer") {
  vi.mocked(api.getUser).mockReturnValue(makeAuthUser({ role }));
  const client = createTestQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}><AuthProvider>{children}</AuthProvider></QueryClientProvider>
  );
  return { client, wrapper };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getKpiAssistantStatus).mockResolvedValue(makeKpiAssistantStatus());
  vi.mocked(api.getIndicatorQuality).mockResolvedValue([makeIndicatorQuality()]);
});

describe("useKpiSuggestions hooks", () => {
  it("refetches the quality check whenever the framework data is refreshed (indicator edit, approve, result change; UX-07)", async () => {
    const officer = setup();
    vi.mocked(api.getIndicatorQuality)
      .mockResolvedValueOnce([makeIndicatorQuality({ indicatorId: "i-9", qualityBand: "weak", qualityScore: 55, needsAlternatives: true })])
      .mockResolvedValue([makeIndicatorQuality({ indicatorId: "i-9" })]);
    const quality = renderHook(() => useIndicatorQuality("fw-1"), { wrapper: officer.wrapper });
    await waitFor(() => expect(quality.result.current.data?.[0].qualityBand).toBe("weak"));
    expect(api.getIndicatorQuality).toHaveBeenCalledTimes(1);
    // What IndicatorForm, IndicatorTable (Approve) and ResultsChainPanel call after a change.
    await invalidateFrameworkData(officer.client, { projectId: "p-1", frameworkId: "fw-1" });
    await waitFor(() => expect(quality.result.current.data?.[0].qualityBand).toBe("strong"));
    expect(api.getIndicatorQuality).toHaveBeenCalledTimes(2);
  });

  it("reads the status and the quality check for KPI roles only", async () => {
    const officer = setup();
    const status = renderHook(() => useKpiAssistantStatus(), { wrapper: officer.wrapper });
    const quality = renderHook(() => useIndicatorQuality("fw-1"), { wrapper: officer.wrapper });
    await waitFor(() => expect(status.result.current.data?.aiConfigured).toBe(true));
    await waitFor(() => expect(quality.result.current.data).toHaveLength(1));
    expect(api.getIndicatorQuality).toHaveBeenCalledWith("fw-1");

    vi.clearAllMocks();
    const donor = setup("donor_viewer");
    renderHook(() => useKpiAssistantStatus(), { wrapper: donor.wrapper });
    renderHook(() => useIndicatorQuality("fw-1"), { wrapper: donor.wrapper });
    renderHook(() => useIndicatorQuality(undefined), { wrapper: setup().wrapper });
    await new Promise((r) => setTimeout(r, 0));
    expect(api.getKpiAssistantStatus).not.toHaveBeenCalled();
    expect(api.getIndicatorQuality).not.toHaveBeenCalled();
  });

  it("puts a finished run's suggestions into the list and refetches it", async () => {
    const { client, wrapper } = setup();
    client.setQueryData(queryKeys.kpiSuggestions("p-1"), makeKpiSuggestionList());
    const fresh = makeKpiSuggestion({ id: "s-new" });
    vi.mocked(api.requestKpiSuggestions).mockResolvedValue({ run: makeKpiRun(), suggestions: [fresh], httpStatus: 200 });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useRequestKpiSuggestions("p-1"), { wrapper });
    await result.current.mutateAsync({ scope: "result", resultId: "o1" });
    expect(client.getQueryData<{ suggestions: unknown[] }>(queryKeys.kpiSuggestions("p-1"))?.suggestions).toEqual([fresh]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.kpiSuggestions("p-1") });
  });

  it("refreshes the status after a 503", async () => {
    const { client, wrapper } = setup();
    vi.mocked(api.requestKpiSuggestions).mockRejectedValue(new ApiError("Not set up", 503, "ai_not_configured"));
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useRequestKpiSuggestions("p-1"), { wrapper });
    await expect(result.current.mutateAsync({ scope: "framework" })).rejects.toBeInstanceOf(ApiError);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.kpiAssistantStatus });
  });

  it("drops an accepted or rejected suggestion from the list at once; a 409 refetches it", async () => {
    const { client, wrapper } = setup();
    const a = makeKpiSuggestion({ id: "a" });
    const b = makeKpiSuggestion({ id: "b" });
    client.setQueryData(queryKeys.kpiSuggestions("p-1"), makeKpiSuggestionList({ suggestions: [a, b] }));
    vi.mocked(api.acceptKpiSuggestion).mockResolvedValue({ indicator: {} as never, suggestion: { ...a, status: "accepted" }, warnings: [] });
    vi.mocked(api.rejectKpiSuggestion).mockResolvedValue({ suggestion: { ...b, status: "rejected" } });
    const accept = renderHook(() => useAcceptKpiSuggestion("p-1", "fw-1"), { wrapper });
    const reject = renderHook(() => useRejectKpiSuggestion("p-1"), { wrapper });
    await accept.result.current.mutateAsync({ id: "a" });
    expect(api.acceptKpiSuggestion).toHaveBeenCalledWith("a", undefined);
    await reject.result.current.mutateAsync({ id: "b", reason: "wording", note: "   " });
    expect(api.rejectKpiSuggestion).toHaveBeenCalledWith("b", { reason: "wording" });
    expect(client.getQueryData<{ suggestions: unknown[] }>(queryKeys.kpiSuggestions("p-1"))?.suggestions).toEqual([]);

    const invalidate = vi.spyOn(client, "invalidateQueries");
    vi.mocked(api.acceptKpiSuggestion).mockRejectedValue(new ApiError("Decided", 409, "already_decided"));
    await expect(accept.result.current.mutateAsync({ id: "c" })).rejects.toBeInstanceOf(ApiError);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.kpiSuggestions("p-1") });
  });
});
