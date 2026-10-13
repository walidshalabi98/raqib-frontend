import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { ReportsList } from "@/components/project/ReportsList";
import { api } from "@/services/api";
import { renderWithClient } from "@/test/utils";
import { makeDonorReport, makeReport } from "@/test/fixtures";
import { ApiError } from "@/lib/apiError";
import { AuthProvider } from "@/contexts/AuthContext";
import type { AuthUser } from "@/types/api";

vi.mock("@/services/api", () => ({
  api: {
    getReports: vi.fn(),
    getReport: vi.fn(),
    generateReport: vi.fn(),
    publishReport: vi.fn(),
    unpublishReport: vi.fn(),
    getUser: vi.fn(() => null),
    getToken: vi.fn(() => "token"),
  },
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

const DONOR_EMPTY = "Reports appear here once your organisation publishes them.";

function signInAs(role: string, languagePref = "en") {
  const user: AuthUser = { id: "u1", email: "u@example.org", fullName: "User", role, languagePref, organization: { id: "org-1", name: "Org" } };
  vi.mocked(api.getUser).mockReturnValue(user);
}

/** The bidirectional isolates around a title in translated text are not visible: compare without them. */
const plain = (text: string | null | undefined) => (text ?? "").replace(/[⁨⁩]/g, "");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getUser).mockReturnValue(null);
  vi.mocked(api.getReports).mockResolvedValue([makeReport()]);
  // The reading view loads the report itself (GET /api/reports/:id).
  vi.mocked(api.getReport).mockImplementation(async (id) => makeReport({ id, aiNarrative: `<h1>Narrative of ${id}</h1>` }));
});

/** The open reading view (a dialog; the confirmation is an alertdialog). */
const reader = () => screen.findByRole("dialog");

