import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import DocumentManager from "@/components/project/DocumentManager";
import { AuthProvider } from "@/contexts/AuthContext";
import { api } from "@/services/api";
import { ApiError } from "@/lib/apiError";
import { LEGACY_ANALYSIS_MARKER } from "@/lib/documentAnalysis";
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
    { indicator: "% of youth employed", target: "60%", timeline: "by end of 2027" },
    { indicator: "", target: "500 trainees", timeline: "" },
  ],
  recommendations: ["Add sex disaggregation to output indicators"],
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
    parsedText: "Extracted text",
    aiAnalysis: analysis,
    ...overrides,
  };
}

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

    expect(screen.getByRole("note")).toHaveTextContent(AI_LABEL);
    expect(screen.getByText("Three-year livelihoods project for youth in Hebron.")).toBeInTheDocument();
    // The card shows the first three findings; the dialog shows all of them.
    expect(screen.getByText("Finding three")).toBeInTheDocument();
    expect(screen.queryByText("Finding four")).not.toBeInTheDocument();
  });

  it("reads the analysis of a legacy row from parsedText", async () => {
    const legacy = {
      documentType: "logframe",
      summary: "Legacy summary of the logframe.",
      keyFindings: ["Legacy finding"],
      indicators_mentioned: ["Number of trainees"],
      targets_mentioned: [{ indicator: "Number of trainees", target: "500", timeline: "2025" }],
      recommendations: [],
    };
    vi.mocked(api.getDocuments).mockResolvedValue([
      makeDocument({ aiAnalysis: null, parsedText: `Text\n\n${LEGACY_ANALYSIS_MARKER}\n${JSON.stringify(legacy)}` }),
    ]);
    const user = userEvent.setup({ delay: null });
    renderManager();

    expect(await screen.findByText("Legacy summary of the logframe.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "View analysis: proposal.pdf" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Number of trainees", { selector: "bdi" })).toBeInTheDocument();
    expect(within(dialog).getByText("500")).toBeInTheDocument();
  });

  it("does not show an analysis when the legacy JSON is invalid", async () => {
    vi.mocked(api.getDocuments).mockResolvedValue([
      makeDocument({ aiAnalysis: null, parsedText: `Text\n${LEGACY_ANALYSIS_MARKER}\n{ broken` }),
    ]);
    renderManager();
    expect(await screen.findByText("proposal.pdf")).toBeInTheDocument();
    expect(screen.queryByText(AI_LABEL)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /View analysis/ })).not.toBeInTheDocument();
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
    expect(within(dialog).getByText(/Copied from the document as written/)).toBeInTheDocument();
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
      makeDocument({ id: "d-failed", fileName: "scan.pdf", parsingStatus: "failed", aiAnalysis: null, parsedText: null }),
      makeDocument({ id: "d-pending", fileName: "budget.xlsx", fileType: "budget", parsingStatus: "pending", aiAnalysis: null, parsedText: null }),
      makeDocument({ id: "d-processing", fileName: "logframe.docx", fileType: "logframe", parsingStatus: "processing", aiAnalysis: null, parsedText: null }),
      makeDocument({ id: "d-waiting", fileName: "report.pdf", aiAnalysis: null, uploadedAt: new Date().toISOString() }),
    ]);
    renderManager();

    expect(await screen.findByText("Could not be read")).toBeInTheDocument();
    expect(screen.getByText("We couldn't read this file. Try a Word file or a text-based PDF.")).toBeInTheDocument();
    expect(screen.getByText("Waiting to process")).toBeInTheDocument();
    expect(screen.getByText("Processing")).toBeInTheDocument();
    expect(screen.getByText("Processed")).toBeInTheDocument();
    expect(screen.getByText("Preparing the AI analysis…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /View analysis/ })).not.toBeInTheDocument();
  });

  it("refreshes the list while a document is being processed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.mocked(api.getDocuments)
        .mockResolvedValueOnce([makeDocument({ parsingStatus: "processing", aiAnalysis: null, parsedText: null })])
        .mockResolvedValue([makeDocument()]);
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

    await user.click(screen.getByRole("button", { name: "Upload document" }));
    const dialog = screen.getByRole("dialog", { name: "Upload a project document" });
    const submit = within(dialog).getByRole("button", { name: "Upload and analyse" });
    expect(submit).toBeDisabled();

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
    expect(fileInput).toHaveAccessibleDescription("PDF, Word or Excel (XLSX).");
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
    expect(within(dialog).getByRole("button", { name: "إغلاق" })).toBeInTheDocument();
  });
});
