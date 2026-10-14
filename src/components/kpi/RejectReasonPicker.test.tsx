import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { api } from "@/services/api";
import { ApiError } from "@/lib/apiError";
import { KpiAssistantContext, type KpiAssistantValue } from "@/hooks/useKpiAssistant";
import { RejectReasonPicker } from "@/components/kpi/RejectReasonPicker";
import { KpiResultSuggestions } from "@/components/kpi/KpiResultSuggestions";
import { renderWithClient } from "@/test/utils";
import { makeKpiAssistantValue, makeKpiSuggestion, sampleResultNodes } from "@/test/fixtures";

vi.mock("@/services/api", () => ({
  api: { rejectKpiSuggestion: vi.fn(), acceptKpiSuggestion: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
// The card's Edit & accept dialog is E8's; it is not under test here.
vi.mock("@/components/project/IndicatorDialog", () => ({ IndicatorDialog: ({ trigger }: { trigger: ReactNode }) => trigger }));

const suggestion = makeKpiSuggestion();

function renderPicker(props: Partial<Parameters<typeof RejectReasonPicker>[0]> = {}, value: KpiAssistantValue = makeKpiAssistantValue()) {
  const handlers = { onRejected: vi.fn(), onCancel: vi.fn(), onStale: vi.fn() };
  renderWithClient(
    <KpiAssistantContext.Provider value={value}>
      <RejectReasonPicker suggestion={suggestion} lang="en" {...handlers} {...props} />
    </KpiAssistantContext.Provider>,
  );
  return handlers;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.rejectKpiSuggestion).mockImplementation(async (id, body) => ({
    suggestion: { ...suggestion, id, status: "rejected", rejectReason: body.reason, rejectNote: body.note ?? null },
  }));
});

describe("RejectReasonPicker", () => {
  it("requires a reason before rejecting (two taps: reason, then confirm)", async () => {
    const user = userEvent.setup({ delay: null });
    const { onRejected } = renderPicker();
    const group = screen.getByRole("group", { name: "Why are you rejecting this suggestion?" });
    expect(within(group).getAllByRole("radio")).toHaveLength(6);
    expect(within(group).getByRole("radio", { name: "Not relevant" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Reject suggestion" }));
    expect(screen.getByText("Choose a reason.")).toBeInTheDocument();
    expect(group).toHaveAccessibleDescription("Choose a reason.");
    expect(api.rejectKpiSuggestion).not.toHaveBeenCalled();
    expect(onRejected).not.toHaveBeenCalled();
  });

  it("shows the consequence of each reason for a library indicator before confirming", async () => {
    const user = userEvent.setup({ delay: null });
    renderPicker();
    await user.click(screen.getByRole("radio", { name: "Not relevant" }));
    expect(screen.getByText("Raqib will stop suggesting this library indicator to your organisation.")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Too costly to measure" }));
    expect(screen.getByText("Raqib will stop suggesting this library indicator to your organisation.")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Not required by the donor" }));
    expect(screen.getByText("Raqib will stop suggesting it for your projects with the same donor type.")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Duplicate" }));
    expect(screen.getByText("Raqib will stop suggesting it for this project.")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Wording needs work" }));
    expect(screen.getByText("Raqib will stop suggesting it for this project.")).toBeInTheDocument();
    expect(screen.getByText("To keep the indicator with your own wording, use Edit & accept instead.")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Other reason" }));
    expect(screen.getByText("Raqib will stop suggesting this library indicator to your organisation.")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Other reason" })).toBeChecked();
    expect(api.rejectKpiSuggestion).not.toHaveBeenCalled();
  });

  it("explains that a custom indicator's reason only informs later suggestions", async () => {
    const user = userEvent.setup({ delay: null });
    renderPicker({ suggestion: makeKpiSuggestion({ libraryId: null, isCustom: true }) });
    await user.click(screen.getByRole("radio", { name: "Not relevant" }));
    expect(screen.getByText("Your reason is saved to improve future suggestions.")).toBeInTheDocument();
    expect(screen.queryByText(/stop suggesting/)).not.toBeInTheDocument();
  });

  it("sends the reason and the note and reports the rejected suggestion", async () => {
    const user = userEvent.setup({ delay: null });
    const { onRejected } = renderPicker();
    await user.click(screen.getByRole("radio", { name: "Too costly to measure" }));
    const note = screen.getByLabelText("Note (optional)");
    expect(note).toHaveAccessibleDescription("Do not include names, phone numbers or ID numbers.");
    expect(note).toHaveAttribute("maxLength", "1000");
    await user.type(note, "  Needs a survey we cannot fund  ");
    await user.click(screen.getByRole("button", { name: "Reject suggestion" }));
    await waitFor(() => expect(onRejected).toHaveBeenCalledTimes(1));
    expect(api.rejectKpiSuggestion).toHaveBeenCalledWith("s-1", { reason: "too_costly_to_measure", note: "Needs a survey we cannot fund" });
    expect(onRejected.mock.calls[0][0]).toMatchObject({ id: "s-1", status: "rejected", rejectReason: "too_costly_to_measure" });
    expect(toast.success).toHaveBeenCalledWith("Suggestion rejected");
  });

  it("cancels with the button or Escape", async () => {
    const user = userEvent.setup({ delay: null });
    const { onCancel } = renderPicker();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("reports a suggestion someone else decided (409 already_decided)", async () => {
    vi.mocked(api.rejectKpiSuggestion).mockRejectedValue(new ApiError("Already decided", 409, "already_decided"));
    const user = userEvent.setup({ delay: null });
    const { onStale, onRejected } = renderPicker();
    await user.click(screen.getByRole("radio", { name: "Duplicate" }));
    await user.click(screen.getByRole("button", { name: "Reject suggestion" }));
    await waitFor(() => expect(onStale).toHaveBeenCalledTimes(1));
    expect(onRejected).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Could not reject the suggestion", {
      description: "Someone already decided on this suggestion. The list was refreshed.",
    });
  });

  it("is translated into Arabic", () => {
    renderPicker({ lang: "ar" });
    expect(screen.getByRole("group", { name: "لماذا ترفض هذا الاقتراح؟" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "قياسه مكلف جدًا" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "رفض الاقتراح" })).toBeInTheDocument();
  });

  it("after reject the card becomes a stub that offers alternatives, with focus on the stub", async () => {
    const user = userEvent.setup({ delay: null });
    const request = vi.fn();
    const nodes = sampleResultNodes();
    renderWithClient(
      <KpiAssistantContext.Provider value={makeKpiAssistantValue({ request, pendingFor: (id) => (id === "o1" ? [suggestion] : []) })}>
        <KpiResultSuggestions result={nodes[1]} nodes={nodes} focusFallback={() => null} />
      </KpiAssistantContext.Provider>,
    );
    await user.click(screen.getByRole("button", { name: `Reject “${suggestion.suggestion.name}”` }));
    await user.click(screen.getByRole("radio", { name: "Not relevant" }));
    await user.click(screen.getByRole("button", { name: "Reject suggestion" }));
    const stub = await screen.findByRole("heading", { name: `Rejected: ${suggestion.suggestion.name}` });
    await waitFor(() => expect(stub).toHaveFocus());
    expect(screen.getByText("Would you like alternatives to this indicator?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: `Show alternatives to “${suggestion.suggestion.name}”` }));
    expect(request).toHaveBeenCalledWith({ scope: "alternatives", suggestionId: "s-1" });
  });
});
