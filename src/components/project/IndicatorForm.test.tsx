import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IndicatorForm } from "@/components/project/IndicatorForm";
import { IndicatorDialog } from "@/components/project/IndicatorDialog";
import { AuthProvider } from "@/contexts/AuthContext";
import { api } from "@/services/api";
import { toast } from "sonner";
import { createTestQueryClient, nameWithIsolatedPart, renderWithClient } from "@/test/utils";
import { queryKeys } from "@/lib/queryKeys";
import { ApiError } from "@/lib/apiError";
import { makeIndicator, makeKpiSuggestion, makeKpiWarning, sampleResultNodes } from "@/test/fixtures";
import type { AcceptKpiSuggestionResponse, AuthUser } from "@/types/api";

vi.mock("@/services/api", () => ({
  api: {
    addIndicatorToFramework: vi.fn(),
    updateIndicator: vi.fn(),
    acceptKpiSuggestion: vi.fn(),
    getLibraryEntry: vi.fn(),
    getUser: vi.fn(() => null),
    getToken: vi.fn(() => "token"),
  },
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

const nodes = sampleResultNodes();

/** The whole accessible description (the empty error message adds a trailing space). */
const exactly = (text: string) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`);

function renderForm(props: Partial<Parameters<typeof IndicatorForm>[0]> = {}) {
  const onSaved = vi.fn();
  const onCancel = vi.fn();
  const view = renderWithClient(
    <IndicatorForm
      mode="create"
      projectId="p-1"
      frameworkId="fw-1"
      resultNodes={nodes}
      lang="en"
      onSaved={onSaved}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { ...view, onSaved, onCancel };
}

/** Every reference-sheet field of knowledge/me-foundations.md §3, by its English label. */
const REFERENCE_SHEET_LABELS = [
  "Indicator name (English)",
  "Indicator name (Arabic)",
  "Result it measures",
  "Level",
  "Status",
  "Definition",
  "Unit",
  "Desired direction",
  "Numerator",
  "Denominator",
  "Formula",
  "Rounding",
  "Custom group key",
  "Collection method",
  "Frequency",
  "Means of verification",
  "Responsible person or role",
  "Baseline value",
  "Baseline date",
  "Baseline method",
  "Final target",
  "Current value",
  "Target justification",
  "Library ID",
  "Standard reference code",
  "Provenance",
  "Assumptions and data limitations",
  "Planned start",
  "Planned end",
  "Actual start",
  "Actual end",
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getLibraryEntry).mockRejectedValue(new ApiError("Library entry not found", 404));
});

describe("IndicatorForm", { timeout: 20_000 }, () => {
  it("renders every reference-sheet field with a visible label", () => {
    renderForm();
    for (const label of REFERENCE_SHEET_LABELS) {
      expect(screen.getByLabelText(new RegExp(`^${label.replace(/[()]/g, "\\$&")}\\*?$`)), label).toBeInTheDocument();
    }
    expect(screen.getByText("Disaggregation groups")).toBeInTheDocument();
    expect(screen.getByText("Intermediate targets")).toBeInTheDocument();
    expect(screen.getByText("Milestones")).toBeInTheDocument();
    // Sections are keyboard-accessible accordion buttons.
    for (const section of ["Basics", "Definition and calculation", "Disaggregation", "Data collection", "Baseline and targets", "Standard and source", "Assumptions", "Timeline and milestones"]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${section}`) })).toHaveAttribute("aria-expanded", "true");
    }
    // Glossary help text (me-foundations §1).
    expect(screen.getByText(/It names what is measured; it never contains the target/)).toBeInTheDocument();
    expect(screen.getByText(/Generic answers such as “project reports” are not acceptable/)).toBeInTheDocument();
    // The Arabic name is typed right-to-left.
    expect(screen.getByLabelText("Indicator name (Arabic)")).toHaveAttribute("dir", "rtl");
    // Result options show code and text, indented by depth.
    const resultSelect = screen.getByLabelText("Result it measures");
    expect(within(resultSelect).getByRole("option", { name: /O1\.1 · Households receive vouchers/ })).toBeInTheDocument();
  });

  it("submits the full payload on create", async () => {
    const user = userEvent.setup({ delay: null });
    const saved = makeIndicator({ id: "new-1" });
    vi.mocked(api.addIndicatorToFramework).mockResolvedValue(saved);
    const { onSaved } = renderForm();

    await user.type(screen.getByLabelText(/^Indicator name \(English\)/), "% of households with acceptable FCS");
    await user.type(screen.getByLabelText("Indicator name (Arabic)"), "نسبة الأسر");
    await user.selectOptions(screen.getByLabelText("Result it measures"), "o1");
    expect(screen.getByLabelText("Level")).toHaveValue("outcome");
    await user.type(screen.getByLabelText("Unit"), "percent");
    await user.selectOptions(screen.getByLabelText("Desired direction"), "increase");
    await user.type(screen.getByLabelText(/^Numerator/), "Households with FCS > 35");
    await user.type(screen.getByLabelText(/^Denominator/), "Surveyed households");
    await user.click(screen.getByRole("button", { name: "Add Sex" }));
    await user.selectOptions(screen.getByLabelText("Frequency"), "biannual");
    await user.type(screen.getByLabelText("Means of verification"), "Household survey, FCS module");
    await user.type(screen.getByLabelText("Baseline value"), "42%");
    fireEvent.change(screen.getByLabelText("Baseline date"), { target: { value: "2026-02-15" } });
    await user.type(screen.getByLabelText("Final target"), "55%");
    await user.click(screen.getByRole("button", { name: "Add intermediate target" }));
    fireEvent.change(screen.getByLabelText("Target 1 date"), { target: { value: "2026-12-31" } });
    await user.type(screen.getByLabelText("Target 1 value"), "48%");
    await user.type(screen.getByLabelText("Standard reference code"), "WFP CRF");
    await user.type(screen.getByLabelText("Assumptions and data limitations"), "Prices stay stable");
    await user.click(screen.getByRole("button", { name: "Add indicator" }));

    await waitFor(() => expect(api.addIndicatorToFramework).toHaveBeenCalledTimes(1));
    expect(api.addIndicatorToFramework).toHaveBeenCalledWith("fw-1", {
      indicatorText: "% of households with acceptable FCS",
      indicatorTextAr: "نسبة الأسر",
      level: "outcome",
      resultId: "o1",
      status: "not_started",
      definition: null,
      unit: "percent",
      direction: "increase",
      calculation: { numerator: "Households with FCS > 35", denominator: "Surveyed households" },
      disaggregation: ["sex"],
      dataCollectionMethod: "hh_survey",
      frequency: "biannual",
      meansOfVerification: "Household survey, FCS module",
      responsibility: null,
      baselineValue: "42%",
      baselineDate: "2026-02-15",
      baselineMethod: null,
      targetValue: "55%",
      targetJustification: null,
      intermediateTargets: [{ date: "2026-12-31", value: "48%" }],
      currentValue: null,
      libraryId: null,
      standardReferenceCode: "WFP CRF",
      assumptions: "Prices stay stable",
      startDate: null,
      endDate: null,
      actualStartDate: null,
      actualEndDate: null,
      milestones: null,
      provenance: "manual",
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
    expect(toast.success).toHaveBeenCalledWith("Indicator added");
  });

  it("sends only the changed fields on edit", async () => {
    const user = userEvent.setup({ delay: null });
    const indicator = makeIndicator();
    vi.mocked(api.updateIndicator).mockResolvedValue({ ...indicator, targetValue: "60%" });
    renderForm({ mode: "edit", indicator });

    const target = screen.getByLabelText("Final target");
    expect(target).toHaveValue("55%");
    await user.clear(target);
    await user.type(target, "60%");
    await user.click(screen.getByRole("button", { name: "Add Sex" }));
    await user.clear(screen.getByLabelText("Definition"));
    await user.click(screen.getByRole("button", { name: "Save indicator" }));

    await waitFor(() => expect(api.updateIndicator).toHaveBeenCalledTimes(1));
    expect(api.updateIndicator).toHaveBeenCalledWith("ind-1", {
      targetValue: "60%",
      definition: null,
      disaggregation: ["sex_of_household_head", "location", "sex"],
    });
    expect(toast.success).toHaveBeenCalledWith("Indicator saved");
  });

  it("sends the linked result's level with a new result and never sends provenance on edit", async () => {
    // The API answers 400 when level and result differ, and sets provenance itself on PATCH.
    const user = userEvent.setup({ delay: null });
    const indicator = makeIndicator();
    vi.mocked(api.updateIndicator).mockResolvedValue({ ...indicator, resultId: "o11", level: "output", libraryId: null, provenance: "manual" });
    renderForm({ mode: "edit", indicator });

    await user.selectOptions(screen.getByLabelText("Result it measures"), "o11");
    await user.clear(screen.getByLabelText("Library ID"));
    await user.click(screen.getByRole("button", { name: "Save indicator" }));

    await waitFor(() => expect(api.updateIndicator).toHaveBeenCalledTimes(1));
    expect(api.updateIndicator).toHaveBeenCalledWith("ind-1", { resultId: "o11", level: "output", libraryId: null });
  });

  it("does not call the API when nothing changed", async () => {
    const user = userEvent.setup({ delay: null });
    const { onCancel } = renderForm({ mode: "edit", indicator: makeIndicator() });
    await user.click(screen.getByRole("button", { name: "Save indicator" }));
    expect(api.updateIndicator).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith("No changes to save");
    expect(onCancel).toHaveBeenCalled();
  });

  it("validates before saving, announces the problems and focuses the first field", async () => {
    const user = userEvent.setup({ delay: null });
    renderForm();
    await user.type(screen.getByLabelText("Unit"), "%");
    await user.click(screen.getByRole("button", { name: "Add indicator" }));

    expect(api.addIndicatorToFramework).not.toHaveBeenCalled();
    const summary = screen.getByRole("alert");
    expect(summary).toHaveTextContent("Please fix 1 problem before saving.");
    expect(summary).toHaveTextContent("Enter the indicator name in English.");
    // The missing numerator and denominator are warnings, not problems.
    expect(summary).not.toHaveTextContent("numerator");
    const name = screen.getByLabelText(/^Indicator name \(English\)/);
    expect(name).toHaveAttribute("aria-invalid", "true");
    await waitFor(() => expect(name).toHaveFocus());
  });

  it("warns about a percentage without numerator and denominator but still saves it", async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(api.addIndicatorToFramework).mockResolvedValue(makeIndicator({ id: "new-2" }));
    renderForm();
    await user.type(screen.getByLabelText(/^Indicator name \(English\)/), "% of trainees employed");
    await user.type(screen.getByLabelText("Unit"), "%");

    const numerator = screen.getByLabelText("Numerator");
    expect(numerator).not.toHaveAttribute("aria-required");
    expect(numerator).not.toHaveAttribute("aria-invalid");
    expect(numerator).toHaveAccessibleDescription(exactly("Percentages need a numerator. You can save now and add it later."));
    expect(screen.getByLabelText("Denominator")).toHaveAccessibleDescription(exactly("Percentages need a denominator. You can save now and add it later."));

    await user.click(screen.getByRole("button", { name: "Add indicator" }));
    await waitFor(() => expect(api.addIndicatorToFramework).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.addIndicatorToFramework).mock.calls[0][1]).toMatchObject({ unit: "%", calculation: null });
  });

  it("does not block an edit on problems already in the stored indicator", async () => {
    const user = userEvent.setup({ delay: null });
    const indicator = makeIndicator({
      calculation: null,
      disaggregation: ["sex", "Bad Key"],
      milestones: [{ label: "", date: null, completed: false }],
    });
    vi.mocked(api.updateIndicator).mockResolvedValue({ ...indicator, targetValue: "60%" });
    renderForm({ mode: "edit", indicator });

    const target = screen.getByLabelText("Final target");
    await user.clear(target);
    await user.type(target, "60%");
    await user.click(screen.getByRole("button", { name: "Save indicator" }));
    await waitFor(() => expect(api.updateIndicator).toHaveBeenCalledWith("ind-1", { targetValue: "60%" }));
    expect(screen.queryByText(/Please fix/)).not.toBeInTheDocument();
  });

  it("blocks an edit when a changed field has a problem", async () => {
    const user = userEvent.setup({ delay: null });
    renderForm({ mode: "edit", indicator: makeIndicator({ disaggregation: ["sex", "Bad Key"] }) });
    await user.click(screen.getByRole("button", { name: "Add Age" }));
    await user.click(screen.getByRole("button", { name: "Save indicator" }));
    expect(api.updateIndicator).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("“Bad Key” is not a valid group key.");
  });

  it("checks dates inline when the field loses focus", async () => {
    renderForm();
    const start = screen.getByLabelText("Planned start");
    const end = screen.getByLabelText("Planned end");
    fireEvent.change(start, { target: { value: "2026-05-01" } });
    fireEvent.change(end, { target: { value: "2026-04-01" } });
    fireEvent.blur(end);
    expect(await screen.findByText("The planned end must be on or after the planned start.")).toBeInTheDocument();
    expect(end).toHaveAttribute("aria-invalid", "true");
  });

  it("adds and removes disaggregation chips and rejects invalid keys", async () => {
    const user = userEvent.setup({ delay: null });
    renderForm();
    expect(screen.getByText("Sex is the minimum for any indicator that counts or measures people.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add Sex" }));
    expect(screen.getByRole("button", { name: "Remove Sex" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Sex" })).not.toBeInTheDocument();

    const custom = screen.getByLabelText("Custom group key");
    await user.type(custom, "Female Head");
    await user.click(screen.getByRole("button", { name: "Add group" }));
    expect(screen.getByText(/“Female Head” is not a valid group key.*“female_head”/)).toBeInTheDocument();
    expect(custom).toHaveAttribute("aria-invalid", "true");

    await user.clear(custom);
    await user.type(custom, "female_head{Enter}");
    expect(screen.getByRole("button", { name: "Remove female_head" })).toBeInTheDocument();
    expect(custom).toHaveValue("");

    await user.type(custom, "sex");
    await user.click(screen.getByRole("button", { name: "Add group" }));
    expect(screen.getByText("“sex” is already in the list.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove Sex" }));
    expect(screen.queryByRole("button", { name: "Remove Sex" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Sex" })).toBeInTheDocument();
  });

  it("shows the pending-baseline hint only while the baseline is empty", async () => {
    const user = userEvent.setup({ delay: null });
    renderForm();
    expect(screen.getByText(/^Pending baseline\./)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Baseline value"), "12");
    expect(screen.queryByText(/^Pending baseline\./)).not.toBeInTheDocument();
  });

  it("labels AI-made indicators until the indicator itself is approved (D18)", () => {
    const aiIndicator = makeIndicator({ provenance: "ai_suggested", isApproved: false, aiModel: "claude-sonnet-5-5", promptVersion: "kpi-1.0" });
    const { unmount } = renderForm({ mode: "edit", indicator: aiIndicator });
    expect(screen.getAllByRole("note")[0]).toHaveTextContent("AI suggested — review before approval");
    expect(screen.getByLabelText("Provenance")).toHaveValue("AI suggested");
    expect(screen.getByLabelText("Provenance")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("AI model")).toHaveValue("claude-sonnet-5-5 · kpi-1.0");
    unmount();

    const approved = renderForm({ mode: "edit", indicator: makeIndicator({ provenance: "ai_generated", isApproved: true }) });
    expect(screen.queryByText("AI suggested — review before approval")).not.toBeInTheDocument();
    approved.unmount();

    renderForm({ mode: "edit", indicator: makeIndicator({ provenance: "manual", isApproved: false }) });
    expect(screen.queryByText("AI suggested — review before approval")).not.toBeInTheDocument();
  });

  it("sets the level from the linked result and locks it while linked", async () => {
    const user = userEvent.setup({ delay: null });
    renderForm();
    const level = screen.getByLabelText("Level");
    expect(level).toBeEnabled();
    await user.selectOptions(level, "impact");

    await user.selectOptions(screen.getByLabelText("Result it measures"), "o11");
    expect(level).toHaveValue("output");
    expect(level).toBeDisabled();
    expect(level).toHaveAccessibleDescription(exactly("Set by the linked result. To choose another level, remove the link first."));

    await user.selectOptions(screen.getByLabelText("Result it measures"), "");
    expect(level).toBeEnabled();
    expect(level).not.toHaveAccessibleDescription(/linked result/);
    await user.selectOptions(level, "activity");
    expect(level).toHaveValue("activity");
  });

  it("locks the level of a linked indicator on edit and explains it in Arabic", () => {
    renderForm({ mode: "edit", indicator: makeIndicator(), lang: "ar" });
    const level = screen.getByLabelText("المستوى");
    expect(level).toBeDisabled();
    expect(level).toHaveValue("outcome");
    expect(level).toHaveAccessibleDescription(exactly("تحدّده النتيجة المرتبطة. لاختيار مستوى آخر، أزِل الربط أولًا."));
  });

  it("shows the matching library entry for a library id", async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(api.getLibraryEntry).mockResolvedValue({ id: "FS-01", name: "Food Consumption Score", nameAr: "درجة الاستهلاك الغذائي" } as never);
    renderForm();
    await user.type(screen.getByLabelText("Library ID"), "FS-01");
    expect(await screen.findByText("In the library: Food Consumption Score", {}, { timeout: 2000 })).toBeInTheDocument();
    expect(api.getLibraryEntry).toHaveBeenCalledWith("FS-01");
    expect(screen.getByLabelText("Provenance")).toHaveValue("From the indicator library");
  });

  it("looks up and sends library ids in upper case", async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(api.getLibraryEntry).mockResolvedValue({ id: "FS-01", name: "Food Consumption Score", nameAr: null } as never);
    vi.mocked(api.addIndicatorToFramework).mockResolvedValue(makeIndicator({ id: "new-3" }));
    renderForm();
    await user.type(screen.getByLabelText(/^Indicator name \(English\)/), "Food Consumption Score");
    await user.type(screen.getByLabelText("Library ID"), " fs-01 ");
    expect(await screen.findByText("In the library: Food Consumption Score", {}, { timeout: 2000 })).toBeInTheDocument();
    expect(api.getLibraryEntry).toHaveBeenCalledWith("FS-01");
    expect(api.getLibraryEntry).not.toHaveBeenCalledWith("fs-01");

    await user.click(screen.getByRole("button", { name: "Add indicator" }));
    await waitFor(() => expect(api.addIndicatorToFramework).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.addIndicatorToFramework).mock.calls[0][1]).toMatchObject({ libraryId: "FS-01", provenance: "library" });
  });

  it("says an id is not in the library only when the library answers 404", async () => {
    const user = userEvent.setup({ delay: null });
    const { unmount } = renderForm();
    await user.type(screen.getByLabelText("Library ID"), "XX-99");
    expect(await screen.findByText(/This ID is not in the indicator library/, {}, { timeout: 2000 })).toBeInTheDocument();
    unmount();

    vi.mocked(api.getLibraryEntry).mockRejectedValue(new ApiError("API request failed", 500));
    renderForm();
    await user.type(screen.getByLabelText("Library ID"), "FS-01");
    expect(await screen.findByText(/We couldn't check the indicator library just now/, {}, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.queryByText(/not in the indicator library/)).not.toBeInTheDocument();
  });

  it("does not put destructive text on a tinted background (contrast)", async () => {
    const user = userEvent.setup({ delay: null });
    renderForm();
    await user.click(screen.getByRole("button", { name: "Add indicator" }));
    const summary = screen.getByRole("alert");
    expect(summary.className).not.toMatch(/bg-destructive/);
    const badge = screen.getByText("1 problem");
    expect(badge.className).not.toMatch(/bg-destructive/);
    expect(badge).toHaveClass("text-destructive");
  });

  it("shows the server's message when saving fails", async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(api.addIndicatorToFramework).mockRejectedValue(new Error('libraryId "XX-99" is not in the indicator library'));
    renderForm();
    await user.type(screen.getByLabelText(/^Indicator name \(English\)/), "Trainees");
    await user.click(screen.getByRole("button", { name: "Add indicator" }));
    expect(await screen.findByText('libraryId "XX-99" is not in the indicator library')).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith("We couldn't save the indicator. Check the message below and try again.");
  });

  it("says why in the toast when a save is refused because the project was archived meanwhile", async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(api.addIndicatorToFramework).mockRejectedValue(new ApiError("This project is archived. Restore it to make changes.", 409, "project_archived"));
    renderForm();
    await user.type(screen.getByLabelText(/^Indicator name \(English\)/), "Trainees");
    await user.click(screen.getByRole("button", { name: "Add indicator" }));
    // The page turns read-only and the dialog closes, so "check the message below" would point at nothing.
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      "This project is archived, so it is read-only. An organisation admin can restore it to make changes.",
    ));
    expect(toast.error).not.toHaveBeenCalledWith(expect.stringMatching(/Check the message below/));
  });

  it("renders right-to-left with Arabic labels in Arabic", () => {
    const { container } = renderForm({ lang: "ar" });
    const form = container.querySelector("form");
    expect(form).toHaveAttribute("dir", "rtl");
    expect(form).toHaveAttribute("lang", "ar");
    expect(screen.getByLabelText(/^اسم المؤشر \(بالإنجليزية\)/)).toHaveAttribute("dir", "ltr");
    expect(screen.getByLabelText("اسم المؤشر (بالعربية)")).toHaveAttribute("dir", "rtl");
    expect(screen.getByLabelText("وسيلة التحقق")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^خط الأساس والقيم المستهدفة/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "إضافة المؤشر" })).toBeInTheDocument();
  });
});

