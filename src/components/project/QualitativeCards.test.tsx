import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { QualitativeCards } from "@/components/project/QualitativeCards";
import { AuthProvider } from "@/contexts/AuthContext";
import { api } from "@/services/api";
import { renderWithClient } from "@/test/utils";
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
