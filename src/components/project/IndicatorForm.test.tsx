import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IndicatorForm } from "@/components/project/IndicatorForm";
import { IndicatorDialog } from "@/components/project/IndicatorDialog";
import { AuthProvider } from "@/contexts/AuthContext";
import { api } from "@/services/api";
import { toast } from "sonner";
import { renderWithClient } from "@/test/utils";
import { makeIndicator, sampleResultNodes } from "@/test/fixtures";
import type { AuthUser } from "@/types/api";

vi.mock("@/services/api", () => ({
  api: {
    addIndicatorToFramework: vi.fn(),
    updateIndicator: vi.fn(),
    getLibraryEntry: vi.fn(),
    getUser: vi.fn(() => null),
    getToken: vi.fn(() => "token"),
  },
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

const nodes = sampleResultNodes();

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
  vi.mocked(api.getLibraryEntry).mockRejectedValue(new Error("Library entry not found"));
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
    expect(summary).toHaveTextContent("Please fix 3 problems before saving.");
    expect(summary).toHaveTextContent("Enter the indicator name in English.");
    expect(summary).toHaveTextContent("Percentages need a numerator.");
    const name = screen.getByLabelText(/^Indicator name \(English\)/);
    expect(name).toHaveAttribute("aria-invalid", "true");
    await waitFor(() => expect(name).toHaveFocus());
    expect(screen.getByText("Percentages need a denominator.", { selector: "p" })).toBeInTheDocument();
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

  it("labels AI-suggested indicators until they are approved", () => {
    const { unmount } = renderForm({ mode: "edit", indicator: makeIndicator({ provenance: "ai_suggested", isApproved: false, aiModel: "claude-sonnet-5-5", promptVersion: "kpi-1.0" }) });
    expect(screen.getAllByText("AI suggested — review before approval").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Provenance")).toHaveValue("AI suggested");
    expect(screen.getByLabelText("Provenance")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("AI model")).toHaveValue("claude-sonnet-5-5 · kpi-1.0");
    unmount();

    renderForm({ mode: "edit", indicator: makeIndicator({ provenance: "ai_generated", isApproved: true }) });
    expect(screen.queryByText("AI suggested — review before approval")).not.toBeInTheDocument();
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

  it("shows the server's message when saving fails", async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(api.addIndicatorToFramework).mockRejectedValue(new Error('libraryId "XX-99" is not in the indicator library'));
    renderForm();
    await user.type(screen.getByLabelText(/^Indicator name \(English\)/), "Trainees");
    await user.click(screen.getByRole("button", { name: "Add indicator" }));
    expect(await screen.findByText('libraryId "XX-99" is not in the indicator library')).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith("We couldn't save the indicator. Check the message below and try again.");
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
});
