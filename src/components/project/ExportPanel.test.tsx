import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import ExportPanel from "@/components/project/ExportPanel";
import { AuthProvider } from "@/contexts/AuthContext";
import { ApiError } from "@/lib/apiError";
import { downloadCSV, downloadJSON } from "@/lib/csv";
import { queryKeys } from "@/lib/queryKeys";
import { api } from "@/services/api";
import { createTestQueryClient, renderWithClient } from "@/test/utils";
import { makeDonorSummary } from "@/test/fixtures";
import type { AuthUser } from "@/types/api";

vi.mock("@/services/api", () => ({
  api: {
    exportIndicators: vi.fn(),
    exportBeneficiaries: vi.fn(),
    exportProject: vi.fn(),
    getBeneficiaryStats: vi.fn(),
    getUser: vi.fn(() => null),
    getToken: vi.fn(() => "token"),
  },
}));

vi.mock("@/lib/csv", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/csv")>()),
  downloadCSV: vi.fn(() => true),
  downloadJSON: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

const PERSONAL_DATA_NOTE = "This file contains beneficiaries' personal data. Store it securely, share it only with people who need it, and delete it when you no longer need it.";
const DONOR_NOTE = "Donor exports contain results and aggregated figures only. Beneficiaries' personal data is never included.";
const FORBIDDEN = "You don't have permission to do this. Ask your organisation's admin if you need access.";

function renderPanel(audience?: "staff" | "donor") {
  const client = createTestQueryClient();
  // The project page has loaded the project already: its name names the files.
  client.setQueryData(queryKeys.project("p-1"), { id: "p-1", name: "Hebron Youth" });
  return renderWithClient(
    <AuthProvider>
      <ExportPanel projectId="p-1" audience={audience} />
    </AuthProvider>,
    client,
  );
}

const donorExport = {
  audience: "donor",
  personalData: "excluded",
  project: { name: "Hebron Youth" },
  frameworks: [],
  indicators: [],
  beneficiarySummary: makeDonorSummary(),
  qualitativeEntries: [],
  assessments: [],
  exportedAt: "2026-10-13T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getUser).mockReturnValue(null);
  vi.mocked(downloadCSV).mockReturnValue(true);
  vi.mocked(api.exportIndicators).mockResolvedValue({
    project: { name: "Hebron Youth" },
    indicators: [{ indicator: "% of youth employed", indicatorAr: null, level: "outcome", method: "hh_survey", frequency: "annual", baseline: "20%", target: "60%", current: null, unit: "percent", status: "on_track", dataPoints: [{}, {}] }],
  });
});

afterEach(() => vi.clearAllMocks());