describe("IndicatorForm accept mode (Edit & accept, design 9.5)", { timeout: 20_000 }, () => {
  const suggestion = makeKpiSuggestion();

  function acceptResponse(overrides: Partial<AcceptKpiSuggestionResponse> = {}): AcceptKpiSuggestionResponse {
    return {
      indicator: makeIndicator({ id: "ind-9", provenance: "ai_suggested", resultId: "o1" }),
      suggestion: { ...suggestion, status: "accepted", indicatorId: "ind-9" },
      warnings: [],
      ...overrides,
    };
  }

  function renderAccept(props: Partial<Parameters<typeof IndicatorForm>[0]> = {}) {
    const onAccepted = vi.fn();
    const view = renderForm({ mode: "accept", suggestion, onAccepted, ...props });
    return { ...view, onAccepted };
  }

  beforeEach(() => {
    vi.mocked(api.getLibraryEntry).mockResolvedValue({ id: "FS-01", name: "Food Consumption Score", nameAr: null } as never);
  });

  it("starts from the suggestion's draft, with the level locked to the result and Raqib's provenance", async () => {
    renderAccept();
    expect(screen.getAllByRole("note")[0]).toHaveTextContent("AI suggested — review before approval");
    expect(screen.getByLabelText(/^Indicator name \(English\)/)).toHaveValue(suggestion.draft.indicatorText);
    expect(screen.getByLabelText("Indicator name (Arabic)")).toHaveValue(suggestion.draft.indicatorTextAr);
    expect(screen.getByLabelText("Result it measures")).toHaveValue("o1");
    // An accepted suggestion always measures a result: no "not linked" option.
    expect(within(screen.getByLabelText("Result it measures")).getAllByRole("option")).toHaveLength(nodes.length);
    expect(screen.getByLabelText("Level")).toHaveValue("outcome");
    expect(screen.getByLabelText("Level")).toBeDisabled();
    expect(screen.getByLabelText("Level")).toHaveAccessibleDescription(exactly("Set by the result the indicator measures. Choose another result to change it."));
    expect(screen.getByLabelText("Baseline value")).toHaveValue("42%");
    expect(screen.getByLabelText("Final target")).toHaveValue("");
    expect(screen.getByLabelText("Library ID")).toHaveValue("FS-01");
    const provenance = screen.getByLabelText("Provenance");
    expect(provenance).toHaveValue("AI suggested");
    expect(provenance).toHaveAttribute("readonly");
    expect(provenance).toHaveAccessibleDescription(exactly("Set by Raqib when you accept: AI suggested."));
    expect(screen.getByLabelText("AI model")).toHaveValue("claude-sonnet-5-5 · kpi-v2");
    expect(screen.getByRole("button", { name: "Accept indicator" })).toBeInTheDocument();
    // The library lookup confirms where the indicator comes from.
    expect(await screen.findByText("In the library: Food Consumption Score", {}, { timeout: 2000 })).toBeInTheDocument();
    expect(api.getLibraryEntry).toHaveBeenCalledWith("FS-01");
  });

  it("hides the fields that are not part of a suggestion, and says they are set after accepting (TQ-02)", () => {
    renderAccept();
    for (const label of ["Status", "Current value", "Actual start", "Actual end"]) {
      expect(screen.queryByLabelText(new RegExp(`^${label}\\*?$`)), label).not.toBeInTheDocument();
    }
    expect(screen.queryByText("Milestones")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add milestone/ })).not.toBeInTheDocument();
    expect(screen.getByText("Status, current value, actual dates and milestones are set after you accept the indicator.")).toBeInTheDocument();
    // The draft's own timeline stays editable.
    expect(screen.getByLabelText("Planned start")).toBeInTheDocument();
    expect(screen.getByLabelText("Planned end")).toBeInTheDocument();
  });

  it("accepts an unchanged draft without edits and shows the accepted toast", async () => {
    const user = userEvent.setup({ delay: null });
    const response = acceptResponse();
    vi.mocked(api.acceptKpiSuggestion).mockResolvedValue(response);
    const { onAccepted, onSaved } = renderAccept();
    await user.click(screen.getByRole("button", { name: "Accept indicator" }));
    await waitFor(() => expect(api.acceptKpiSuggestion).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.acceptKpiSuggestion).mock.calls[0]).toEqual(["s-1", undefined]);
    await waitFor(() => expect(onAccepted).toHaveBeenCalledWith(response));
    expect(toast.success).toHaveBeenCalledWith("Indicator added to O1");
    expect(onSaved).not.toHaveBeenCalled();
    expect(api.addIndicatorToFramework).not.toHaveBeenCalled();
  });

  it("sends only the fields the user changed", async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(api.acceptKpiSuggestion).mockResolvedValue(acceptResponse());
    const { onAccepted } = renderAccept();
    await user.clear(screen.getByLabelText("Baseline value"));
    await user.type(screen.getByLabelText("Final target"), "60%");
    await user.click(screen.getByRole("button", { name: "Accept indicator" }));
    await waitFor(() => expect(api.acceptKpiSuggestion).toHaveBeenCalledWith("s-1", { baselineValue: null, targetValue: "60%" }));
    await waitFor(() => expect(onAccepted).toHaveBeenCalled());
  });

  it("says when the result now has more indicators than the donor allows", async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(api.acceptKpiSuggestion).mockResolvedValue(acceptResponse({
      warnings: [makeKpiWarning("donor_cap_exceeded", { params: { code: "O1", count: 4, cap: 3 } })],
    }));
    renderAccept();
    await user.click(screen.getByRole("button", { name: "Accept indicator" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(
      "Indicator added to O1. O1 now has 4 indicators; the donor allows 3. Remove one.",
    ));
  });

  it("blocks on every problem, as on create", async () => {
    const user = userEvent.setup({ delay: null });
    renderAccept();
    await user.clear(screen.getByLabelText(/^Indicator name \(English\)/));
    await user.click(screen.getByRole("button", { name: "Accept indicator" }));
    expect(screen.getByRole("alert")).toHaveTextContent("1 problem");
    expect(api.acceptKpiSuggestion).not.toHaveBeenCalled();
  });

  it("closes with a toast when the suggestion was already decided (409)", async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(api.acceptKpiSuggestion).mockRejectedValue(new ApiError("Suggestion already decided", 409, "already_decided"));
    const { onAccepted, onCancel } = renderAccept();
    await user.click(screen.getByRole("button", { name: "Accept indicator" }));
    await waitFor(() => expect(onCancel).toHaveBeenCalled());
    expect(toast.error).toHaveBeenCalledWith("Someone already decided on this suggestion. The list was refreshed.");
    expect(onAccepted).not.toHaveBeenCalled();
  });

  it("closes with the archived message when the project was archived meanwhile (409 project_archived)", async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(api.acceptKpiSuggestion).mockRejectedValue(new ApiError("This project is archived", 409, "project_archived"));
    const { onAccepted, onCancel } = renderAccept();
    await user.click(screen.getByRole("button", { name: "Accept indicator" }));
    // The page turns read-only and the dialog closes with it, so the toast says why.
    await waitFor(() => expect(onCancel).toHaveBeenCalled());
    expect(toast.error).toHaveBeenCalledWith("This project is archived, so it is read-only. An organisation admin can restore it to make changes.");
    expect(onAccepted).not.toHaveBeenCalled();
  });

  it("closes with the duplicate message when the result already has the indicator (409 duplicate)", async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(api.acceptKpiSuggestion).mockRejectedValue(new ApiError("Duplicate", 409, "duplicate"));
    const { onCancel } = renderAccept();
    await user.click(screen.getByRole("button", { name: "Accept indicator" }));
    await waitFor(() => expect(onCancel).toHaveBeenCalled());
    expect(toast.error).toHaveBeenCalledWith("This result already has this indicator. The list was refreshed.");
  });

  it("keeps the form and the edits after a write conflict (409 conflict), so Accept works again", async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(api.acceptKpiSuggestion)
      .mockRejectedValueOnce(new ApiError("Write conflict", 409, "conflict"))
      .mockResolvedValueOnce(acceptResponse());
    const { onAccepted, onCancel } = renderAccept();
    await user.type(screen.getByLabelText("Final target"), "60%");
    await user.click(screen.getByRole("button", { name: "Accept indicator" }));
    expect(await screen.findByText("This change clashed with another change made at the same time, so nothing was saved. Try again.")).toBeInTheDocument();
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Final target")).toHaveValue("60%");
    await user.click(screen.getByRole("button", { name: "Accept indicator" }));
    await waitFor(() => expect(onAccepted).toHaveBeenCalled());
    expect(vi.mocked(api.acceptKpiSuggestion).mock.calls[1]).toEqual(["s-1", { targetValue: "60%" }]);
  });

  it("offers to replace the indicator an alternative stands for, and sends replaceSource only when ticked (SPEC-8)", async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(api.acceptKpiSuggestion)
      .mockRejectedValueOnce(new ApiError("Has data", 409, "source_has_data"))
      .mockResolvedValueOnce(acceptResponse({ replacedIndicatorId: null }));
    const client = createTestQueryClient();
    client.setQueryDefaults(queryKeys.framework("p-1"), { gcTime: Infinity });
    client.setQueryData(queryKeys.framework("p-1"), {
      id: "fw-1", projectId: "p-1", version: 1, status: "draft", name: null, aiModelUsed: null, generatedAt: "2026-10-01T00:00:00.000Z",
      approvedAt: null, approvedBy: null, resultNodes: nodes,
      indicators: [makeIndicator({ id: "ind-old", indicatorText: "Number of food baskets distributed" })],
    });
    const onAccepted = vi.fn();
    const onCancel = vi.fn();
    renderWithClient(
      <IndicatorForm mode="accept" projectId="p-1" frameworkId="fw-1" resultNodes={nodes} lang="en"
        suggestion={{ ...suggestion, alternativeOfIndicatorId: "ind-old" }} onAccepted={onAccepted} onSaved={vi.fn()} onCancel={onCancel} />,
      client,
    );
    const replace = screen.getByRole("checkbox", { name: nameWithIsolatedPart("Replace “Number of food baskets distributed” with this indicator") });
    expect(replace).not.toBeChecked();
    expect(replace).toHaveAccessibleDescription("The old indicator is removed from the framework. This works only while it has no data or linked services.");
    await user.click(replace);
    await user.click(screen.getByRole("button", { name: "Accept indicator" }));
    await waitFor(() => expect(api.acceptKpiSuggestion).toHaveBeenCalledWith("s-1", undefined, { replaceSource: true }));
    // The old indicator holds data: the form stays with the reason, so the officer can untick Replace and accept.
    expect(await screen.findByText(/already has data or linked services/)).toBeInTheDocument();
    expect(onCancel).not.toHaveBeenCalled();
    await user.click(replace);
    await user.click(screen.getByRole("button", { name: "Accept indicator" }));
    await waitFor(() => expect(onAccepted).toHaveBeenCalled());
    expect(vi.mocked(api.acceptKpiSuggestion).mock.calls[1]).toEqual(["s-1", undefined]);
  });

  it("shows no replace choice for a suggestion that is not an alternative to an existing indicator", () => {
    renderAccept();
    expect(screen.queryByRole("checkbox", { name: /^Replace/ })).not.toBeInTheDocument();
  });

  it("shows a refused field (400 not_editable) in the UI language, not the server's English", async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(api.acceptKpiSuggestion).mockRejectedValue(
      new ApiError("Invalid request: these fields cannot be changed when accepting a suggestion: status.", 400, "not_editable", { keys: ["status"] }),
    );
    const { onCancel } = renderAccept();
    await user.click(screen.getByRole("button", { name: "Accept indicator" }));
    expect(await screen.findByText(/cannot be set while accepting a suggestion/)).toBeInTheDocument();
    expect(screen.queryByText(/Invalid request/)).not.toBeInTheDocument();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("keeps the form open with the server's message for other failures", async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(api.acceptKpiSuggestion).mockRejectedValue(new ApiError("endDate must not be before startDate", 400));
    const { onCancel } = renderAccept();
    await user.click(screen.getByRole("button", { name: "Accept indicator" }));
    expect(await screen.findByText("endDate must not be before startDate")).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith("Could not accept the suggestion");
    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe("IndicatorDialog", () => {
  it("switches between English and Arabic with the toggle", async () => {
    const user = userEvent.setup({ delay: null });
    renderWithClient(
      <IndicatorDialog mode="create" projectId="p-1" frameworkId="fw-1" resultNodes={nodes} trigger={<button type="button">Open</button>} />,
    );
    await user.click(screen.getByRole("button", { name: "Open" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("dir", "ltr");
    expect(within(dialog).getByRole("heading", { name: "Add indicator" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "true");

    await user.click(within(dialog).getByRole("button", { name: "العربية" }));
    expect(dialog).toHaveAttribute("dir", "rtl");
    expect(dialog).toHaveAttribute("lang", "ar");
    expect(within(dialog).getByRole("heading", { name: "إضافة مؤشر" })).toBeInTheDocument();
    expect(within(dialog).getByLabelText("المستوى")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "إغلاق" })).toBeInTheDocument();
  });

  it("opens in the signed-in user's language", async () => {
    const user = userEvent.setup({ delay: null });
    const arabicUser: AuthUser = {
      id: "u1", email: "sara@example.org", fullName: "Sara", role: "me_officer", languagePref: "ar",
      organization: { id: "org-1", name: "Org" },
    };
    vi.mocked(api.getUser).mockReturnValue(arabicUser);
    renderWithClient(
      <AuthProvider>
        <IndicatorDialog mode="edit" projectId="p-1" frameworkId="fw-1" indicator={makeIndicator()} resultNodes={nodes}
          trigger={<button type="button">Open</button>} />
      </AuthProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Open" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("dir", "rtl");
    expect(within(dialog).getByRole("heading", { name: "تعديل المؤشر" })).toBeInTheDocument();
    expect(within(dialog).getByLabelText("اسم المؤشر (بالعربية)")).toHaveValue("نسبة الأسر ذات درجة استهلاك غذائي مقبولة");
  });
  it("edits and accepts a suggestion in the panel's language, then closes", async () => {
    const user = userEvent.setup({ delay: null });
    const suggestion = makeKpiSuggestion();
    vi.mocked(api.getLibraryEntry).mockResolvedValue({ id: "FS-01", name: "Food Consumption Score", nameAr: "درجة الاستهلاك الغذائي" } as never);
    const response: AcceptKpiSuggestionResponse = {
      indicator: makeIndicator({ id: "ind-9", provenance: "ai_suggested" }),
      suggestion: { ...suggestion, status: "accepted" },
      warnings: [],
    };
    vi.mocked(api.acceptKpiSuggestion).mockResolvedValue(response);
    const onAccepted = vi.fn();
    const onCloseAutoFocus = vi.fn();
    renderWithClient(
      <IndicatorDialog mode="accept" projectId="p-1" frameworkId="fw-1" resultNodes={nodes} suggestion={suggestion}
        initialLang="ar" onAccepted={onAccepted} onCloseAutoFocus={onCloseAutoFocus}
        trigger={<button type="button">Open</button>} />,
    );
    await user.click(screen.getByRole("button", { name: "Open" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("dir", "rtl");
    expect(within(dialog).getByRole("heading", { name: "تعديل الاقتراح وقبوله" })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "English" }));
    expect(within(dialog).getByRole("heading", { name: "Edit and accept the suggestion" })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Accept indicator" }));
    await waitFor(() => expect(onAccepted).toHaveBeenCalledWith(response));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(onCloseAutoFocus).toHaveBeenCalled();
  });
});
