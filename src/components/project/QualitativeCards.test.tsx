import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { QualitativeCards } from "@/components/project/QualitativeCards";
import { AuthProvider } from "@/contexts/AuthContext";
import { api } from "@/services/api";
import { renderWithClient } from "@/test/utils";
import { makeDonorEntry } from "@/test/fixtures";
import { ApiError } from "@/lib/apiError";
import type { AuthUser, QualitativeEntryCreateResponse, RedactionCounts } from "@/types/api";

vi.mock("@/services/api", () => ({
  api: {
    getQualitativeEntries: vi.fn(),
    addQualitativeEntry: vi.fn(),
    uploadQualitativeDocument: vi.fn(),
    codeQualitativeEntry: vi.fn(),
    getUser: vi.fn(() => null),
    getToken: vi.fn(() => null),
  },
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

const HINT = "Phone numbers, ID numbers and email addresses are removed when you save. Do not type names or addresses of beneficiaries.";
const HINT_AR = "تُحذف أرقام الهواتف وأرقام الهوية وعناوين البريد الإلكتروني عند الحفظ. لا تكتب أسماء المستفيدين أو عناوينهم.";
const UPLOAD_WARNING = "Raqib cannot remove names or addresses: do not upload beneficiary lists or files that identify people.";
const REDACTED = "Phone numbers, ID numbers or email addresses were removed before saving.";
const REDACTED_AR = "حُذفت أرقام هواتف أو أرقام هوية أو عناوين بريد إلكتروني قبل الحفظ.";

function savedEntry(redactions?: RedactionCounts): QualitativeEntryCreateResponse {
  return {
    id: "q-1",
    projectId: "p-1",
    assessmentId: null,
    entryType: "fgd_transcript",
    title: "FGD with women farmers",
    content: "Call [phone removed] for follow-up.",
    participants: null,
    location: null,
    dateConducted: null,
    facilitator: null,
    themes: null,
    sentiment: null,
    linkedIndicators: null,
    attachments: null,
    createdAt: "2026-10-12T09:00:00.000Z",
    ...(redactions ? { redactions } : {}),
  };
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Add Entry" }));
  return screen.getByRole("dialog");
}

/** Opens the dialog, types a title and notes, and saves them. */
async function saveEntry() {
  const user = userEvent.setup({ delay: null });
  renderWithClient(<QualitativeCards projectId="p-1" />);
  const dialog = await openDialog(user);
  await user.type(within(dialog).getByPlaceholderText("FGD with women farmers - Hebron"), "FGD with women farmers");
  await user.type(within(dialog).getByLabelText("Content *"), "Call 0599123456 for follow-up.");
  await user.click(within(dialog).getByRole("button", { name: "Add Entry (AI will auto-analyze)" }));
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Entry added — AI is analyzing themes..."));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getUser).mockReturnValue(null);
  vi.mocked(api.getQualitativeEntries).mockResolvedValue([]);
});

describe("QualitativeCards: personal data in typed notes", () => {
  it("shows the hint under the content field and links it with aria-describedby", async () => {
    const user = userEvent.setup({ delay: null });
    renderWithClient(<QualitativeCards projectId="p-1" />);
    const dialog = await openDialog(user);

    const content = within(dialog).getByLabelText("Content *");
    expect(content).toHaveAccessibleDescription(HINT);
    const hint = document.getElementById(content.getAttribute("aria-describedby") ?? "");
    expect(hint).toHaveTextContent(HINT);
    expect(hint).toBeVisible();
    expect(hint).toHaveAttribute("lang", "en");
    expect(hint).toHaveAttribute("dir", "ltr");
    // Text plus icon, not colour alone.
    expect(hint?.querySelector("svg")).not.toBeNull();
  });

  it("shows the hint on the transcript upload too, linked to the file input with the existing warning", async () => {
    const user = userEvent.setup({ delay: null });
    renderWithClient(<QualitativeCards projectId="p-1" />);
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole("tab", { name: "Upload Document" }));

    const fileInput = dialog.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    expect(fileInput).toHaveAccessibleDescription(`${HINT} ${UPLOAD_WARNING}`);
  });

  it("tells the user when phone numbers, ID numbers or email addresses were removed", async () => {
    vi.mocked(api.addQualitativeEntry).mockResolvedValue(savedEntry({ phone: 1, idNumber: 0, email: 2 }));
    await saveEntry();

    expect(api.addQualitativeEntry).toHaveBeenCalledWith("p-1", expect.objectContaining({ content: "Call 0599123456 for follow-up." }));
    expect(toast.info).toHaveBeenCalledTimes(1);
    expect(toast.info).toHaveBeenCalledWith(REDACTED);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("says nothing more when nothing was removed", async () => {
    vi.mocked(api.addQualitativeEntry).mockResolvedValue(savedEntry({ phone: 0, idNumber: 0, email: 0 }));
    await saveEntry();
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("says nothing more when an older backend sends no counts", async () => {
    vi.mocked(api.addQualitativeEntry).mockResolvedValue(savedEntry());
    await saveEntry();
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("shows no redaction message when saving fails", async () => {
    vi.mocked(api.addQualitativeEntry).mockRejectedValue(new Error("Too many requests"));
    const user = userEvent.setup({ delay: null });
    renderWithClient(<QualitativeCards projectId="p-1" />);
    const dialog = await openDialog(user);
    await user.type(within(dialog).getByPlaceholderText("FGD with women farmers - Hebron"), "FGD");
    await user.type(within(dialog).getByLabelText("Content *"), "Notes");
    await user.click(within(dialog).getByRole("button", { name: "Add Entry (AI will auto-analyze)" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Too many requests"));
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("shows the hint and the message in Arabic, right to left, for an Arabic-speaking user", async () => {
    const arabicUser: AuthUser = {
      id: "u1", email: "sara@example.org", fullName: "Sara", role: "me_officer", languagePref: "ar",
      organization: { id: "org-1", name: "Org" },
    };
    vi.mocked(api.getUser).mockReturnValue(arabicUser);
    vi.mocked(api.addQualitativeEntry).mockResolvedValue(savedEntry({ phone: 0, idNumber: 1, email: 0 }));
    const user = userEvent.setup({ delay: null });
    renderWithClient(<AuthProvider><QualitativeCards projectId="p-1" /></AuthProvider>);
    const dialog = await openDialog(user);

    const content = within(dialog).getByLabelText("Content *");
    expect(content).toHaveAccessibleDescription(HINT_AR);
    const hint = document.getElementById(content.getAttribute("aria-describedby") ?? "");
    expect(hint).toHaveAttribute("lang", "ar");
    expect(hint).toHaveAttribute("dir", "rtl");

    await user.type(within(dialog).getByPlaceholderText("FGD with women farmers - Hebron"), "FGD");
    await user.type(content, "Notes");
    await user.click(within(dialog).getByRole("button", { name: "Add Entry (AI will auto-analyze)" }));
    await waitFor(() => expect(toast.info).toHaveBeenCalledWith(REDACTED_AR));
  });
});

describe("QualitativeCards: read only (donor viewers)", () => {
  const DONOR_NOTE =
    "Transcripts, notes and AI-suggested themes stay with project staff. You see the type of each activity, the month and the number of participants. Project staff share reviewed findings in reports.";
  const AI_LABEL = "AI suggested — review before approval";

  it("shows type, month and participants only: no add, upload or AI buttons, no AI output, and cards that do not open", async () => {
    vi.mocked(api.getQualitativeEntries).mockResolvedValue([
      makeDonorEntry(),
      makeDonorEntry({ id: "q-2", entryType: "kii_notes", monthConducted: null, participants: 1 }),
    ]);
    const user = userEvent.setup({ delay: null });
    renderWithClient(<QualitativeCards projectId="p-1" readOnly />);

    const first = (await screen.findByRole("heading", { name: "Focus group discussion · March 2026" })).closest("article") as HTMLElement;
    expect(screen.queryByRole("button", { name: "Add Entry" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /AI Analyze/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(within(first).getByText("12 participants")).toBeInTheDocument();

    // Without a month the heading is the type; one participant reads in the singular.
    const second = screen.getByRole("heading", { name: "Key informant interview" }).closest("article") as HTMLElement;
    expect(within(second).getByText("1 participant")).toBeInTheDocument();

    // Donors receive no unreviewed AI output, so there is nothing to label.
    expect(screen.queryByText(AI_LABEL)).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Coded findings" })).not.toBeInTheDocument();

    await user.click(first);
    expect(first.querySelector(".border-t")).toBeNull();

    const notes = screen.getAllByRole("note");
    expect(notes).toHaveLength(1);
    expect(notes[0]).toHaveTextContent(DONOR_NOTE);
    expect(api.codeQualitativeEntry).not.toHaveBeenCalled();
  });

  it("never shows a staff entry's title, notes or AI coding in the read-only view", async () => {
    vi.mocked(api.getQualitativeEntries).mockResolvedValue([
      { ...savedEntry(), title: "KII with Ahmad (Beit Ummar)", content: "Notes", dateConducted: "2026-04-03", participants: 1, themes: ["water"], sentiment: "negative" },
    ]);
    renderWithClient(<QualitativeCards projectId="p-1" readOnly />);
    expect(await screen.findByRole("heading", { name: "Focus group discussion · April 2026" })).toBeInTheDocument();
    expect(screen.queryByText(/Ahmad/)).not.toBeInTheDocument();
    expect(screen.queryByText("water")).not.toBeInTheDocument();
    expect(screen.queryByText(/Negative/)).not.toBeInTheDocument();
    expect(screen.queryByText(AI_LABEL)).not.toBeInTheDocument();
  });

  it("has a read-only empty state", async () => {
    renderWithClient(<QualitativeCards projectId="p-1" readOnly />);
    expect(await screen.findByText("No qualitative findings yet.")).toBeInTheDocument();
    expect(screen.queryByText(/upload documents for AI analysis/)).not.toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(DONOR_NOTE);
  });

  it("shows an error with a retry, never the empty state, when the request fails", async () => {
    vi.mocked(api.getQualitativeEntries).mockRejectedValueOnce(new Error("Internal server error")).mockResolvedValueOnce([makeDonorEntry()]);
    const user = userEvent.setup({ delay: null });
    renderWithClient(<QualitativeCards projectId="p-1" readOnly />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We couldn't load the qualitative data.");
    expect(screen.queryByText("No qualitative findings yet.")).not.toBeInTheDocument();
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Focus group discussion · March 2026" })).toBeInTheDocument();
    expect(api.getQualitativeEntries).toHaveBeenCalledTimes(2);
  });

  it("explains a 403 and announces loading", async () => {
    let reject: (err: unknown) => void = () => {};
    vi.mocked(api.getQualitativeEntries).mockReturnValue(new Promise((_, r) => { reject = r; }));
    renderWithClient(<QualitativeCards projectId="p-1" readOnly />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
    reject(new ApiError("Insufficient permissions", 403));
    expect(await screen.findByRole("alert")).toHaveTextContent("You don't have permission to do this.");
  });

  it("reads in Arabic with Arabic plural forms and the neutral method names", async () => {
    const arabicDonor: AuthUser = {
      id: "u1", email: "d@example.org", fullName: "Donor", role: "donor_viewer", languagePref: "ar",
      organization: { id: "org-1", name: "Org" },
    };
    vi.mocked(api.getUser).mockReturnValue(arabicDonor);
    vi.mocked(api.getQualitativeEntries).mockResolvedValue([
      makeDonorEntry({ participants: 2 }),
      makeDonorEntry({ id: "q-2", participants: 5 }),
      makeDonorEntry({ id: "q-3", participants: 11 }),
      makeDonorEntry({ id: "q-4", entryType: "kii_notes", monthConducted: "2026-04", participants: 1 }),
    ]);
    renderWithClient(<AuthProvider><QualitativeCards projectId="p-1" readOnly /></AuthProvider>);

    const headings = await screen.findAllByRole("heading", { name: /^مجموعة نقاش مركّزة · مارس 2026$/ });
    expect(headings).toHaveLength(3);
    expect(screen.getByRole("heading", { name: "مقابلة مع مصدر معلومات رئيسي · أبريل 2026" })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/مُخبر|مخبر/);
    expect(screen.getByText("مشاركان")).toBeInTheDocument();
    expect(screen.getByText("5 مشاركين")).toBeInTheDocument();
    expect(screen.getByText("11 مشاركًا")).toBeInTheDocument();
    expect(screen.queryByText("مقترح من الذكاء الاصطناعي — يُرجى المراجعة قبل الاعتماد")).not.toBeInTheDocument();
    expect(headings[0].closest('[lang="ar"]')).toHaveAttribute("dir", "rtl");
  });

  it("keeps the default (staff) view: Add Entry and expandable cards", async () => {
    vi.mocked(api.getQualitativeEntries).mockResolvedValue([{ ...savedEntry(), content: "Full notes of the discussion." }]);
    const user = userEvent.setup({ delay: null });
    renderWithClient(<QualitativeCards projectId="p-1" />);
    expect(await screen.findByRole("button", { name: "Add Entry" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /AI Analyze/ })).toBeInTheDocument();
    await user.click(screen.getByText("FGD with women farmers"));
    expect(await screen.findByText("Full notes of the discussion.")).toBeInTheDocument();
    expect(screen.queryByText(DONOR_NOTE)).not.toBeInTheDocument();
  });
});

describe("QualitativeCards: AI coding for staff", () => {
  const AI_LABEL = "AI suggested — review before approval";

  it("shows sentiment and themes together under the AI label", async () => {
    vi.mocked(api.getQualitativeEntries).mockResolvedValue([{ ...savedEntry(), themes: ["access_to_services"], sentiment: "mixed" }]);
    renderWithClient(<QualitativeCards projectId="p-1" />);
    const block = await screen.findByRole("group", { name: "Coded findings" });
    expect(within(block).getByRole("note")).toHaveTextContent(AI_LABEL);
    expect(within(block).getByText("Overall sentiment: Mixed")).toBeInTheDocument();
    expect(within(block).getByText("access to services")).toBeInTheDocument();
  });

  it("labels a sentiment as AI output even when the coding returned no themes", async () => {
    vi.mocked(api.getQualitativeEntries).mockResolvedValue([{ ...savedEntry(), themes: [], sentiment: "negative" }]);
    renderWithClient(<QualitativeCards projectId="p-1" />);
    const block = await screen.findByRole("group", { name: "Coded findings" });
    expect(within(block).getByRole("note")).toHaveTextContent(AI_LABEL);
    expect(within(block).getByText("Overall sentiment: Negative")).toBeInTheDocument();
    expect(screen.getAllByText(/Negative/)).toHaveLength(1);
  });

  it("shows no AI block before coding", async () => {
    vi.mocked(api.getQualitativeEntries).mockResolvedValue([savedEntry()]);
    renderWithClient(<QualitativeCards projectId="p-1" />);
    expect(await screen.findByText("FGD with women farmers")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Coded findings" })).not.toBeInTheDocument();
    expect(screen.queryByText(AI_LABEL)).not.toBeInTheDocument();
  });

  it("shows an error state to staff too", async () => {
    vi.mocked(api.getQualitativeEntries).mockRejectedValue(new Error("boom"));
    renderWithClient(<QualitativeCards projectId="p-1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't load the qualitative data.");
    expect(screen.queryByText("No qualitative data entries yet.")).not.toBeInTheDocument();
  });
});

describe("QualitativeCards: archived project (staff, read-only)", () => {
  it("keeps the staff view of the entries but offers no adding, uploading or AI coding", async () => {
    vi.mocked(api.getQualitativeEntries).mockResolvedValue([{ ...savedEntry(), content: "Full notes of the discussion." }]);
    const user = userEvent.setup({ delay: null });
    renderWithClient(<QualitativeCards projectId="p-1" canManage={false} />);
    expect(await screen.findByText("FGD with women farmers")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Entry" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /AI Analyze/ })).not.toBeInTheDocument();
    await user.click(screen.getByText("FGD with women farmers"));
    expect(await screen.findByText("Full notes of the discussion.")).toBeInTheDocument();
  });

  it("does not invite new entries when there are none", async () => {
    vi.mocked(api.getQualitativeEntries).mockResolvedValue([]);
    renderWithClient(<QualitativeCards projectId="p-1" canManage={false} />);
    expect(await screen.findByText("No qualitative data entries yet.")).toBeInTheDocument();
    expect(screen.queryByText(/Add interview transcripts/)).not.toBeInTheDocument();
  });
});