describe("ExportPanel: staff (default)", () => {
  it("offers indicators, the register and the full project, with a personal-data note under both personal-data files", async () => {
    renderPanel();
    expect(screen.getByRole("heading", { name: "Export data" })).toBeInTheDocument();
    for (const name of ["Indicators", "Beneficiary register", "Full project"]) expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    const notes = screen.getAllByRole("note");
    expect(notes).toHaveLength(2);
    for (const note of notes) {
      expect(note).toHaveTextContent(PERSONAL_DATA_NOTE);
      expect(note.querySelector("svg")).not.toBeNull();
    }
    expect(screen.queryByText(DONOR_NOTE)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Beneficiary summary" })).not.toBeInTheDocument();
  });

  it("exports the full project from the fixed export path", async () => {
    const staffExport = { audience: "staff", project: { name: "Hebron Youth" }, beneficiaries: [{ name: "Rasha" }] };
    vi.mocked(api.exportProject).mockResolvedValue(staffExport as never);
    const user = userEvent.setup({ delay: null });
    renderPanel("staff");
    await user.click(screen.getByRole("button", { name: "Export JSON Full project" }));
    await waitFor(() => expect(downloadJSON).toHaveBeenCalledWith(staffExport, "Hebron Youth_full_export.json"));
    expect(api.exportProject).toHaveBeenCalledWith("p-1");
    expect(toast.success).toHaveBeenCalledWith("Export ready");
  });

  it("exports the register and the indicators as CSV", async () => {
    vi.mocked(api.exportBeneficiaries).mockResolvedValue({ project: { name: "Hebron Youth" }, beneficiaries: [{ name: "Rasha", gender: "female", status: "active", servicesReceived: 1 }] });
    const user = userEvent.setup({ delay: null });
    renderPanel();
    await user.click(screen.getByRole("button", { name: "Export CSV Beneficiary register" }));
    await waitFor(() => expect(downloadCSV).toHaveBeenCalledWith([expect.objectContaining({ Name: "Rasha", Gender: "female" })], "Hebron Youth_beneficiaries.csv"));

    await user.click(screen.getByRole("button", { name: "Export CSV Indicators" }));
    await waitFor(() =>
      expect(downloadCSV).toHaveBeenCalledWith([expect.objectContaining({ Indicator: "% of youth employed", Target: "60%", "Data Points": 2 })], "Hebron Youth_indicators.csv"),
    );
  });

  it("says when there is nothing to export", async () => {
    vi.mocked(downloadCSV).mockReturnValue(false);
    const user = userEvent.setup({ delay: null });
    renderPanel();
    await user.click(screen.getByRole("button", { name: "Export CSV Indicators" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("There is no data to export yet."));
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe("ExportPanel: donor viewer", () => {
  it("never offers the register; shows the donor note, the summary and the results", () => {
    renderPanel("donor");
    expect(screen.getByRole("note")).toHaveTextContent(DONOR_NOTE);
    for (const name of ["Indicators", "Beneficiary summary", "Project results"]) expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Beneficiary register" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Full project" })).not.toBeInTheDocument();
    expect(screen.queryByText(PERSONAL_DATA_NOTE)).not.toBeInTheDocument();
    expect(api.exportBeneficiaries).not.toHaveBeenCalled();
  });

  it("builds the summary CSV from the stats endpoint, with hidden counts as text", async () => {
    vi.mocked(api.getBeneficiaryStats).mockResolvedValue(makeDonorSummary());
    const user = userEvent.setup({ delay: null });
    renderPanel("donor");
    await user.click(screen.getByRole("button", { name: "Export CSV Beneficiary summary" }));
    await waitFor(() => expect(downloadCSV).toHaveBeenCalledTimes(1));
    const [rows, name] = vi.mocked(downloadCSV).mock.calls[0];
    expect(name).toBe("Hebron Youth_beneficiary_summary.csv");
    expect(rows).toContainEqual({ Breakdown: "By sex", Category: "Male", People: "Hidden" });
    expect(rows).toContainEqual({ Breakdown: "Total beneficiaries", Category: "", People: 10 });
    expect(rows[rows.length - 1].Breakdown).toContain("rounded to the nearest 5");
    expect(api.getBeneficiaryStats).toHaveBeenCalledWith("p-1");
    expect(api.exportBeneficiaries).not.toHaveBeenCalled();
  });

  it("exports the project results without personal data", async () => {
    vi.mocked(api.exportProject).mockResolvedValue(donorExport as never);
    const user = userEvent.setup({ delay: null });
    renderPanel("donor");
    await user.click(screen.getByRole("button", { name: "Export JSON Project results" }));
    await waitFor(() => expect(downloadJSON).toHaveBeenCalledWith(donorExport, "Hebron Youth_results.json"));
    expect(api.exportProject).toHaveBeenCalledWith("p-1");
  });

  it("refuses to save a staff export (personal data) for a donor, e.g. from an older backend", async () => {
    vi.mocked(api.exportProject).mockResolvedValue({ project: { name: "Hebron Youth" }, beneficiaries: [{ name: "Rasha", phoneNumber: "0599123456" }] } as never);
    const user = userEvent.setup({ delay: null });
    renderPanel("donor");
    await user.click(screen.getByRole("button", { name: "Export JSON Project results" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("We couldn't export the data."));
    expect(downloadJSON).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("explains, and saves nothing, when the role changed during the export (a promoted donor gets the staff export)", async () => {
    vi.mocked(api.exportProject).mockResolvedValue({ audience: "staff", project: { name: "Hebron Youth" }, beneficiaries: [{ fullName: "Rasha", phoneNumber: "0599123456" }] } as never);
    const user = userEvent.setup({ delay: null });
    renderPanel("donor");
    await user.click(screen.getByRole("button", { name: "Export JSON Project results" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      "Your access changed while the file was being prepared, so it was not saved. The export options now match your role: choose an export again.",
    ));
    expect(downloadJSON).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("explains a refusal (403) in a toast", async () => {
    vi.mocked(api.exportIndicators).mockRejectedValue(new ApiError("Insufficient permissions", 403));
    const user = userEvent.setup({ delay: null });
    renderPanel("donor");
    await user.click(screen.getByRole("button", { name: "Export CSV Indicators" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(FORBIDDEN));
    expect(downloadCSV).not.toHaveBeenCalled();
  });

  it("is translated and right to left for an Arabic-speaking donor", async () => {
    const arabic: AuthUser = { id: "u1", email: "d@example.org", fullName: "Donor", role: "donor_viewer", languagePref: "ar", organization: { id: "org-1", name: "Org" } };
    vi.mocked(api.getUser).mockReturnValue(arabic);
    vi.mocked(api.exportIndicators).mockRejectedValue(new ApiError("Insufficient permissions", 403));
    const user = userEvent.setup({ delay: null });
    renderPanel("donor");
    const section = screen.getByRole("heading", { name: "تصدير البيانات" }).closest("section") as HTMLElement;
    expect(section).toHaveAttribute("dir", "rtl");
    expect(section).toHaveAttribute("lang", "ar");
    expect(within(section).getByRole("heading", { name: "ملخص المستفيدين" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "تصدير CSV المؤشرات" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("ليست لديك صلاحية للقيام بهذا الإجراء. تواصل مع مسؤول مؤسستك إذا كنت بحاجة إلى هذه الصلاحية."));
  });
});
