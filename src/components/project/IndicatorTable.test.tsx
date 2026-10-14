import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { IndicatorTable } from "@/components/project/IndicatorTable";
import { AuthProvider } from "@/contexts/AuthContext";
import { api } from "@/services/api";
import { renderWithClient } from "@/test/utils";
import { makeAuthUser, makeIndicator, makeKpiAssistantStatus, makeKpiSuggestionList, sampleResultNodes } from "@/test/fixtures";
import type { AuthUser, Framework, FrameworkStatus, Indicator, UserRole } from "@/types/api";

vi.mock("@/services/api", () => ({
  api: {
    getFramework: vi.fn(),
    getFrameworkResults: vi.fn(),
    approveIndicator: vi.fn(),
    getKpiAssistantStatus: vi.fn(),
    getKpiSuggestions: vi.fn(),
    getIndicatorQuality: vi.fn(),
    getUser: vi.fn(() => null),
    getToken: vi.fn(() => "token"),
  },
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

const AI_LABEL = "AI suggested — review before approval";

function framework(status: FrameworkStatus, indicators: Indicator[] = [makeIndicator({ provenance: "ai_generated", isApproved: false })]): Framework {
  return {
    id: "fw-1",
    projectId: "p-1",
    version: 1,
    status,
    name: "Logframe",
    aiModelUsed: "claude-sonnet-5-5",
    generatedAt: "2026-01-01T00:00:00.000Z",
    approvedAt: null,
    approvedBy: null,
    resultNodes: sampleResultNodes(),
    indicators,
  };
}

function renderAs(role: UserRole) {
  vi.mocked(api.getUser).mockReturnValue(makeAuthUser({ role }));
  return renderWithClient(<AuthProvider><IndicatorTable projectId="p-1" /></AuthProvider>);
}

/** The table row of an indicator. */
function rowOf(name: string): HTMLElement {
  const row = screen.getAllByRole("row").find((r) => within(r).queryByText(name) && r.closest("tbody"));
  if (!row) throw new Error(`no row for ${name}`);
  return row;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getUser).mockReturnValue(null);
  vi.mocked(api.getFrameworkResults).mockResolvedValue(sampleResultNodes());
  vi.mocked(api.getKpiAssistantStatus).mockResolvedValue(makeKpiAssistantStatus());
  vi.mocked(api.getKpiSuggestions).mockResolvedValue(makeKpiSuggestionList());
  vi.mocked(api.getIndicatorQuality).mockResolvedValue([]);
});

describe("IndicatorTable", () => {
  it("labels unapproved AI-made indicators while the framework is under review", async () => {
    vi.mocked(api.getFramework).mockResolvedValue(framework("client_review"));
    renderWithClient(<IndicatorTable projectId="p-1" />);
    expect(await screen.findByText(AI_LABEL)).toBeInTheDocument();
  });

  it.each(["approved", "active"] as const)("keeps the AI label on an unapproved indicator when the framework is %s (D18)", async (status) => {
    vi.mocked(api.getFramework).mockResolvedValue(framework(status));
    renderWithClient(<IndicatorTable projectId="p-1" />);
    expect(await screen.findByText(AI_LABEL)).toBeInTheDocument();
  });

  it("drops the AI label once the indicator itself is approved", async () => {
    vi.mocked(api.getFramework).mockResolvedValue(framework("client_review", [makeIndicator({ provenance: "ai_suggested", isApproved: true })]));
    renderWithClient(<IndicatorTable projectId="p-1" />);
    expect(await screen.findByText("% of households with acceptable FCS")).toBeInTheDocument();
    expect(screen.queryByText(AI_LABEL)).not.toBeInTheDocument();
  });

  it("shows each indicator's source: provenance, standard reference and library id", async () => {
    vi.mocked(api.getFramework).mockResolvedValue(framework("draft", [
      makeIndicator({ id: "i-1", indicatorText: "From the library", provenance: "library", libraryId: "FS-01", standardReferenceCode: "WFP CRF" }),
      makeIndicator({ id: "i-2", indicatorText: "Written by hand", provenance: "manual", libraryId: null, standardReferenceCode: null }),
      makeIndicator({ id: "i-3", indicatorText: "Suggested by Raqib", provenance: "ai_suggested", libraryId: "WA-01", standardReferenceCode: null }),
    ]));
    renderWithClient(<IndicatorTable projectId="p-1" />);
    expect(await screen.findByRole("columnheader", { name: "Source" })).toBeInTheDocument();
    const library = rowOf("From the library");
    expect(within(library).getByText("From the indicator library")).toBeInTheDocument();
    expect(within(library).getByText("WFP CRF")).toHaveAttribute("dir", "ltr");
    expect(within(library).getByText("FS-01")).toHaveAttribute("dir", "ltr");
    const manual = rowOf("Written by hand");
    expect(within(manual).getByText("Entered manually")).toBeInTheDocument();
    expect(within(manual).getByText("Custom")).toBeInTheDocument();
    const ai = rowOf("Suggested by Raqib");
    expect(within(ai).getByText("AI suggested")).toBeInTheDocument();
    expect(within(ai).getByText("Library WA-01")).toBeInTheDocument();
    expect(within(ai).getByRole("note")).toHaveTextContent(AI_LABEL);
  });

  it("lets an org admin approve an unapproved indicator of an approved framework", async () => {
    const user = userEvent.setup({ delay: null });
    const indicator = makeIndicator({ id: "i-7", indicatorText: "Accepted after approval", provenance: "ai_suggested", isApproved: false });
    vi.mocked(api.getFramework).mockResolvedValueOnce(framework("approved", [indicator]))
      .mockResolvedValue(framework("approved", [{ ...indicator, isApproved: true }]));
    vi.mocked(api.approveIndicator).mockResolvedValue({ ...indicator, isApproved: true });
    renderAs("org_admin");
    const approve = await screen.findByRole("button", { name: "Approve Accepted after approval" });
    await user.click(approve);
    await waitFor(() => expect(api.approveIndicator).toHaveBeenCalledWith("i-7"));
    expect(toast.success).toHaveBeenCalledWith("Indicator approved");
    // The framework is refetched: the indicator is approved, so the label and the button go.
    await waitFor(() => expect(screen.queryByRole("button", { name: "Approve Accepted after approval" })).not.toBeInTheDocument());
    expect(within(rowOf("Accepted after approval")).queryByText(AI_LABEL)).not.toBeInTheDocument();
  });

  it("offers Approve only to admins, only on unapproved indicators, once the framework is approved or active", async () => {
    const indicators = [
      makeIndicator({ id: "i-1", indicatorText: "Not yet approved", provenance: "ai_suggested", isApproved: false }),
      makeIndicator({ id: "i-2", indicatorText: "Already approved", provenance: "ai_suggested", isApproved: true }),
    ];
    vi.mocked(api.getFramework).mockResolvedValue(framework("active", indicators));
    const admin = renderAs("platform_admin");
    expect(await screen.findByRole("button", { name: "Approve Not yet approved" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve Already approved" })).not.toBeInTheDocument();
    admin.unmount();

    const officer = renderAs("me_officer");
    expect(await screen.findByText("Not yet approved")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Approve / })).not.toBeInTheDocument();
    officer.unmount();

    // Before the framework is approved, only AI-made indicators get Approve (approving the framework approves the rest).
    vi.mocked(api.getFramework).mockResolvedValue(framework("client_review", [
      ...indicators,
      makeIndicator({ id: "i-3", indicatorText: "Entered by hand", provenance: "manual", isApproved: false }),
    ]));
    renderAs("org_admin");
    expect(await screen.findByRole("button", { name: "Approve Not yet approved" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve Entered by hand" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve Already approved" })).not.toBeInTheDocument();
  });

  it("lets an org admin approve an accepted KPI suggestion in a draft framework, which removes its AI label (UX-03)", async () => {
    const user = userEvent.setup({ delay: null });
    const indicator = makeIndicator({ id: "i-8", indicatorText: "Accepted into a draft", provenance: "ai_suggested", isApproved: false });
    vi.mocked(api.getFramework).mockResolvedValueOnce(framework("draft", [indicator]))
      .mockResolvedValue(framework("draft", [{ ...indicator, isApproved: true }]));
    vi.mocked(api.approveIndicator).mockResolvedValue({ ...indicator, isApproved: true });
    renderAs("org_admin");
    expect(await within(await waitFor(() => rowOf("Accepted into a draft"))).findByText(AI_LABEL)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Approve Accepted into a draft" }));
    await waitFor(() => expect(api.approveIndicator).toHaveBeenCalledWith("i-8"));
    await waitFor(() => expect(within(rowOf("Accepted into a draft")).queryByText(AI_LABEL)).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Approve Accepted into a draft" })).not.toBeInTheDocument();
  });

  it("labels unapproved AI-made indicators in the Timeline view too (UX-10)", async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(api.getFramework).mockResolvedValue(framework("approved", [
      makeIndicator({ id: "i-1", indicatorText: "Unreviewed suggestion", provenance: "ai_suggested", isApproved: false }),
      makeIndicator({ id: "i-2", indicatorText: "Reviewed suggestion", provenance: "ai_suggested", isApproved: true }),
      makeIndicator({ id: "i-3", indicatorText: "Hand written", provenance: "manual", isApproved: false }),
    ]));
    renderWithClient(<IndicatorTable projectId="p-1" />);
    await user.click(await screen.findByRole("button", { name: "Timeline" }));
    expect(screen.queryByRole("columnheader", { name: "Source" })).not.toBeInTheDocument();
    expect(screen.getAllByText(AI_LABEL)).toHaveLength(1);
    const unreviewed = screen.getByText("Unreviewed suggestion").closest(".border-b") as HTMLElement;
    expect(within(unreviewed).getByText(AI_LABEL)).toBeInTheDocument();
  });

  it("tells the admin when approving fails", async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(api.getFramework).mockResolvedValue(framework("approved", [makeIndicator({ indicatorText: "Needs approval", provenance: "ai_suggested" })]));
    vi.mocked(api.approveIndicator).mockRejectedValue(new Error("Forbidden"));
    renderAs("org_admin");
    await user.click(await screen.findByRole("button", { name: "Approve Needs approval" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Could not approve the indicator", { description: "Forbidden" }));
  });

  it("passes the indicators to the results chain, where each result's count opens its list", async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(api.getFramework).mockResolvedValue(framework("draft", [
      makeIndicator({ id: "i-1", resultId: "o2", indicatorText: "Dietary diversity score" }),
    ]));
    renderAs("me_officer");
    await user.click(await screen.findByRole("button", { name: "1 indicator (O2)" }));
    const region = screen.getByRole("region", { name: "Results chain" });
    expect(within(region).getByText("Dietary diversity score")).toBeInTheDocument();
    expect(within(region).getByRole("button", { name: "Suggest KPIs for O2" })).toBeInTheDocument();
  });

  it("marks translated buttons with their language on this English screen", async () => {
    const arabicUser: AuthUser = {
      id: "u1", email: "sara@example.org", fullName: "Sara", role: "me_officer", languagePref: "ar",
      organization: { id: "org-1", name: "Org" },
    };
    vi.mocked(api.getUser).mockReturnValue(arabicUser);
    vi.mocked(api.getFramework).mockResolvedValue(framework("draft"));
    renderWithClient(<AuthProvider><IndicatorTable projectId="p-1" /></AuthProvider>);
    expect(await screen.findByRole("button", { name: "إضافة مؤشر" })).toHaveAttribute("lang", "ar");
    const edits = screen.getAllByRole("button", { name: /^تعديل المؤشر: / });
    expect(edits.length).toBeGreaterThan(0);
    for (const edit of edits) expect(edit).toHaveAttribute("lang", "ar");
  });

  it("names Approve and Edit after the indicator as an Arabic row shows it, marking an English name as English", async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(api.getUser).mockReturnValue(makeAuthUser({ role: "org_admin", languagePref: "ar" }));
    vi.mocked(api.getFramework).mockResolvedValue(framework("approved", [
      makeIndicator({ id: "i-1", indicatorText: "% of households with acceptable FCS", indicatorTextAr: "نسبة الأسر ذات درجة استهلاك غذائي مقبولة", isApproved: false }),
      makeIndicator({ id: "i-2", indicatorText: "Number of people reached", indicatorTextAr: null, isApproved: false }),
    ]));
    renderWithClient(<AuthProvider><IndicatorTable projectId="p-1" /></AuthProvider>);

    // An Arabic name: the label is all Arabic, as the row shows it.
    const approve = await screen.findByRole("button", { name: "اعتماد نسبة الأسر ذات درجة استهلاك غذائي مقبولة" });
    expect(approve).toHaveAttribute("aria-label", "اعتماد نسبة الأسر ذات درجة استهلاك غذائي مقبولة");
    expect(screen.getByRole("button", { name: "تعديل المؤشر: نسبة الأسر ذات درجة استهلاك غذائي مقبولة" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^اعتماد %/ })).not.toBeInTheDocument();

    // No Arabic name: the row shows the English one, and the label marks it as English (a hidden label element).
    for (const name of ["اعتماد Number of people reached", "تعديل المؤشر: Number of people reached"]) {
      const button = screen.getByRole("button", { name });
      expect(button).not.toHaveAttribute("aria-label");
      const label = document.getElementById(button.getAttribute("aria-labelledby") ?? "") as HTMLElement;
      expect(label).not.toBeVisible();
      expect(label.querySelector("bdi")).toHaveAttribute("lang", "en");
      expect(label.querySelector("bdi")).toHaveTextContent("Number of people reached");
    }

    // The Timeline view shows the same names as the table, so its Edit labels match it too.
    await user.click(screen.getByRole("button", { name: "Timeline" }));
    expect(screen.getByText("نسبة الأسر ذات درجة استهلاك غذائي مقبولة")).toHaveAttribute("lang", "ar");
    expect(screen.getByRole("button", { name: "تعديل المؤشر: نسبة الأسر ذات درجة استهلاك غذائي مقبولة" })).toBeInTheDocument();
  });

  it("gives Edit and Approve 44 px touch targets on phones, 8 px apart, and the compact 28 px from sm up", async () => {
    vi.mocked(api.getFramework).mockResolvedValue(framework("approved", [
      makeIndicator({ id: "i-1", indicatorText: "Not yet approved", provenance: "ai_suggested", isApproved: false }),
    ]));
    renderAs("org_admin");
    const approve = await screen.findByRole("button", { name: "Approve Not yet approved" });
    const edit = screen.getByRole("button", { name: "Edit indicator: Not yet approved" });
    for (const button of [approve, edit]) {
      expect(button).toHaveClass("min-h-11", "sm:h-7", "sm:min-h-0");
      expect(button).not.toHaveClass("h-7");
    }
    expect(approve.parentElement).toHaveClass("gap-2", "sm:gap-1");
    expect(approve.parentElement).toContainElement(edit);
  });
});

describe("IndicatorTable read-only (donor viewers, archived projects)", () => {
  it("shows the framework and results chain without any add, edit or delete control", async () => {
    vi.mocked(api.getFramework).mockResolvedValue(framework("approved"));
    renderWithClient(<IndicatorTable projectId="p-1" canEdit={false} />);
    expect(await screen.findByText("% of households with acceptable FCS")).toBeInTheDocument();
    expect(await screen.findByText("Reduced food insecurity")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add indicator" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /New Framework/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Edit indicator: / })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add result" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Add a result under / })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Edit (Goal|O1)/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Delete / })).not.toBeInTheDocument();
  });

  it("gives an admin no Approve on an archived project, and keeps the Source column and AI label to read", async () => {
    const indicator = makeIndicator({ id: "i-1", indicatorText: "Not yet approved", provenance: "ai_suggested", isApproved: false });
    vi.mocked(api.getFramework).mockResolvedValue(framework("active", [indicator]));
    vi.mocked(api.getUser).mockReturnValue(makeAuthUser({ role: "org_admin" }));
    renderWithClient(<AuthProvider><IndicatorTable projectId="p-1" canEdit={false} /></AuthProvider>);
    const row = await screen.findByText("Not yet approved").then(() => rowOf("Not yet approved"));
    expect(within(row).getByText(AI_LABEL)).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Source" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Approve / })).not.toBeInTheDocument();
    // Nor any KPI Assistant write control in the results chain above.
    expect(await screen.findByText("Reduced food insecurity")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Suggest KPIs/ })).not.toBeInTheDocument();
  });

  it("keeps the table's sideways scroll reachable by keyboard when it holds no buttons", async () => {
    vi.mocked(api.getFramework).mockResolvedValue(framework("approved"));
    renderWithClient(<IndicatorTable projectId="p-1" canEdit={false} />);
    const region = await screen.findByRole("region", { name: "Indicators" });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(within(region).getByRole("table")).toBeInTheDocument();
  });

  it("offers no framework creation when there is no framework", async () => {
    vi.mocked(api.getFramework).mockResolvedValue(null);
    renderWithClient(<IndicatorTable projectId="p-1" canEdit={false} />);
    expect(await screen.findByText("No framework generated yet.")).toBeInTheDocument();
    expect(screen.queryByText(/create a manual framework/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /New Framework/ })).not.toBeInTheDocument();
  });

  it("keeps every control for staff on a project that is not archived (the default)", async () => {
    vi.mocked(api.getFramework).mockResolvedValue(framework("draft"));
    renderWithClient(<IndicatorTable projectId="p-1" />);
    expect(await screen.findByRole("button", { name: "Add indicator" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /New Framework/ })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Edit indicator: / }).length).toBeGreaterThan(0);
    expect(await screen.findByRole("button", { name: "Add result" })).toBeInTheDocument();
  });
});

