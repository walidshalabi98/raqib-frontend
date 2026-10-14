import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResultsChainPanel } from "@/components/project/ResultsChainPanel";
import { AuthProvider } from "@/contexts/AuthContext";
import { api } from "@/services/api";
import { renderWithClient } from "@/test/utils";
import {
  makeAuthUser,
  makeIndicator,
  makeIndicatorQuality,
  makeKpiAssistantStatus,
  makeKpiRun,
  makeKpiSuggestion,
  makeKpiSuggestionList,
  makeKpiWarning,
  makeResultNode,
  sampleResultNodes,
} from "@/test/fixtures";
import { queryKeys } from "@/lib/queryKeys";
import type { Indicator, UserRole } from "@/types/api";
import { ApiError } from "@/lib/apiError";
import { toast } from "sonner";

vi.mock("@/services/api", () => ({
  api: {
    getFrameworkResults: vi.fn(),
    createResultNode: vi.fn(),
    updateResultNode: vi.fn(),
    deleteResultNode: vi.fn(),
    getKpiAssistantStatus: vi.fn(),
    getKpiSuggestions: vi.fn(),
    getKpiSuggestionRun: vi.fn(),
    requestKpiSuggestions: vi.fn(),
    acceptKpiSuggestion: vi.fn(),
    rejectKpiSuggestion: vi.fn(),
    getIndicatorQuality: vi.fn(),
    getLibraryEntry: vi.fn(),
    getUser: vi.fn(() => null),
    getToken: vi.fn(() => "token"),
  },
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

const optionLabels = (select: HTMLElement) => within(select).getAllByRole("option").map((o) => o.textContent);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getUser).mockReturnValue(null);
  vi.mocked(api.getFrameworkResults).mockResolvedValue(sampleResultNodes());
  vi.mocked(api.getKpiAssistantStatus).mockResolvedValue(makeKpiAssistantStatus());
  vi.mocked(api.getKpiSuggestions).mockResolvedValue(makeKpiSuggestionList());
  vi.mocked(api.getIndicatorQuality).mockResolvedValue([]);
});

function renderPanel() {
  return renderWithClient(<ResultsChainPanel projectId="p-1" frameworkId="fw-1" />);
}