describe("ReportsList: reading", () => {
  it("shows report types and periods in the user's language (Arabic donors see Arabic labels)", async () => {
    signInAs("donor_viewer", "ar");
    vi.mocked(api.getReports).mockResolvedValue([makeDonorReport()]);
    renderWithClient(
      <AuthProvider><ReportsList projectId="p-1" canGenerate={false} /></AuthProvider>,
    );
    const title = await screen.findByText("Q3 summary");
    const row = title.closest("[lang]") as HTMLElement;
    expect(row).toHaveAttribute("lang", "ar");
    expect(row).toHaveAttribute("dir", "rtl");
    expect(within(row).getByText("ملخّص ربع سنوي")).toBeInTheDocument();
    expect(within(row).getByText("1 يوليو 2026 – 30 سبتمبر 2026")).toBeInTheDocument();
    expect(row).not.toHaveTextContent("quarterly summary");
    // Donors receive published reports only: no status to tell apart.
    expect(row).not.toHaveTextContent("منشور للمانحين");
  });

  it("offers Generate report by default (staff)", async () => {
    renderWithClient(<ReportsList projectId="p-1" />);
    expect(await screen.findByText("Q3 summary")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate report" })).toBeInTheDocument();
  });

  it("only lists reports when the role cannot generate them (donor viewers): no status, no publishing", async () => {
    vi.mocked(api.getReports).mockResolvedValue([makeDonorReport()]);
    renderWithClient(<ReportsList projectId="p-1" canGenerate={false} />);
    expect(await screen.findByText("Q3 summary")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Generate report/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Published to donors")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Publish|Unpublish|Review/ })).not.toBeInTheDocument();
    expect(api.generateReport).not.toHaveBeenCalled();
  });

  it("has translated empty states: staff, and donors told that reports appear once the organisation publishes them", async () => {
    vi.mocked(api.getReports).mockResolvedValue([]);
    const { unmount } = renderWithClient(<ReportsList projectId="p-1" />);
    expect(await screen.findByText("No reports generated yet.")).toBeInTheDocument();
    unmount();
    renderWithClient(<ReportsList projectId="p-1" canGenerate={false} />);
    expect(await screen.findByText(DONOR_EMPTY)).toBeInTheDocument();
  });

  it("tells Arabic donor viewers the same in Arabic", async () => {
    signInAs("donor_viewer", "ar");
    vi.mocked(api.getReports).mockResolvedValue([]);
    renderWithClient(<AuthProvider><ReportsList projectId="p-1" canGenerate={false} /></AuthProvider>);
    const empty = await screen.findByText("تظهر التقارير هنا بعد أن تنشرها مؤسستك.");
    expect(empty).toHaveAttribute("dir", "rtl");
  });

  it("shows an error with a retry, never the empty state, when the request fails", async () => {
    vi.mocked(api.getReports).mockRejectedValueOnce(new Error("Internal server error")).mockResolvedValueOnce([makeDonorReport()]);
    const user = userEvent.setup({ delay: null });
    renderWithClient(<ReportsList projectId="p-1" canGenerate={false} />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We couldn't load the reports.");
    expect(screen.queryByText(DONOR_EMPTY)).not.toBeInTheDocument();
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Q3 summary")).toBeInTheDocument();
  });

  it("announces loading and explains a 403", async () => {
    let reject: (err: unknown) => void = () => {};
    vi.mocked(api.getReports).mockReturnValue(new Promise((_, r) => { reject = r; }));
    renderWithClient(<ReportsList projectId="p-1" canGenerate={false} />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
    reject(new ApiError("Insufficient permissions", 403));
    expect(await screen.findByRole("alert")).toHaveTextContent("You don't have permission to do this.");
  });
});

describe("ReportsList: reading a report", () => {
  it("lets donor viewers read a published report in a sandboxed frame, without status or publishing", async () => {
    vi.mocked(api.getReports).mockResolvedValue([makeDonorReport()]);
    vi.mocked(api.getReport).mockResolvedValue(makeDonorReport({ aiNarrative: "<h1>Q3 summary</h1><p>Progress in the third quarter.</p>" }));
    const user = userEvent.setup({ delay: null });
    renderWithClient(<ReportsList projectId="p-1" canGenerate={false} />);

    const read = await screen.findByRole("button", { name: /^Read .*Q3 summary/ });
    expect(read).toHaveTextContent("Read");
    await user.click(read);
    const view = await reader();
    expect(api.getReport).toHaveBeenCalledWith("r-1");
    expect(within(view).getByRole("heading", { name: "Q3 summary" })).toBeInTheDocument();
    expect(view).toHaveTextContent("Published by your organisation. It was drafted with AI and reviewed before it was published.");
    expect(view).not.toHaveTextContent("Published to donors");
    expect(view).not.toHaveTextContent("review before publishing");

    const frame = await within(view).findByTitle(/^Text of .*Q3 summary/);
    expect(frame.tagName).toBe("IFRAME");
    // No allow-scripts, no allow-same-origin: the report cannot run code or reach the app.
    expect(frame).toHaveAttribute("sandbox", "");
    expect(frame.getAttribute("srcdoc")).toContain("<p>Progress in the third quarter.</p>");
    expect(frame.getAttribute("srcdoc")).toContain("default-src 'none'");
    expect(within(view).queryByRole("button", { name: /Publish|Unpublish/ })).not.toBeInTheDocument();

    await user.click(within(view).getAllByRole("button", { name: "Close" })[0]);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(read).toHaveFocus();
  });

  it("labels a draft's text as AI written for staff, and gives M&E officers no Publish", async () => {
    const user = userEvent.setup({ delay: null });
    renderWithClient(<ReportsList projectId="p-1" canGenerate />);
    await user.click(await screen.findByRole("button", { name: /^Read .*Q3 summary/ }));
    const view = await reader();
    expect(within(view).getByRole("note")).toHaveTextContent("AI written — review before publishing");
    expect(within(view).getByRole("note")).toHaveTextContent("check that it names no beneficiary, quotes no one who could be recognised");
    expect(within(view).getByText("Draft")).toBeInTheDocument();
    expect(await within(view).findByTitle(/^Text of /)).toHaveAttribute("srcdoc", expect.stringContaining("Narrative of r-1"));
    expect(within(view).queryByRole("button", { name: /Publish/ })).not.toBeInTheDocument();
  });

  it("shows an error with a retry when the text cannot be loaded, and says when a report has no text", async () => {
    vi.mocked(api.getReport)
      .mockRejectedValueOnce(new ApiError("Internal server error", 500))
      .mockResolvedValueOnce(makeReport({ aiNarrative: null }));
    const user = userEvent.setup({ delay: null });
    renderWithClient(<ReportsList projectId="p-1" canPublish />);
    await user.click(await screen.findByRole("button", { name: /^Review .*Q3 summary/ }));
    const view = await reader();
    const alert = await within(view).findByRole("alert");
    expect(alert).toHaveTextContent("We couldn't load the report text.");
    // Nothing to read: nothing to publish.
    expect(within(view).queryByRole("button", { name: /^Publish/ })).not.toBeInTheDocument();
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await within(view).findByText("This report has no text yet: it is still being generated, or generation failed.")).toBeInTheDocument();
    expect(within(view).queryByRole("button", { name: /^Publish/ })).not.toBeInTheDocument();
  });
});

describe("ReportsList: status and publishing", () => {
  const draft = makeReport({ id: "r-1", title: "Q3 summary", status: "draft" });
  const published = makeReport({ id: "r-2", title: "Annual review 2025", type: "annual_review", status: "published" });

  beforeEach(() => {
    vi.mocked(api.getReports).mockResolvedValue([draft, published]);
  });

  it("shows each report's status to staff as text with an icon, never colour alone", async () => {
    renderWithClient(<ReportsList projectId="p-1" />);
    const draftBadge = await screen.findByText("Draft");
    const publishedBadge = screen.getByText("Published to donors");
    for (const badge of [draftBadge, publishedBadge]) {
      expect(badge.querySelector("svg")).not.toBeNull();
      expect(badge.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    }
    expect(draftBadge.closest("li")).toHaveTextContent("Q3 summary");
    expect(publishedBadge.closest("li")).toHaveTextContent("Annual review 2025");
  });

  it("gives M&E officers the status and Read, but no Publish or Unpublish (org admins only)", async () => {
    renderWithClient(<ReportsList projectId="p-1" canGenerate canPublish={false} />);
    expect(await screen.findByText("Draft")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Publish|Unpublish|Review/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Read / })).toHaveLength(2);
    expect(screen.queryByText(/Not ready to publish/)).not.toBeInTheDocument();
  });

  it("never offers Publish on the row: an org admin publishes from the reading view, once the text is on screen", async () => {
    let loaded: (report: ReturnType<typeof makeReport>) => void = () => {};
    vi.mocked(api.getReport).mockReturnValueOnce(new Promise((resolve) => { loaded = resolve; }));
    const user = userEvent.setup({ delay: null });
    renderWithClient(<ReportsList projectId="p-1" canPublish />);

    const review = await screen.findByRole("button", { name: /^Review .*Q3 summary.* and publish it to donors$/ });
    expect(review).toHaveTextContent("Review and publish");
    expect(screen.queryByRole("button", { name: /^Publish/ })).not.toBeInTheDocument();
    await user.click(review);
    const view = await reader();
    // Still loading: no Publish yet.
    expect(within(view).getByRole("status")).toHaveTextContent("Loading…");
    expect(within(view).queryByRole("button", { name: /^Publish/ })).not.toBeInTheDocument();
    loaded(makeReport({ aiNarrative: "<h2>Beneficiary Voices</h2>" }));
    expect(await within(view).findByRole("button", { name: /^Publish .*Q3 summary.* to donors$/ })).toBeInTheDocument();
    expect(within(view).getByText("Publishing lets donor viewers in your organisation read this text.")).toBeInTheDocument();
  });

  it("publishes a draft after reading it and a confirmation that says what donors will see, then refreshes the list", async () => {
    vi.mocked(api.publishReport).mockResolvedValue({ ...draft, status: "published" });
    const user = userEvent.setup({ delay: null });
    renderWithClient(<ReportsList projectId="p-1" canPublish />);

    await user.click(await screen.findByRole("button", { name: /^Review .*Q3 summary/ }));
    const view = await reader();
    await within(view).findByTitle(/^Text of .*Q3 summary/);
    const button = within(view).getByRole("button", { name: /^Publish .*Q3 summary.* to donors$/ });
    expect(button).toHaveTextContent("Publish");
    await user.click(button);

    const dialog = await screen.findByRole("alertdialog");
    expect(plain(within(dialog).getByRole("heading").textContent)).toBe("Publish “Q3 summary” to donors?");
    expect(dialog).toHaveTextContent("Donor viewers in your organisation will be able to see:");
    expect(dialog).toHaveTextContent("the report's title, type, donor format and period");
    expect(dialog).toHaveTextContent("the full report text you have just read, which was written by AI");
    expect(dialog).toHaveTextContent("Names and quotes are not removed automatically: publish only if the text names no beneficiary");
    expect(dialog).toHaveTextContent("The report file stays with project staff.");
    expect(api.publishReport).not.toHaveBeenCalled();

    const callsBefore = vi.mocked(api.getReports).mock.calls.length;
    vi.mocked(api.getReports).mockResolvedValue([{ ...draft, status: "published" }, published]);
    await user.click(within(dialog).getByRole("button", { name: "Publish to donors" }));

    await waitFor(() => expect(api.publishReport).toHaveBeenCalledWith("r-1"));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(plain(vi.mocked(toast.success).mock.calls[0][0] as string)).toBe("“Q3 summary” is published. Donor viewers can now read it.");
    // The list and the report are refetched so they show the status the server holds; focus stays on the view's button.
    expect(vi.mocked(api.getReports).mock.calls.length).toBeGreaterThan(callsBefore);
    const unpublish = await within(view).findByRole("button", { name: /^Unpublish .*Q3 summary/ });
    expect(unpublish).toHaveFocus();
    expect(within(view).getByText("Published to donors")).toBeInTheDocument();
    expect(within(view).queryByText("AI written — review before publishing")).not.toBeInTheDocument();
    expect(screen.getAllByText("Published to donors").length).toBeGreaterThanOrEqual(2);
    expect(api.unpublishReport).not.toHaveBeenCalled();
  });

  it("unpublishes a published report from its row after saying donors will no longer see it", async () => {
    vi.mocked(api.unpublishReport).mockResolvedValue({ ...published, status: "draft" });
    const user = userEvent.setup({ delay: null });
    renderWithClient(<ReportsList projectId="p-1" canPublish />);

    await user.click(await screen.findByRole("button", { name: /^Unpublish .*Annual review 2025/ }));
    const dialog = await screen.findByRole("alertdialog");
    expect(plain(within(dialog).getByRole("heading").textContent)).toBe("Unpublish “Annual review 2025”?");
    expect(dialog).toHaveTextContent("donor viewers will no longer see it or its text");
    expect(dialog).toHaveTextContent("The notification they received, with the report title, stays in their list");

    await user.click(within(dialog).getByRole("button", { name: "Unpublish" }));
    await waitFor(() => expect(api.unpublishReport).toHaveBeenCalledWith("r-2"));
    expect(api.publishReport).not.toHaveBeenCalled();
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(plain(vi.mocked(toast.success).mock.calls[0][0] as string)).toBe("“Annual review 2025” is back to draft. Donor viewers no longer see it.");
  });

  it("works from the keyboard: the view and the confirmation open with Enter, Escape cancels, focus returns each time", async () => {
    const user = userEvent.setup({ delay: null });
    renderWithClient(<ReportsList projectId="p-1" canGenerate={false} audience="staff" canPublish />);
    const review = await screen.findByRole("button", { name: /^Review .*Q3 summary/ });

    await user.tab();
    expect(review).toHaveFocus();
    await user.keyboard("{Enter}");
    const view = await reader();
    const publish = await within(view).findByRole("button", { name: /^Publish .*Q3 summary/ });
    publish.focus();
    await user.keyboard("{Enter}");
    const dialog = await screen.findByRole("alertdialog");
    // The safe choice has the focus first.
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    // Escape closes the confirmation only; the view stays open.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(publish).toHaveFocus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(review).toHaveFocus();
    expect(api.publishReport).not.toHaveBeenCalled();
  });

  it("explains why an unfinished draft cannot be published yet, instead of offering Read or Publish", async () => {
    vi.mocked(api.getReports).mockResolvedValue([makeReport({ id: "r-3", title: "October progress", aiNarrative: null, fileUrl: null })]);
    renderWithClient(<ReportsList projectId="p-1" canPublish />);
    expect(await screen.findByText("Not ready to publish: still being generated, or generation failed.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Publish|Read|Review/ })).not.toBeInTheDocument();
  });

  it("explains a refusal in the user's language and refreshes the list", async () => {
    vi.mocked(api.publishReport).mockRejectedValue(new ApiError("Only a finished report can be published: …", 409));
    const user = userEvent.setup({ delay: null });
    renderWithClient(<ReportsList projectId="p-1" canPublish />);
    await user.click(await screen.findByRole("button", { name: /^Review .*Q3 summary/ }));
    await user.click(await within(await reader()).findByRole("button", { name: /^Publish .*Q3 summary/ }));
    const callsBefore = vi.mocked(api.getReports).mock.calls.length;
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Publish to donors" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "This report isn't finished, so it can't be published yet. Wait until it has been generated, or generate it again.",
      ),
    );
    expect(toast.success).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await waitFor(() => expect(vi.mocked(api.getReports).mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it("shows status, actions, the reading view and the confirmation in Arabic, right to left", async () => {
    signInAs("org_admin", "ar");
    const user = userEvent.setup({ delay: null });
    renderWithClient(<AuthProvider><ReportsList projectId="p-1" canPublish /></AuthProvider>);

    const draftBadge = await screen.findByText("مسودة");
    expect(draftBadge.closest("li")).toHaveAttribute("dir", "rtl");
    expect(screen.getByText("منشور للمانحين")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^إعادة .*Annual review 2025.* إلى المسودة$/ })).toHaveTextContent("إعادة إلى المسودة");

    await user.click(screen.getByRole("button", { name: /^مراجعة .*Q3 summary.* ونشره للمانحين$/ }));
    const view = await reader();
    expect(view).toHaveAttribute("dir", "rtl");
    expect(within(view).getByRole("note")).toHaveTextContent("كتبه الذكاء الاصطناعي — راجِعه قبل النشر");
    await user.click(await within(view).findByRole("button", { name: /^نشر .*Q3 summary.* للمانحين$/ }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveAttribute("dir", "rtl");
    expect(dialog).toHaveAttribute("lang", "ar");
    expect(plain(within(dialog).getByRole("heading").textContent)).toBe("هل تريد نشر «Q3 summary» للمانحين؟");
    expect(within(dialog).getByRole("button", { name: "النشر للمانحين" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "إلغاء" })).toBeInTheDocument();
  });

  it("never starts the Arabic Unpublish action with the word on Cancel (إلغاء)", async () => {
    signInAs("org_admin", "ar");
    const user = userEvent.setup({ delay: null });
    renderWithClient(<AuthProvider><ReportsList projectId="p-1" canPublish /></AuthProvider>);
    await user.click(await screen.findByRole("button", { name: /^إعادة .*Annual review 2025/ }));
    const dialog = await screen.findByRole("alertdialog");
    expect(plain(within(dialog).getByRole("heading").textContent)).toBe("هل تريد إعادة «Annual review 2025» إلى المسودة؟");
    const names = within(dialog).getAllByRole("button").map((b) => b.textContent?.trim() ?? "");
    expect(names).toEqual(expect.arrayContaining(["إلغاء", "إعادة إلى المسودة"]));
    expect(names.filter((name) => name.startsWith("إلغاء"))).toEqual(["إلغاء"]);
  });
});

describe("ReportsList: generating a report", () => {
  it("requires a title, and sends the type, title, donor format and period", async () => {
    vi.mocked(api.generateReport).mockResolvedValue({ reportId: "r-9", status: "processing" });
    const user = userEvent.setup({ delay: null });
    renderWithClient(<ReportsList projectId="p-1" />);
    await user.click(await screen.findByRole("button", { name: "Generate report" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Generate a report" })).toBeInTheDocument();

    // A blank title is refused here, never sent (the server answers 400 without one).
    await user.type(within(dialog).getByLabelText(/Report title/), "   ");
    await user.click(within(dialog).getByRole("button", { name: "Generate report" }));
    expect(await within(dialog).findByText("Enter a title for the report.")).toBeInTheDocument();
    const title = within(dialog).getByLabelText(/Report title/);
    expect(title).toHaveAttribute("aria-invalid", "true");
    expect(title).toHaveFocus();
    expect(api.generateReport).not.toHaveBeenCalled();

    await user.clear(title);
    await user.type(title, "  Q3 2026 progress  ");
    await user.selectOptions(within(dialog).getByLabelText(/Report type/), "monthly_progress");
    await user.selectOptions(within(dialog).getByLabelText(/Donor format/), "giz");
    await user.type(within(dialog).getByLabelText("Period start"), "2026-07-01");
    await user.type(within(dialog).getByLabelText("Period end"), "2026-09-30");
    await user.click(within(dialog).getByRole("button", { name: "Generate report" }));

    await waitFor(() =>
      expect(api.generateReport).toHaveBeenCalledWith("p-1", {
        type: "monthly_progress", title: "Q3 2026 progress", donorFormat: "giz", periodStart: "2026-07-01", periodEnd: "2026-09-30",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(plain(vi.mocked(toast.success).mock.calls[0][0] as string)).toBe("Generating “Q3 2026 progress”. It appears in the list as a draft when it is ready.");
  });

  it("leaves an empty period out and refuses a period that ends before it starts", async () => {
    vi.mocked(api.generateReport).mockResolvedValue({ reportId: "r-9", status: "processing" });
    const user = userEvent.setup({ delay: null });
    renderWithClient(<ReportsList projectId="p-1" />);
    await user.click(await screen.findByRole("button", { name: "Generate report" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/Report title/), "Annual review");
    await user.type(within(dialog).getByLabelText("Period start"), "2026-09-30");
    await user.type(within(dialog).getByLabelText("Period end"), "2026-07-01");
    await user.click(within(dialog).getByRole("button", { name: "Generate report" }));
    expect(await within(dialog).findByText("The period cannot end before it starts.")).toBeInTheDocument();
    expect(api.generateReport).not.toHaveBeenCalled();

    await user.clear(within(dialog).getByLabelText("Period start"));
    await user.clear(within(dialog).getByLabelText("Period end"));
    await user.click(within(dialog).getByRole("button", { name: "Generate report" }));
    await waitFor(() => expect(api.generateReport).toHaveBeenCalledWith("p-1", { type: "quarterly_summary", title: "Annual review", donorFormat: "eu" }));
  });

  it("says when the request fails, in the user's language, and keeps the form open", async () => {
    signInAs("me_officer", "ar");
    vi.mocked(api.generateReport).mockRejectedValue(new ApiError("type and title are required", 400));
    const user = userEvent.setup({ delay: null });
    renderWithClient(<AuthProvider><ReportsList projectId="p-1" /></AuthProvider>);
    await user.click(await screen.findByRole("button", { name: "إنشاء تقرير" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute("dir", "rtl");
    await user.type(within(dialog).getByLabelText(/عنوان التقرير/), "تقرير الربع الثالث");
    expect(within(dialog).getByLabelText(/نوع التقرير/)).toHaveDisplayValue("ملخّص ربع سنوي");
    await user.click(within(dialog).getByRole("button", { name: "إنشاء التقرير" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("تعذّر بدء إنشاء التقرير. حاول مرة أخرى."));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
