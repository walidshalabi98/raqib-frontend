import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { api } from "@/services/api";
import { ApiError } from "@/lib/apiError";
import { KpiAssistantContext, type KpiAssistantValue } from "@/hooks/useKpiAssistant";
import { KpiSuggestionCard } from "@/components/kpi/KpiSuggestionCard";
import type { AcceptKpiSuggestionResponse, Framework, KpiSuggestion } from "@/types/api";
import { createTestQueryClient, renderWithClient } from "@/test/utils";
import { queryKeys } from "@/lib/queryKeys";
import {
  makeIndicator,
  makeKpiAssistantValue,
  makeKpiSuggestion,
  makeKpiWarning,
  sampleResultNodes,
} from "@/test/fixtures";

const { dialogProps } = vi.hoisted(() => ({ dialogProps: vi.fn() }));

vi.mock("@/services/api", () => ({ api: { acceptKpiSuggestion: vi.fn(), rejectKpiSuggestion: vi.fn() } }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
// IndicatorDialog (E8) is replaced by its trigger; the props it receives are checked.
vi.mock("@/components/project/IndicatorDialog", () => ({
  IndicatorDialog: (props: { trigger: ReactNode }) => {
    dialogProps(props);
    return props.trigger;
  },
}));

const nodes = sampleResultNodes();
const o1 = nodes[1];
const NAME = "% of target households with an acceptable Food Consumption Score";
const NAME_AR = "نسبة الأسر المستهدفة ذات درجة استهلاك غذائي مقبولة";

function acceptResponse(overrides: Partial<AcceptKpiSuggestionResponse> = {}): AcceptKpiSuggestionResponse {
  return { indicator: makeIndicator({ id: "ind-new" }), suggestion: makeKpiSuggestion({ status: "accepted" }), warnings: [], ...overrides };
}

function renderCard(
  props: { suggestion?: KpiSuggestion; lang?: "en" | "ar"; framework?: Framework } = {},
  value: KpiAssistantValue = makeKpiAssistantValue({ lang: props.lang ?? "en" }),
) {
  const onDecided = vi.fn<(outcome: "accepted" | "rejected" | "dismissed", suggestion: KpiSuggestion) => void>();
  const client = createTestQueryClient();
  if (props.framework) {
    // In the app the indicator table observes the framework query, so it stays cached while the card is shown.
    client.setQueryDefaults(queryKeys.framework("p-1"), { gcTime: Infinity });
    client.setQueryData(queryKeys.framework("p-1"), props.framework);
  }
  const utils = renderWithClient(
    <KpiAssistantContext.Provider value={value}>
      <p id="ai-label">AI suggested — review before approval</p>
      <KpiSuggestionCard
        suggestion={props.suggestion ?? makeKpiSuggestion()}
        result={o1}
        nodes={nodes}
        aiLabelId="ai-label"
        lang={props.lang ?? "en"}
        onDecided={onDecided}
      />
    </KpiAssistantContext.Provider>,
    client,
  );
  return { ...utils, onDecided };
}

/** A framework whose indicator "ind-old" the alternative below would replace. */
const OLD_NAME = "Number of food baskets distributed";
const frameworkWithOld = (): Framework => ({
  id: "fw-1", projectId: "p-1", version: 1, status: "draft", name: null, aiModelUsed: null, generatedAt: "2026-10-01T00:00:00.000Z",
  approvedAt: null, approvedBy: null, resultNodes: nodes,
  indicators: [makeIndicator({ id: "ind-old", indicatorText: OLD_NAME, indicatorTextAr: "عدد السلال الغذائية الموزعة" })],
});
const alternativeOfOld = () => makeKpiSuggestion({ alternativeOfIndicatorId: "ind-old" });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.acceptKpiSuggestion).mockResolvedValue(acceptResponse());
});

