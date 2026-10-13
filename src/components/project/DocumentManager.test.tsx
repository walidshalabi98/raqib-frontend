import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import DocumentManager from "@/components/project/DocumentManager";
import { AuthProvider } from "@/contexts/AuthContext";
import { api } from "@/services/api";
import { ApiError } from "@/lib/apiError";
import { DOCUMENT_WAIT_MS } from "@/lib/documentAnalysis";
import { renderWithClient } from "@/test/utils";
import type { AuthUser, DocumentAiAnalysis, ProjectDocument } from "@/types/api";

vi.mock("@/services/api", () => ({
  api: {
    getDocuments: vi.fn(),
    uploadDocument: vi.fn(),
    getUser: vi.fn(() => null),
    getToken: vi.fn(() => null),
  },
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

const AI_LABEL = "AI suggested — review before approval";

const analysis: DocumentAiAnalysis = {
  documentType: "proposal",
  summary: "Three-year livelihoods project for youth in Hebron.",
  keyFindings: ["Finding one", "Finding two", "Finding three", "Finding four"],
  indicatorsMentioned: ["% of youth employed six months after training"],
  targetsMentioned: [
    { indicator: "% of youth employed", target: "60%", timeline: "by end of 2027", verified: true },
    { indicator: "", target: "500 trainees", timeline: "", verified: true },
  ],
  recommendations: ["Add sex disaggregation to output indicators"],
  unverifiedFigures: [],
  model: "claude-haiku-5-5",
  promptVersion: "document-analysis-v2",
  analysedAt: "2026-10-12T09:00:00.000Z",
};

function makeDocument(overrides: Partial<ProjectDocument> = {}): ProjectDocument {
  return {
    id: "doc-1",
    projectId: "p-1",
    fileName: "proposal.pdf",
    fileType: "proposal",
    fileSizeBytes: 2048,
    parsingStatus: "completed",
    uploadedAt: "2026-10-12T08:00:00.000Z",
    textLength: 5000,
    aiAnalysis: analysis,
    qualitativeSource: false,
    ...overrides,
  };
}

/** An ISO time `ms` before now. */
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

function renderManager() {
  return renderWithClient(<DocumentManager projectId="p-1" />);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getUser).mockReturnValue(null);
});

describe("DocumentManager", () => {
  it("shows the stored AI analysis, labelled as AI content, with the status as text and icon", async () => {
    vi.mocked(api.getDocuments).mockResolvedValue([makeDocument()]);
    renderManager();

    expect(await screen.findByText("proposal.pdf")).toBeInTheDocument();
    expect(api.getDocuments).toHaveBeenCalledWith("p-1");
    expect(screen.getByRole("heading", { name: "Project documents" })).toBeInTheDocument();
    expect(screen.getByText("Project proposal")).toBeInTheDocument();
    const status = screen.getByText("Processed");
    expect(status.querySelector("svg")).not.toBeNull();
    expect(screen.getByText("Uploaded 12 Oct 2026")).toBeInTheDocument();

    // The shared AiSuggestedLabel: text plus a decorative icon, never colour alone (CLAUDE.md rules 4 and 5).
    const label = screen.getByRole("note");
    expect(label).toHaveTextContent(AI_LABEL);
    expect(label.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("Three-year livelihoods project for youth in Hebron.")).toBeInTheDocument();
    // The card shows the first three findings; the dialog shows all of them.
    expect(screen.getByText("Finding three")).toBeInTheDocument();
    expect(screen.queryByText("Finding four")).not.toBeInTheDocument();
  });

  it("reads a legacy analysis moved into aiAnalysis (snake_case keys, numeric values)", async () => {
    const legacy = {
      documentType: "logframe",
      summary: "Legacy summary of the logframe.",
      keyFindings: ["Legacy finding"],
      indicators_mentioned: ["Number of trainees"],
      targets_mentioned: [{ indicator: "Number of trainees", target: 500, timeline: 2025 }],
      recommendations: [],
    };
    vi.mocked(api.getDocuments).mockResolvedValue([makeDocument({ aiAnalysis: legacy })]);
    const user = userEvent.setup({ delay: null });
    renderManager();

    expect(await screen.findByText("Legacy summary of the logframe.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "View analysis: proposal.pdf" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Number of trainees", { selector: "bdi" })).toBeInTheDocument();
    expect(within(dialog).getByText("500")).toBeInTheDocument();
    expect(within(dialog).getByText("2025")).toBeInTheDocument();
    // Legacy targets were never checked against the text.
    expect(within(dialog).getByText("Not found in the document text — check before use")).toBeInTheDocument();
  });

  it("shows nothing for a legacy analysis that was not valid JSON ({ legacyText })", async () => {
    vi.mocked(api.getDocuments).mockResolvedValue([makeDocument({ aiAnalysis: { legacyText: "{ broken" } })]);
    renderManager();
    expect(await screen.findByText("proposal.pdf")).toBeInTheDocument();
    expect(screen.queryByText(AI_LABEL)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /View analysis/ })).not.toBeInTheDocument();
    expect(screen.getByText("No AI analysis is available for this document.")).toBeInTheDocument();
    expect(screen.queryByText("Preparing the AI analysis…")).not.toBeInTheDocument();
  });

  it("marks targets and figures the backend did not find in the document text", async () => {
    vi.mocked(api.getDocuments).mockResolvedValue([
      makeDocument({
        aiAnalysis: {
          ...analysis,
          targetsMentioned: [
            { indicator: "% of youth employed", target: "60%", timeline: "2027", verified: true },
            { indicator: "% of women employed", target: "75%", timeline: "2027", verified: false },
            // Analysed before the check: no flag, so not verified.
            { indicator: "Number of trainees", target: "500", timeline: "" },
          ] as DocumentAiAnalysis["targetsMentioned"],
          unverifiedFigures: ["1,200", "40%"],
        },
      }),
    ]);
    const user = userEvent.setup({ delay: null });
    renderManager();

    // The card warns about figures in the summary and findings.
    const cardWarning = await screen.findByText(/These figures in the summary or findings were not found/);
    expect(cardWarning).toHaveTextContent("1,200, 40%");
    expect(cardWarning.parentElement?.querySelector("svg")).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "View analysis: proposal.pdf" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Raqib looked for each target in the document text/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/Copied from the document as written/)).not.toBeInTheDocument();
    const items = within(dialog).getAllByRole("listitem").filter((li) => li.textContent?.includes("Target"));
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Found in the document text");
    expect(items[0]).not.toHaveTextContent("Not found");
    for (const item of items.slice(1)) {
      const warning = within(item).getByText("Not found in the document text — check before use");
      expect(warning.querySelector("svg")).not.toBeNull();
    }
    expect(within(dialog).getByText(/These figures in the summary or findings were not found/)).toHaveTextContent("1,200, 40%");
  });

  it("opens the full analysis and returns focus to its button on close", async () => {
    vi.mocked(api.getDocuments).mockResolvedValue([makeDocument()]);
    const user = userEvent.setup({ delay: null });
    renderManager();

    const open = await screen.findByRole("button", { name: "View analysis: proposal.pdf" });
    await user.click(open);
    const dialog = screen.getByRole("dialog", { name: "AI document analysis" });
    expect(dialog).toHaveAccessibleDescription("proposal.pdf");
    expect(within(dialog).getByRole("note")).toHaveTextContent(AI_LABEL);
    for (const heading of ["Summary", "Key findings", "Indicators mentioned", "Targets mentioned", "Recommendations"]) {
      expect(within(dialog).getByRole("heading", { name: heading })).toBeInTheDocument();
    }
    expect(within(dialog).getByText("Finding four")).toBeInTheDocument();
    expect(within(dialog).getByText("% of youth employed six months after training")).toBeInTheDocument();
    expect(within(dialog).getByText(/Raqib looked for each target in the document text/)).toBeInTheDocument();
    expect(within(dialog).getAllByText("Found in the document text")).toHaveLength(2);
    expect(within(dialog).queryByText(/These figures/)).not.toBeInTheDocument();
    expect(within(dialog).getByText("60%")).toBeInTheDocument();
    expect(within(dialog).getByText("by end of 2027")).toBeInTheDocument();
    expect(within(dialog).getByText("500 trainees")).toBeInTheDocument();
    expect(within(dialog).getAllByText("Target")).toHaveLength(2);
    expect(within(dialog).getAllByText("Timeline")).toHaveLength(1);
    expect(within(dialog).getByText("Analysed 12 Oct 2026")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(open).toHaveFocus();
  });

  it("explains a failed file and shows each processing state", async () => {
    vi.mocked(api.getDocuments).mockResolvedValue([
      makeDocument({ id: "d-failed", fileName: "scan.pdf", parsingStatus: "failed", aiAnalysis: null, textLength: 0, uploadedAt: ago(60_000) }),
      makeDocument({ id: "d-pending", fileName: "budget.xlsx", fileType: "budget", parsingStatus: "pending", aiAnalysis: null, textLength: 0, uploadedAt: ago(60_000) }),
      makeDocument({ id: "d-processing", fileName: "logframe.docx", fileType: "logframe", parsingStatus: "processing", aiAnalysis: null, textLength: 0, uploadedAt: ago(60_000) }),
      makeDocument({ id: "d-waiting", fileName: "report.pdf", aiAnalysis: null, uploadedAt: ago(60_000) }),
    ]);
    renderManager();

    expect(await screen.findByText("Could not be read")).toBeInTheDocument();
    expect(screen.getByText("We couldn't read this file. Save it as Word (.docx) or a text-based PDF and upload it again.")).toBeInTheDocument();
    expect(screen.getByText("Waiting to process")).toBeInTheDocument();
    expect(screen.getByText("Processing")).toBeInTheDocument();
    expect(screen.getByText("Processed")).toBeInTheDocument();
    expect(screen.getByText("Preparing the AI analysis…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /View analysis/ })).not.toBeInTheDocument();
    expect(screen.queryByText("This is taking longer than expected.")).not.toBeInTheDocument();
  });

  it("says when no readable text was found instead of waiting for an analysis", async () => {
    vi.mocked(api.getDocuments).mockResolvedValue([
      makeDocument({ fileName: "scan.pdf", aiAnalysis: null, textLength: 12, uploadedAt: ago(30_000) }),
    ]);
    renderManager();

    const hint = await screen.findByText(/No readable text was found in this file/);
    expect(hint.parentElement?.querySelector("svg")).not.toBeNull();
    expect(screen.getByText("Processed")).toBeInTheDocument();
    expect(screen.queryByText("Preparing the AI analysis…")).not.toBeInTheDocument();
  });

  it("says when no analysis came once the wait is over, and marks qualitative transcripts", async () => {
    vi.mocked(api.getDocuments).mockResolvedValue([
      makeDocument({ id: "d-old", fileName: "old.pdf", aiAnalysis: null, uploadedAt: ago(DOCUMENT_WAIT_MS + 60_000) }),
      makeDocument({ id: "d-fgd", fileName: "fgd.docx", aiAnalysis: null, qualitativeSource: true, uploadedAt: ago(30_000) }),
    ]);
    renderManager();

    expect(await screen.findByText("No AI analysis is available for this document.")).toBeInTheDocument();
    expect(screen.getByText("FGD or KII transcript: coded with the qualitative data, not analysed here.")).toBeInTheDocument();
    expect(screen.queryByText("Preparing the AI analysis…")).not.toBeInTheDocument();
  });

  it("stops waiting for a document stuck in processing and offers a refresh", async () => {
    vi.mocked(api.getDocuments).mockResolvedValue([
      makeDocument({ fileName: "logframe.docx", parsingStatus: "processing", aiAnalysis: null, textLength: 0, uploadedAt: ago(7 * 24 * 3_600_000) }),
    ]);
    const user = userEvent.setup({ delay: null });
    renderManager();

    expect(await screen.findByText("This is taking longer than expected.")).toBeInTheDocument();
    expect(screen.getByText("Processing")).toBeInTheDocument();
    const refresh = screen.getByRole("button", { name: "Refresh status: logframe.docx" });
    expect(refresh).toHaveTextContent("Refresh");
    expect(refresh).toHaveAccessibleDescription("This is taking longer than expected.");
    expect(refresh).toHaveClass("min-h-11");
    await user.click(refresh);
    await waitFor(() => expect(api.getDocuments).toHaveBeenCalledTimes(2));
  });

  it("refreshes the list while a document is being processed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.mocked(api.getDocuments)
        .mockResolvedValueOnce([makeDocument({ parsingStatus: "processing", aiAnalysis: null, textLength: 0, uploadedAt: ago(60_000) })])
        .mockResolvedValue([makeDocument({ uploadedAt: ago(60_000) })]);
      renderManager();
      expect(await screen.findByText("Processing")).toBeInTheDocument();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(await screen.findByText("Processed")).toBeInTheDocument();
      expect(api.getDocuments).toHaveBeenCalledTimes(2);
      // Nothing left to wait for: no further refresh.
      await vi.advanceTimersByTimeAsync(30_000);
      expect(api.getDocuments).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops refreshing when the wait ends, even if the server keeps answering 'processing' or stops answering", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const stuck = makeDocument({ fileName: "logframe.docx", parsingStatus: "processing", aiAnalysis: null, textLength: 0, uploadedAt: ago(DOCUMENT_WAIT_MS - 25_000) });
      vi.mocked(api.getDocuments)
        .mockResolvedValueOnce([stuck])
        .mockRejectedValue(new ApiError("Server error", 500));
      renderManager();
      expect(await screen.findByText("Processing")).toBeInTheDocument();
      expect(screen.queryByText("This is taking longer than expected.")).not.toBeInTheDocument();

      await vi.advanceTimersByTimeAsync(60_000);
      // The row stops waiting on its own, although every refresh failed.
      expect(await screen.findByText("This is taking longer than expected.")).toBeInTheDocument();
      const calls = vi.mocked(api.getDocuments).mock.calls.length;
      expect(calls).toBeGreaterThan(1);
      expect(calls).toBeLessThanOrEqual(4);
      await vi.advanceTimersByTimeAsync(120_000);
      expect(api.getDocuments).toHaveBeenCalledTimes(calls);
    } finally {
      vi.useRealTimers();
    }
  });

  it("announces status changes that arrive by polling, with the file name", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.mocked(api.getDocuments)
        .mockResolvedValueOnce([makeDocument({ fileName: "scan.pdf", parsingStatus: "processing", aiAnalysis: null, textLength: 0, uploadedAt: ago(60_000) })])
        .mockResolvedValueOnce([makeDocument({ fileName: "scan.pdf", parsingStatus: "completed", aiAnalysis: null, uploadedAt: ago(60_000) })])
        .mockResolvedValue([makeDocument({ fileName: "scan.pdf", uploadedAt: ago(60_000) })]);
      renderManager();
      const live = await screen.findByText("scan.pdf: Processing");
      expect(live).toHaveAttribute("role", "status");
      await vi.advanceTimersByTimeAsync(10_000);
      expect(await screen.findByText("scan.pdf: Preparing the AI analysis…")).toHaveAttribute("role", "status");
      await vi.advanceTimersByTimeAsync(10_000);
      expect(await screen.findByText("scan.pdf: AI analysis ready")).toHaveAttribute("role", "status");
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows an error with a retry when the list cannot load", async () => {
    vi.mocked(api.getDocuments).mockRejectedValueOnce(new ApiError("Server error", 500)).mockResolvedValue([]);
    const user = userEvent.setup({ delay: null });
    renderManager();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We couldn't load the documents. Check your connection and try again.");
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/No documents yet/)).toBeInTheDocument();
    expect(api.getDocuments).toHaveBeenCalledTimes(2);
  });

  it("explains the empty state", async () => {
    vi.mocked(api.getDocuments).mockResolvedValue([]);
    renderManager();
    expect(await screen.findByText("No documents yet. Upload a proposal, logframe or report and Raqib will analyse it.")).toBeInTheDocument();
  });

  it("uploads a file with the chosen document type", async () => {
    vi.mocked(api.getDocuments).mockResolvedValue([]);
    vi.mocked(api.uploadDocument).mockResolvedValue(makeDocument({ parsingStatus: "pending", aiAnalysis: null }));
    const user = userEvent.setup({ delay: null });
    renderManager();
    await screen.findByText(/No documents yet/);

    const trigger = screen.getByRole("button", { name: "Upload document" });
    expect(trigger).toHaveClass("min-h-11");
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Upload a project document" });
    expect(dialog).toHaveAccessibleDescription("Raqib removes phone numbers, ID numbers and email addresses from the text it sends to the AI.");
    const submit = within(dialog).getByRole("button", { name: "Upload and analyse" });
    expect(submit).toBeDisabled();
    expect(submit).toHaveClass("min-h-11");

    const typeSelect = within(dialog).getByLabelText("Document type");
    expect(within(typeSelect).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Project proposal",
      "Logframe",
      "Theory of change",
      "Baseline report",
      "Donor guidelines",
      "Budget",
      "Other",
    ]);
    await user.selectOptions(typeSelect, "logframe");
    const fileInput = within(dialog).getByLabelText("File");
    expect(fileInput).toHaveAttribute("accept", ".pdf,.docx,.xlsx");
    expect(fileInput).toHaveAccessibleDescription(
      "PDF, Word (.docx) or Excel (.xlsx). Raqib cannot remove names or addresses: do not upload beneficiary lists or files that identify people.",
    );
    const warning = within(dialog).getByText(/Raqib cannot remove names or addresses/);
    expect(warning.parentElement?.querySelector("svg")).not.toBeNull();
    const file = new File(["%PDF"], "logframe.pdf", { type: "application/pdf" });
    await user.upload(fileInput, file);
    await user.click(submit);

    await waitFor(() => expect(api.uploadDocument).toHaveBeenCalledWith("p-1", file, "logframe"));
    expect(toast.success).toHaveBeenCalledWith("Document uploaded. Raqib is reading it now.");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(api.getDocuments).toHaveBeenCalledTimes(2));
  });

  it("keeps the dialog open and explains a failed upload", async () => {
    vi.mocked(api.getDocuments).mockResolvedValue([]);
    vi.mocked(api.uploadDocument).mockRejectedValue(new ApiError("File too large", 413));
    const user = userEvent.setup({ delay: null });
    renderManager();
    await screen.findByText(/No documents yet/);

    await user.click(screen.getByRole("button", { name: "Upload document" }));
    const dialog = screen.getByRole("dialog");
    await user.upload(within(dialog).getByLabelText("File"), new File(["x"], "big.pdf", { type: "application/pdf" }));
    await user.click(within(dialog).getByRole("button", { name: "Upload and analyse" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("We couldn't upload the document.", { description: "File too large" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("renders in Arabic, right to left, for an Arabic-speaking user", async () => {
    const arabicUser: AuthUser = {
      id: "u1", email: "sara@example.org", fullName: "Sara", role: "me_officer", languagePref: "ar",
      organization: { id: "org-1", name: "Org" },
    };
    vi.mocked(api.getUser).mockReturnValue(arabicUser);
    vi.mocked(api.getDocuments).mockResolvedValue([makeDocument()]);
    const user = userEvent.setup({ delay: null });
    renderWithClient(<AuthProvider><DocumentManager projectId="p-1" /></AuthProvider>);

    const heading = await screen.findByRole("heading", { name: "وثائق المشروع" });
    const section = heading.closest("section");
    expect(section).toHaveAttribute("dir", "rtl");
    expect(section).toHaveAttribute("lang", "ar");
    expect(screen.getByText("تمت المعالجة")).toBeInTheDocument();
    expect(screen.getByText("مقترح المشروع")).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("مقترح من الذكاء الاصطناعي — يُرجى المراجعة قبل الاعتماد");

    await user.click(screen.getByRole("button", { name: "عرض التحليل: proposal.pdf" }));
    const dialog = screen.getByRole("dialog", { name: "تحليل الوثيقة بالذكاء الاصطناعي" });
    expect(dialog).toHaveAttribute("dir", "rtl");
    expect(within(dialog).getByRole("heading", { name: "المستهدفات المذكورة" })).toBeInTheDocument();
    expect(within(dialog).getAllByText("ورد في نص الوثيقة")).toHaveLength(2);
    expect(within(dialog).getByRole("button", { name: "إغلاق" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "رفع وثيقة" }));
    const upload = screen.getByRole("dialog", { name: "رفع وثيقة للمشروع" });
    expect(within(upload).getByLabelText("الملف")).toHaveAccessibleDescription(
      "ملف PDF أو Word (.docx) أو Excel (.xlsx). لا يستطيع رقيب حذف الأسماء أو العناوين، فلا ترفع قوائم المستفيدين أو أي ملفات تكشف هوية الأشخاص.",
    );
  });
});
