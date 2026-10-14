import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { api } from "@/services/api";
import { ApiError } from "@/lib/apiError";
import { KpiAssistantContext } from "@/hooks/useKpiAssistant";
import { KpiResultSuggestions } from "@/components/kpi/KpiResultSuggestions";
import type { KpiSuggestion } from "@/types/api";
import { renderWithClient } from "@/test/utils";
import { makeKpiAssistantValue, makeKpiSuggestion, sampleResultNodes } from "@/test/fixtures";

// The real Edit & accept dialog (IndicatorDialog + IndicatorForm) around the suggestion cards (review UX-06).
vi.mock("@/services/api", () => ({
  api: {
    acceptKpiSuggestion: vi.fn(),
    rejectKpiSuggestion: vi.fn(),
    getLibraryEntry: vi.fn(),
    getUser: vi.fn(() => null),
    getToken: vi.fn(() => "token"),
  },
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const nodes = sampleResultNodes();
const o1 = nodes[1];
const first = makeKpiSuggestion({ id: "s-1", sortOrder: 1, suggestion: { name: "First indicator", nameAr: "المؤشر الأول" } });
const second = makeKpiSuggestion({ id: "s-2", sortOrder: 2, libraryId: "FS-02", suggestion: { name: "Second indicator", nameAr: "المؤشر الثاني" } });

function renderCards(items: KpiSuggestion[]) {
  return renderWithClient(
    <KpiAssistantContext.Provider value={makeKpiAssistantValue({ pendingFor: (id) => items.filter((s) => s.resultId === id) })}>
      <button type="button" id="fallback">Suggest KPIs for O1</button>
      <KpiResultSuggestions result={o1} nodes={nodes} focusFallback={() => document.getElementById("fallback")} />
    </KpiAssistantContext.Provider>,
  );
}

async function editAndAccept(name: string) {
  const user = userEvent.setup({ delay: null });
  await user.click(screen.getByRole("button", { name: `Edit & accept “${name}”` }));
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "Accept indicator" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getLibraryEntry).mockResolvedValue({ id: "FS-01", name: "Food Consumption Score", nameAr: null } as never);
});

describe("Edit & accept answered 409 (UX-06, WCAG 2.4.3)", { timeout: 20_000 }, () => {
  it.each(["already_decided", "stale"])("%s: closes the dialog, removes the card and moves focus to the next card", async (code) => {
    vi.mocked(api.acceptKpiSuggestion).mockRejectedValue(new ApiError("Conflict", 409, code));
    renderCards([first, second]);
    await editAndAccept("First indicator");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByRole("heading", { name: "First indicator" })).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("heading", { name: "Second indicator" })).toHaveFocus());
    expect(document.activeElement).not.toBe(document.body);
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it("already_decided on the last card: focus goes to the result's Suggest KPIs button", async () => {
    vi.mocked(api.acceptKpiSuggestion).mockRejectedValue(new ApiError("Decided", 409, "already_decided"));
    renderCards([first]);
    await editAndAccept("First indicator");
    await waitFor(() => expect(screen.getByRole("button", { name: "Suggest KPIs for O1" })).toHaveFocus());
  });

  it("duplicate: the card stays and focus returns to its Edit & accept button", async () => {
    vi.mocked(api.acceptKpiSuggestion).mockRejectedValue(new ApiError("Duplicate", 409, "duplicate"));
    renderCards([first, second]);
    await editAndAccept("First indicator");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "First indicator" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Edit & accept “First indicator”" })).toHaveFocus());
  });
});