describe("KpiSuggestionCard", () => {
  it("is an article named by its heading and described by the list's AI label", () => {
    renderCard();
    const card = screen.getByRole("article", { name: NAME });
    expect(card).toHaveAccessibleDescription("AI suggested — review before approval");
    expect(within(card).getByRole("heading", { level: 4, name: NAME })).toHaveAttribute("id", "kpi-card-s-1-name");
    expect(card.className).toContain("border-dashed");
  });

  it("shows the name in the panel language and the other language on demand", async () => {
    const user = userEvent.setup({ delay: null });
    const { unmount } = renderCard();
    const toggle = screen.getByRole("button", { name: "Show Arabic name" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByText(NAME_AR)).not.toBeInTheDocument();
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    const arabic = screen.getByText(NAME_AR);
    expect(arabic).toHaveAttribute("lang", "ar");
    expect(arabic).toHaveAttribute("dir", "rtl");
    unmount();

    renderCard({ lang: "ar" });
    const heading = screen.getByRole("heading", { level: 4 });
    expect(heading).toHaveTextContent(NAME_AR);
    expect(within(heading).getByText(NAME_AR)).toHaveAttribute("lang", "ar");
    await user.click(screen.getByRole("button", { name: "عرض الاسم الإنجليزي" }));
    expect(screen.getByText(NAME)).toHaveAttribute("lang", "en");
  });

  it("shows level, standard, quality and method badges, frequency and disaggregation", () => {
    renderCard();
    expect(screen.getByText("Outcome")).toBeInTheDocument();
    expect(screen.getByText("WFP CRF FCS")).toHaveAttribute("dir", "ltr");
    expect(screen.getByText("Quality: Strong (100/100)")).toBeInTheDocument();
    expect(screen.getByText("HH Survey")).toBeInTheDocument();
    expect(screen.getByText("Frequency: Twice a year")).toBeInTheDocument();
    const chips = screen.getByRole("list", { name: "Disaggregation" });
    expect(within(chips).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Sex of household head", "Location"]);
  });

  it("opens Why? with the proposed baseline and target and their basis", async () => {
    const user = userEvent.setup({ delay: null });
    renderCard();
    const why = screen.getByRole("button", { name: "Why?" });
    expect(why).toHaveAttribute("aria-expanded", "false");
    const details = document.getElementById(why.getAttribute("aria-controls") as string) as HTMLElement;
    expect(details).not.toBeVisible();
    await user.click(why);
    expect(screen.getByRole("button", { name: "Hide details" })).toHaveAttribute("aria-expanded", "true");
    expect(details).toBeVisible();
    expect(within(details).getByText("Proposed baseline")).toBeInTheDocument();
    expect(within(details).getByText("42%")).toHaveAttribute("lang", "en");
    expect(within(details).getByText("Found in the document text (proposal.pdf)")).toBeInTheDocument();
    expect(within(details).getByText("Proposed target")).toBeInTheDocument();
    expect(within(details).getByText("Target-setting method", { exact: false })).toBeInTheDocument();
    expect(within(details).getByText("Set the target after the baseline survey.")).toBeInTheDocument();
    expect(within(details).getAllByText("Proposed")).toHaveLength(2);
    expect(within(details).getByText("Household survey, FCS module")).toBeInTheDocument();
    expect(within(details).getByText("Uses the standard FCS thresholds.")).toBeInTheDocument();
    expect(within(details).getByText("AI confidence: high")).toBeInTheDocument();
    expect(within(details).queryByText("Written by the AI in English.")).not.toBeInTheDocument();
  });

  it("names a standard threshold, a pending baseline, a custom reason, and notes English text in Arabic", async () => {
    const user = userEvent.setup({ delay: null });
    renderCard({
      lang: "ar",
      suggestion: makeKpiSuggestion({
        libraryId: null,
        isCustom: true,
        suggestion: {
          baselineBasis: "none", baselineSuggestion: "", targetBasis: "standard_threshold", targetSuggestion: "15",
          standardReferenceCode: "Sphere minimum 15 l/p/d", customReason: "No library indicator covers water trucking.",
        },
      }),
    });
    await user.click(screen.getByRole("button", { name: "لماذا؟" }));
    expect(screen.getByText("خط الأساس قيد الانتظار")).toBeInTheDocument();
    expect(screen.getByText("حدّ معياري (Sphere minimum 15 l/p/d)")).toBeInTheDocument();
    expect(screen.getByText("سبب اقتراح مؤشر مخصّص")).toBeInTheDocument();
    expect(screen.getByText("No library indicator covers water trucking.")).toHaveAttribute("lang", "en");
    expect(screen.getByText("كتبها الذكاء الاصطناعي بالإنجليزية.")).toBeInTheDocument();
    // SPEC-4: a custom suggestion's badge says Custom; a code the model wrote is not shown as a standard reference.
    expect(screen.getByText("مخصّص")).toBeInTheDocument();
    expect(screen.queryAllByText("Sphere minimum 15 l/p/d")).toHaveLength(0);
  });

  it("lists its validation notes with icons", () => {
    renderCard({ suggestion: makeKpiSuggestion({ warnings: [makeKpiWarning("target_in_name"), makeKpiWarning("sex_added")] }) });
    const notes = screen.getAllByRole("listitem").filter((li) => li.querySelector("svg"));
    expect(notes.map((li) => li.textContent)).toEqual([
      "Warning: Move the target out of the name.",
      "Note: Sex disaggregation added because the indicator counts people.",
    ]);
  });

  it("names every action after the indicator", () => {
    renderCard();
    for (const name of [`Accept “${NAME}”`, `Edit & accept “${NAME}”`, `Reject “${NAME}”`, `Show alternatives to “${NAME}”`]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("accepts in one click, once, and reports the decision", async () => {
    let resolve: (r: AcceptKpiSuggestionResponse) => void = () => undefined;
    vi.mocked(api.acceptKpiSuggestion).mockReturnValue(new Promise((r) => { resolve = r; }));
    const user = userEvent.setup({ delay: null });
    const { onDecided } = renderCard();
    const accept = screen.getByRole("button", { name: `Accept “${NAME}”` });
    await user.click(accept);
    expect(accept).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: `Reject “${NAME}”` })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: `Edit & accept “${NAME}”` })).toHaveAttribute("aria-disabled", "true");
    await user.click(accept);
    expect(api.acceptKpiSuggestion).toHaveBeenCalledTimes(1);
    expect(api.acceptKpiSuggestion).toHaveBeenCalledWith("s-1", undefined);
    await act(async () => resolve(acceptResponse()));
    await waitFor(() => expect(onDecided).toHaveBeenCalledWith("accepted", expect.objectContaining({ id: "s-1" })));
    expect(toast.success).toHaveBeenCalledWith("Indicator added to O1");
  });

  it("says when the result now has more indicators than the donor allows", async () => {
    vi.mocked(api.acceptKpiSuggestion).mockResolvedValue(acceptResponse({
      warnings: [makeKpiWarning("donor_cap_exceeded", { params: { code: "O1", cap: 3, count: 4 } })],
    }));
    const user = userEvent.setup({ delay: null });
    renderCard();
    await user.click(screen.getByRole("button", { name: `Accept “${NAME}”` }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(
      "Indicator added to O1. O1 now has 4 indicators; the donor allows 3. Remove one.",
    ));
  });

  it("explains a duplicate (409) and keeps the card; a decided one leaves", async () => {
    vi.mocked(api.acceptKpiSuggestion).mockRejectedValueOnce(new ApiError("Duplicate", 409, "duplicate"));
    const user = userEvent.setup({ delay: null });
    const { onDecided } = renderCard();
    await user.click(screen.getByRole("button", { name: `Accept “${NAME}”` }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Could not accept the suggestion", {
      description: "This result already has this indicator. The list was refreshed.",
    }));
    expect(onDecided).not.toHaveBeenCalled();
    vi.mocked(api.acceptKpiSuggestion).mockRejectedValueOnce(new ApiError("Decided", 409, "already_decided"));
    await user.click(screen.getByRole("button", { name: `Accept “${NAME}”` }));
    await waitFor(() => expect(onDecided).toHaveBeenCalledWith("dismissed", expect.objectContaining({ id: "s-1" })));
  });

  it("asks whether an alternative replaces the indicator it is an alternative to (SPEC-8): Replace sends replaceSource", async () => {
    vi.mocked(api.acceptKpiSuggestion).mockResolvedValue(acceptResponse({ replacedIndicatorId: "ind-old" }));
    const user = userEvent.setup({ delay: null });
    const { onDecided } = renderCard({ suggestion: alternativeOfOld(), framework: frameworkWithOld() });
    await user.click(screen.getByRole("button", { name: `Accept “${NAME}”` }));
    const choice = screen.getByRole("region", { name: "Replace the old indicator?" });
    expect(within(choice).getByRole("heading", { name: "Replace the old indicator?" })).toHaveFocus();
    expect(choice).toHaveTextContent(`This suggestion is an alternative to “${OLD_NAME}”.`);
    expect(api.acceptKpiSuggestion).not.toHaveBeenCalled();
    await user.click(within(choice).getByRole("button", { name: "Replace the old indicator" }));
    await waitFor(() => expect(api.acceptKpiSuggestion).toHaveBeenCalledWith("s-1", undefined, { replaceSource: true }));
    await waitFor(() => expect(onDecided).toHaveBeenCalledWith("accepted", expect.objectContaining({ id: "s-1" })));
    expect(toast.success).toHaveBeenCalledWith("Indicator added to O1. The indicator it replaces was removed.");
  });

  it("Keep both accepts without replacing; Cancel returns to Accept; an indicator with data cannot be replaced (SPEC-8)", async () => {
    const user = userEvent.setup({ delay: null });
    const { onDecided } = renderCard({ suggestion: alternativeOfOld(), framework: frameworkWithOld(), lang: "ar" });
    const acceptAr = () => screen.getByRole("button", { name: /^قبول/ });
    await user.click(acceptAr());
    const choice = screen.getByRole("region", { name: "استبدال المؤشر القديم؟" });
    // The old indicator's Arabic name, isolated in its own <bdi>.
    expect(within(choice).getByText("عدد السلال الغذائية الموزعة").tagName).toBe("BDI");
    await user.click(within(choice).getByRole("button", { name: "إلغاء" }));
    expect(screen.queryByRole("region", { name: "استبدال المؤشر القديم؟" })).not.toBeInTheDocument();
    await waitFor(() => expect(acceptAr()).toHaveFocus());

    vi.mocked(api.acceptKpiSuggestion).mockRejectedValueOnce(new ApiError("Has data", 409, "source_has_data"));
    await user.click(acceptAr());
    await user.click(screen.getByRole("button", { name: "استبدال المؤشر القديم" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(onDecided).not.toHaveBeenCalled();
    // The choice stays, so the officer can keep both.
    await user.click(screen.getByRole("button", { name: "الإبقاء على الاثنين" }));
    await waitFor(() => expect(api.acceptKpiSuggestion).toHaveBeenLastCalledWith("s-1", undefined));
    await waitFor(() => expect(onDecided).toHaveBeenCalledWith("accepted", expect.objectContaining({ id: "s-1" })));
  });

  it("accepts at once when the indicator it was an alternative to is gone, or for any other suggestion", async () => {
    const user = userEvent.setup({ delay: null });
    renderCard({ suggestion: alternativeOfOld(), framework: { ...frameworkWithOld(), indicators: [] } });
    await user.click(screen.getByRole("button", { name: `Accept “${NAME}”` }));
    expect(screen.queryByRole("region", { name: "Replace the old indicator?" })).not.toBeInTheDocument();
    await waitFor(() => expect(api.acceptKpiSuggestion).toHaveBeenCalledWith("s-1", undefined));
  });

  it("asks for alternatives to this suggestion, unless a run for the result is active", async () => {
    const request = vi.fn();
    const user = userEvent.setup({ delay: null });
    const { unmount } = renderCard({}, makeKpiAssistantValue({ request }));
    await user.click(screen.getByRole("button", { name: `Show alternatives to “${NAME}”` }));
    expect(request).toHaveBeenCalledWith({ scope: "alternatives", suggestionId: "s-1" });
    unmount();
    request.mockClear();
    renderCard({}, makeKpiAssistantValue({
      request,
      runFor: (t) => ("scope" in t ? null : { run: null, scope: "result", resultId: "o1", step: "model", status: "running", startedAt: "", takingLonger: false, refresh: () => undefined }),
    }));
    const button = screen.getByRole("button", { name: `Show alternatives to “${NAME}”` });
    expect(button).toHaveAttribute("aria-disabled", "true");
    await user.click(button);
    expect(request).not.toHaveBeenCalled();
  });

  it("opens the reject picker inline and returns focus to Reject on cancel", async () => {
    const user = userEvent.setup({ delay: null });
    renderCard();
    await user.click(screen.getByRole("button", { name: `Reject “${NAME}”` }));
    expect(screen.getByRole("group", { name: "Why are you rejecting this suggestion?" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: `Accept “${NAME}”` })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.getByRole("button", { name: `Reject “${NAME}”` })).toHaveFocus());
  });

  it("opens Edit & accept in the panel language and reports an accept from the dialog", async () => {
    const { onDecided } = renderCard({ lang: "ar" });
    const props = dialogProps.mock.calls[dialogProps.mock.calls.length - 1]?.[0];
    expect(props).toMatchObject({ mode: "accept", projectId: "p-1", frameworkId: "fw-1", initialLang: "ar", defaultResultId: "o1" });
    expect(props.suggestion.id).toBe("s-1");
    expect(props.resultNodes).toBe(nodes);
    const preventDefault = vi.fn();
    act(() => props.onAccepted(acceptResponse()));
    props.onCloseAutoFocus({ preventDefault });
    expect(onDecided).toHaveBeenCalledWith("accepted", expect.objectContaining({ id: "s-1" }));
    expect(preventDefault).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: `تعديل وقبول «${NAME_AR}»` })).toBeInTheDocument();
  });
});