describe("ResultsChainPanel", () => {
  it("lists results as an indented tree with level badges and indicator counts", async () => {
    renderPanel();
    expect(await screen.findByText("Reduced food insecurity")).toBeInTheDocument();
    expect(api.getFrameworkResults).toHaveBeenCalledWith("fw-1");
    const items = screen.getAllByRole("listitem");
    expect(items.map((li) => li.querySelector("span")?.textContent)).toEqual(["Goal", "O1", "O1.1", "O2"]);
    // O1.1 is nested inside O1, inside the goal.
    const goal = items[0];
    expect(within(goal).getByText("Households receive vouchers")).toBeInTheDocument();
    expect(within(items[1]).getByText("2 indicators")).toBeInTheDocument();
    expect(within(items[0]).getAllByText("Impact")[0]).toBeInTheDocument();
    // Activities cannot have children, outputs can.
    expect(screen.getByRole("button", { name: "Add a result under O1.1" })).toBeInTheDocument();
  });

  it("disables delete for a result with children and explains why", async () => {
    renderPanel();
    const del = await screen.findByRole("button", { name: "Delete O1" });
    expect(del).toHaveAttribute("aria-disabled", "true");
    expect(del).toHaveAccessibleDescription("O1 has child results. Delete or move them first.");
    await userEvent.setup({ delay: null }).click(del);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete O2" })).not.toHaveAttribute("aria-disabled");
  });

  it("limits level choices by the hierarchy rule", async () => {
    const user = userEvent.setup({ delay: null });
    renderPanel();

    // Under an outcome only an output fits.
    await user.click(await screen.findByRole("button", { name: "Add a result under O1" }));
    let dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Parent result")).toHaveValue("o1");
    const level = within(dialog).getByLabelText("Level");
    expect(optionLabels(level)).toEqual(["Output"]);
    expect(level).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    // At the top every level is allowed; choosing the goal as parent leaves only "Outcome".
    await user.click(screen.getByRole("button", { name: "Add result" }));
    dialog = screen.getByRole("dialog");
    const parent = within(dialog).getByLabelText("Parent result");
    expect(parent).toHaveValue("");
    expect(optionLabels(within(dialog).getByLabelText("Level"))).toEqual(["Impact", "Outcome", "Output", "Activity"]);
    // An output (O1.1) can be a parent; the goal, outcomes and outputs are offered.
    expect(optionLabels(parent)).toHaveLength(1 + 4);
    await user.selectOptions(parent, "g");
    expect(optionLabels(within(dialog).getByLabelText("Level"))).toEqual(["Outcome"]);
    expect(within(dialog).getByLabelText("Level")).toHaveValue("outcome");
  });

  it("creates a result under its parent", async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(api.createResultNode).mockResolvedValue(makeResultNode({ id: "o3", code: "O3", level: "outcome", parentId: "g" }));
    renderPanel();
    await user.click(await screen.findByRole("button", { name: "Add a result under Goal" }));
    const dialog = screen.getByRole("dialog");

    await user.type(within(dialog).getByLabelText(/^Code/), "o1");
    await user.type(within(dialog).getByLabelText(/^Result statement \(English\)/), "Improved access to water");
    await user.click(within(dialog).getByRole("button", { name: "Save result" }));
    expect(within(dialog).getByText("Another result already uses the code “o1”. Choose a different code.")).toBeInTheDocument();
    expect(api.createResultNode).not.toHaveBeenCalled();

    await user.clear(within(dialog).getByLabelText(/^Code/));
    await user.type(within(dialog).getByLabelText(/^Code/), "O3");
    await user.type(within(dialog).getByLabelText("Result statement (Arabic)"), "تحسين الوصول إلى المياه");
    await user.click(within(dialog).getByRole("button", { name: "Save result" }));

    await waitFor(() => expect(api.createResultNode).toHaveBeenCalledWith("fw-1", {
      level: "outcome",
      parentId: "g",
      code: "O3",
      text: "Improved access to water",
      textAr: "تحسين الوصول إلى المياه",
    }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("says why when a save is refused because the project was archived meanwhile, and stays generic otherwise", async () => {
    const user = userEvent.setup({ delay: null });
    const archived = "This project is archived, so it is read-only. An organisation admin can restore it to make changes.";
    vi.mocked(api.createResultNode).mockRejectedValueOnce(new ApiError("This project is archived. Restore it to make changes.", 409, "project_archived"));
    renderPanel();
    await user.click(await screen.findByRole("button", { name: "Add a result under Goal" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText(/^Code/), "O3");
    await user.type(within(dialog).getByLabelText(/^Result statement \(English\)/), "Improved access to water");
    await user.click(within(dialog).getByRole("button", { name: "Save result" }));
    // The page turns read-only and closes this dialog: the toast carries the reason, in the user's language.
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(archived));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(archived);

    vi.mocked(toast.error).mockClear();
    vi.mocked(api.createResultNode).mockRejectedValueOnce(new ApiError("Conflict", 409, "duplicate_code"));
    await user.click(within(dialog).getByRole("button", { name: "Save result" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("We couldn't save the result."));
  });

  it("edits only the changed fields and locks the level of a result with children", async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(api.updateResultNode).mockResolvedValue({ ...sampleResultNodes()[1], updatedIndicators: 0 });
    const { client } = renderPanel();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await user.click(await screen.findByRole("button", { name: "Edit O1" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Level")).toBeDisabled();
    expect(within(dialog).getByText("The level cannot change while this result has child results.")).toBeInTheDocument();
    const text = within(dialog).getByLabelText(/^Result statement \(English\)/);
    await user.clear(text);
    await user.type(text, "Improved household food consumption");
    await user.click(within(dialog).getByRole("button", { name: "Save result" }));
    await waitFor(() => expect(api.updateResultNode).toHaveBeenCalledWith("o1", { text: "Improved household food consumption" }));
    // A level change moves the result's indicators on the server, so the framework (with its indicators) is refetched.
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.framework("p-1") }));
  });

  it("deletes a leaf result after confirmation", async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(api.deleteResultNode).mockResolvedValue({ message: "Result deleted", unlinkedIndicators: 1 });
    renderPanel();
    await user.click(await screen.findByRole("button", { name: "Delete O1.1" }));
    const confirm = screen.getByRole("alertdialog");
    expect(within(confirm).getByText("Delete result O1.1?")).toBeInTheDocument();
    expect(within(confirm).getByText(/Its 1 indicator stays in the framework/)).toBeInTheDocument();
    await user.click(within(confirm).getByRole("button", { name: "Delete result" }));
    await waitFor(() => expect(api.deleteResultNode).toHaveBeenCalledWith("o11"));
    // The delete button is gone with its result; focus moves to the parent's row, not to <body>.
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: "Edit O1" })).toHaveFocus());
  });

  it("returns focus to the delete button when the deletion is cancelled", async () => {
    const user = userEvent.setup({ delay: null });
    renderPanel();
    const del = await screen.findByRole("button", { name: "Delete O2" });
    await user.click(del);
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancel" }));
    expect(api.deleteResultNode).not.toHaveBeenCalled();
    await waitFor(() => expect(del).toHaveFocus());
  });

  it("moves focus to the results chain heading after deleting a top-level result", async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(api.getFrameworkResults).mockResolvedValue([makeResultNode({ id: "g", code: "Goal", level: "impact" })]);
    vi.mocked(api.deleteResultNode).mockResolvedValue({ message: "Result deleted", unlinkedIndicators: 0 });
    renderPanel();
    await user.click(await screen.findByRole("button", { name: "Delete Goal" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete result" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Results chain" })).toHaveFocus());
  });

  it("shows an empty state with one action, and Arabic text when switched", async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(api.getFrameworkResults).mockResolvedValue([]);
    const { unmount } = renderPanel();
    expect(await screen.findByText("No results yet. Start with the goal (impact) the project contributes to.")).toBeInTheDocument();
    unmount();

    vi.mocked(api.getFrameworkResults).mockResolvedValue(sampleResultNodes());
    renderPanel();
    await screen.findByText("Reduced food insecurity");
    await user.click(screen.getByRole("button", { name: "العربية" }));
    const section = screen.getByRole("region", { name: "سلسلة النتائج" });
    expect(section).toHaveAttribute("dir", "rtl");
    expect(within(section).getByText("انخفاض انعدام الأمن الغذائي")).toHaveAttribute("lang", "ar");
    // English text stays when there is no Arabic text.
    expect(within(section).getByText("Improved food consumption")).toBeInTheDocument();
    expect(within(section).getAllByText("الأثر")[0]).toBeInTheDocument();
  });

  it("offers a retry when the results cannot be loaded", async () => {
    vi.mocked(api.getFrameworkResults).mockRejectedValue(new Error("boom"));
    renderPanel();
    expect(await screen.findByText("We couldn't load the results chain.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

// ------------------------------------------------------------------ KPI Assistant (Phase 4, design 9.5)

/** The panel for a signed-in user of `role` (the KPI UI depends on the role). */
function renderAs(role: UserRole, props: { indicators?: Indicator[]; readOnly?: boolean } = {}) {
  vi.mocked(api.getUser).mockReturnValue(makeAuthUser({ role }));
  return renderWithClient(
    <AuthProvider>
      <ResultsChainPanel projectId="p-1" frameworkId="fw-1" {...props} />
    </AuthProvider>,
  );
}

/** The list item of a result, found by its code (its own row, not a nested one). */
function resultItem(code: string): HTMLElement {
  const item = screen.getAllByRole("listitem").find((li) => li.querySelector("span")?.textContent === code);
  if (!item) throw new Error(`no result ${code}`);
  return item;
}

/** Text of the result's own part: its row and what sits under it, without the nested results. */
function ownText(item: HTMLElement): string {
  const clone = item.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(":scope > ul").forEach((ul) => ul.remove());
  return clone.textContent ?? "";
}

describe("ResultsChainPanel with the KPI Assistant", () => {
  it("offers Suggest KPIs for the whole framework and on goal, outcome and output rows only", async () => {
    vi.mocked(api.getFrameworkResults).mockResolvedValue([
      ...sampleResultNodes(),
      makeResultNode({ id: "a1", code: "A1.1.1", level: "activity", parentId: "o11", text: "Distribute vouchers" }),
    ]);
    renderAs("me_officer");
    expect(await screen.findByRole("button", { name: "Suggest KPIs for all results" })).toBeInTheDocument();
    for (const code of ["Goal", "O1", "O1.1", "O2"]) {
      expect(screen.getByRole("button", { name: `Suggest KPIs for ${code}` })).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: "Suggest KPIs for A1.1.1" })).not.toBeInTheDocument();
    await waitFor(() => expect(api.getKpiSuggestions).toHaveBeenCalledWith("p-1"));
  });

  it("asks for suggestions for one result from its row", async () => {
    const user = userEvent.setup({ delay: null });
    const run = makeKpiRun({ id: "run-2", resultId: "o2", status: "running", step: "retrieval", finishedAt: null });
    vi.mocked(api.requestKpiSuggestions).mockResolvedValue({ run, httpStatus: 202 });
    vi.mocked(api.getKpiSuggestionRun).mockResolvedValue({ run, suggestions: [] });
    renderAs("org_admin");
    await user.click(await screen.findByRole("button", { name: "Suggest KPIs for O2" }));
    expect(api.requestKpiSuggestions).toHaveBeenCalledWith("p-1", { scope: "result", resultId: "o2" });
    // Progress shows under O2.
    expect(await within(resultItem("O2")).findByText("Preparing suggestions for O2")).toBeInTheDocument();
  });

  it("shows suggestion cards under their own result, in English and in Arabic", async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(api.getKpiSuggestions).mockResolvedValue(makeKpiSuggestionList({
      suggestions: [makeKpiSuggestion({ id: "s-o2", resultId: "o2", resultCode: "O2", suggestion: { name: "Minimum dietary diversity for women", nameAr: "الحد الأدنى للتنوع الغذائي لدى النساء" } })],
    }));
    renderAs("me_officer");
    const list = await screen.findByRole("list", { name: "Suggested indicators for O2" });
    expect(within(list).getByRole("heading", { name: "Minimum dietary diversity for women" })).toBeInTheDocument();
    expect(resultItem("O2")).toContainElement(list);
    expect(ownText(resultItem("O1"))).not.toContain("Minimum dietary diversity for women");

    await user.click(screen.getByRole("button", { name: "العربية" }));
    const arabicList = screen.getByRole("list", { name: "المؤشرات المقترحة للنتيجة O2" });
    expect(within(arabicList).getByRole("heading", { name: "الحد الأدنى للتنوع الغذائي لدى النساء" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "اقتراح مؤشرات لجميع النتائج" })).toBeInTheDocument();
  });

  it("gives the header's Add result and Suggest KPIs buttons a 44 px touch target on phones", async () => {
    renderAs("me_officer");
    // 44 px below sm (UX_STANDARDS §7), the usual 36 px from sm up.
    expect(await screen.findByRole("button", { name: "Add result" })).toHaveClass("min-h-11", "sm:min-h-9");
    expect(await screen.findByRole("button", { name: "Suggest KPIs for all results" })).toHaveClass("min-h-11", "sm:min-h-9");
  });

  it("shows donor viewers no KPI UI and asks the API for nothing KPI-related", async () => {
    vi.mocked(api.getKpiSuggestions).mockResolvedValue(makeKpiSuggestionList({ suggestions: [makeKpiSuggestion()] }));
    renderAs("donor_viewer", { indicators: [makeIndicator({ provenance: "ai_suggested" })] });
    expect(await screen.findByText("Reduced food insecurity")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Suggest KPIs/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: /Suggested indicators/ })).not.toBeInTheDocument();
    // Existing controls are unchanged in Phase 4.
    expect(screen.getByRole("button", { name: "Add result" })).toBeInTheDocument();
    expect(api.getKpiAssistantStatus).not.toHaveBeenCalled();
    expect(api.getKpiSuggestions).not.toHaveBeenCalled();
    expect(api.getIndicatorQuality).not.toHaveBeenCalled();
  });

  it("offers suggestions for a new outcome once, and 'Not now' hides the prompt", async () => {
    const user = userEvent.setup({ delay: null });
    const o3 = makeResultNode({ id: "o3", code: "O3", level: "outcome", parentId: "g", text: "Improved access to water" });
    vi.mocked(api.createResultNode).mockResolvedValue(o3);
    vi.mocked(api.getFrameworkResults).mockResolvedValueOnce(sampleResultNodes()).mockResolvedValue([...sampleResultNodes(), o3]);
    vi.mocked(api.requestKpiSuggestions).mockResolvedValue({ run: makeKpiRun({ id: "run-3", resultId: "o3", suggestionCount: 0 }), suggestions: [], httpStatus: 200 });
    renderAs("me_officer");

    await user.click(await screen.findByRole("button", { name: "Add a result under Goal" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText(/^Code/), "O3");
    await user.type(within(dialog).getByLabelText(/^Result statement \(English\)/), "Improved access to water");
    await user.click(within(dialog).getByRole("button", { name: "Save result" }));

    const prompt = await screen.findByText("Raqib can suggest indicators for O3.");
    expect(prompt).toHaveAttribute("role", "status");
    expect(resultItem("O3")).toContainElement(prompt);
    // No model call until the user asks (design D7).
    expect(api.requestKpiSuggestions).not.toHaveBeenCalled();

    await user.click(within(resultItem("O3")).getAllByRole("button", { name: "Suggest KPIs for O3" })[1]);
    expect(api.requestKpiSuggestions).toHaveBeenCalledWith("p-1", { scope: "result", resultId: "o3" });
    await waitFor(() => expect(screen.queryByText("Raqib can suggest indicators for O3.")).not.toBeInTheDocument());
  });

  it("hides the new-result prompt with Not now and never prompts for activities", async () => {
    const user = userEvent.setup({ delay: null });
    const o3 = makeResultNode({ id: "o3", code: "O3", level: "outcome", parentId: "g" });
    vi.mocked(api.createResultNode).mockResolvedValue(o3);
    vi.mocked(api.getFrameworkResults).mockResolvedValueOnce(sampleResultNodes()).mockResolvedValue([...sampleResultNodes(), o3]);
    renderAs("me_officer");

    await user.click(await screen.findByRole("button", { name: "Add a result under Goal" }));
    let dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText(/^Code/), "O3");
    await user.type(within(dialog).getByLabelText(/^Result statement \(English\)/), "Improved access to water");
    await user.click(within(dialog).getByRole("button", { name: "Save result" }));
    await screen.findByText("Raqib can suggest indicators for O3.");
    await user.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByText("Raqib can suggest indicators for O3.")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Suggest KPIs for O3" })).toHaveFocus());

    const activity = makeResultNode({ id: "a1", code: "A1", level: "activity", parentId: "o11" });
    vi.mocked(api.createResultNode).mockResolvedValue(activity);
    vi.mocked(api.getFrameworkResults).mockResolvedValue([...sampleResultNodes(), o3, activity]);
    await user.click(screen.getByRole("button", { name: "Add a result under O1.1" }));
    dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText(/^Code/), "A1");
    await user.type(within(dialog).getByLabelText(/^Result statement \(English\)/), "Distribute vouchers");
    await user.click(within(dialog).getByRole("button", { name: "Save result" }));
    await screen.findByText("Result A1");
    expect(screen.queryByText(/Raqib can suggest indicators for/)).not.toBeInTheDocument();
    expect(api.requestKpiSuggestions).not.toHaveBeenCalled();
  });

  it("does not prompt for a new result while the AI is not configured", async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(api.getKpiAssistantStatus).mockResolvedValue(makeKpiAssistantStatus({ aiConfigured: false }));
    const o3 = makeResultNode({ id: "o3", code: "O3", level: "outcome", parentId: "g" });
    vi.mocked(api.createResultNode).mockResolvedValue(o3);
    vi.mocked(api.getFrameworkResults).mockResolvedValueOnce(sampleResultNodes()).mockResolvedValue([...sampleResultNodes(), o3]);
    renderAs("me_officer");
    expect(await screen.findByText("AI suggestions are not set up yet")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Add a result under Goal" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText(/^Code/), "O3");
    await user.type(within(dialog).getByLabelText(/^Result statement \(English\)/), "Improved access to water");
    await user.click(within(dialog).getByRole("button", { name: "Save result" }));
    await screen.findByText("Result O3");
    expect(screen.queryByText(/Raqib can suggest indicators for/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Suggest KPIs for O3" })).toHaveAttribute("aria-disabled", "true");
  });

  it("opens a result's indicators from its count, with source, AI label and quality", async () => {
    const user = userEvent.setup({ delay: null });
    const indicators = [
      makeIndicator({ id: "i-1", resultId: "o1", indicatorText: "% of households with acceptable FCS" }),
      makeIndicator({ id: "i-2", resultId: "o1", indicatorText: "Reduced coping strategy index", provenance: "ai_suggested", isApproved: false, libraryId: null, standardReferenceCode: null }),
      makeIndicator({ id: "i-3", resultId: "o2", indicatorText: "Dietary diversity score" }),
    ];
    vi.mocked(api.getIndicatorQuality).mockResolvedValue([makeIndicatorQuality({ indicatorId: "i-1", qualityScore: 95, qualityBand: "strong" })]);
    renderAs("me_officer", { indicators });
    const toggle = await screen.findByRole("button", { name: "2 indicators (O1)" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Reduced coping strategy index")).not.toBeInTheDocument();
    // A result without indicators has a plain count.
    expect(within(resultItem("O1.1")).getByText("0 indicators").tagName).toBe("SPAN");

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const list = document.getElementById(toggle.getAttribute("aria-controls") as string) as HTMLElement;
    expect(list).toHaveAccessibleName("2 indicators (O1)");
    expect(within(list).getByText("% of households with acceptable FCS")).toBeInTheDocument();
    expect(within(list).getByText("Reduced coping strategy index")).toBeInTheDocument();
    expect(within(list).queryByText("Dietary diversity score")).not.toBeInTheDocument();
    expect(within(list).getByText("AI suggested")).toBeInTheDocument();
    expect(within(list).getAllByRole("note")).toHaveLength(1);
    expect(await within(list).findByText("Quality: Strong (95/100)")).toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Reduced coping strategy index")).not.toBeInTheDocument();
  });

  it("opens a result with a weak indicator and asks for alternatives to it", async () => {
    const user = userEvent.setup({ delay: null });
    const weak = makeIndicator({ id: "i-9", resultId: "o2", indicatorText: "Increase dietary diversity to 60%" });
    vi.mocked(api.getIndicatorQuality).mockResolvedValue([makeIndicatorQuality({
      indicatorId: "i-9", qualityScore: 70, qualityBand: "review", needsAlternatives: true,
      warnings: [makeKpiWarning("target_in_name", { penalty: 15 })],
    })]);
    const run = makeKpiRun({ id: "run-alt", scope: "alternatives", resultId: "o2", sourceIndicatorId: "i-9", status: "running", step: "model", finishedAt: null });
    vi.mocked(api.requestKpiSuggestions).mockResolvedValue({ run, httpStatus: 202 });
    vi.mocked(api.getKpiSuggestionRun).mockResolvedValue({ run, suggestions: [] });
    renderAs("me_officer", { indicators: [weak] });

    const button = await screen.findByRole("button", { name: "Show alternatives to “Increase dietary diversity to 60%”" });
    expect(screen.getByRole("button", { name: "1 indicator (O2)" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Move the target out of the name.")).toBeInTheDocument();
    await user.click(button);
    expect(api.requestKpiSuggestions).toHaveBeenCalledWith("p-1", { scope: "alternatives", indicatorId: "i-9" });
  });
});

describe("ResultsChainPanel read-only", () => {
  it("shows the tree without add, edit or delete buttons", async () => {
    renderWithClient(<ResultsChainPanel projectId="p-1" frameworkId="fw-1" readOnly />);
    expect(await screen.findByText("Reduced food insecurity")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.queryByRole("button", { name: "Add result" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Add a result under / })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Edit / })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Delete / })).not.toBeInTheDocument();
    // The language toggle is reading, so it stays.
    expect(screen.getByRole("group")).toBeInTheDocument();
  });

  it("says there is no results chain yet, without offering to add one", async () => {
    vi.mocked(api.getFrameworkResults).mockResolvedValue([]);
    renderWithClient(<ResultsChainPanel projectId="p-1" frameworkId="fw-1" readOnly />);
    expect(await screen.findByText("No results chain yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add result" })).not.toBeInTheDocument();
  });
});

describe("ResultsChainPanel with the KPI Assistant on an archived project (readOnly)", () => {
  it("staff read the suggestions and the indicators' quality notes, with no KPI or results write control", async () => {
    vi.mocked(api.getKpiSuggestions).mockResolvedValue(makeKpiSuggestionList({
      suggestions: [makeKpiSuggestion({ id: "s-o2", resultId: "o2", resultCode: "O2", suggestion: { name: "Minimum dietary diversity for women" } })],
    }));
    vi.mocked(api.getIndicatorQuality).mockResolvedValue([
      makeIndicatorQuality({ indicatorId: "i-9", qualityBand: "weak", qualityScore: 60, needsAlternatives: true, warnings: [makeKpiWarning("target_in_name", { penalty: 15 })] }),
    ]);
    const weak = makeIndicator({ id: "i-9", resultId: "o1", indicatorText: "Increase dietary diversity to 60%", provenance: "ai_suggested", isApproved: false });
    renderAs("org_admin", { readOnly: true, indicators: [weak] });

    const card = await screen.findByRole("article", { name: "Minimum dietary diversity for women" });
    expect(resultItem("O2")).toContainElement(card);
    expect(within(resultItem("O2")).getByText(/This project is archived: you can read these suggestions/)).toBeInTheDocument();
    expect(within(card).queryAllByRole("button").map((b) => b.textContent)).toEqual(["Show Arabic name", "Why?"]);
    // The weak indicator opens with its notes, without the alternatives button.
    expect(await screen.findByText("Move the target out of the name.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Show alternatives/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Suggest KPIs/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^(Add result|Edit |Delete |Add a result under )/ })).not.toBeInTheDocument();
    expect(api.requestKpiSuggestions).not.toHaveBeenCalled();
  });
});

