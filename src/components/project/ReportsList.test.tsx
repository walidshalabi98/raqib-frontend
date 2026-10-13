import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReportsList } from "@/components/project/ReportsList";
import { api } from "@/services/api";
import { renderWithClient } from "@/test/utils";
import { ApiError } from "@/lib/apiError";
import { AuthProvider } from "@/contexts/AuthContext";

vi.mock("@/services/api", () => ({
  api: {
    getReports: vi.fn(),
    generateReport: vi.fn(),
    getUser: vi.fn(() => null),
    getToken: vi.fn(() => "token"),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getReports).mockResolvedValue([{ id: "r-1", title: "Q3 summary", type: "quarterly_summary" }]);
});

describe("ReportsList", () => {
  it("shows report types and periods in the user's language (Arabic donors see Arabic labels)", async () => {
    vi.mocked(api.getUser).mockReturnValue({ id: "u1", email: "d@example.org", fullName: "Donor", role: "donor_viewer", languagePref: "ar" } as never);
    vi.mocked(api.getReports).mockResolvedValue([
      { id: "r-1", title: "Q3 summary", type: "quarterly_summary", donorFormat: "echo", periodStart: "2026-07-01", periodEnd: "2026-09-30" },
    ]);
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
  });

  it("offers Generate Report by default (staff)", async () => {
    renderWithClient(<ReportsList projectId="p-1" />);
    expect(await screen.findByText("Q3 summary")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Generate Report/ })).toBeInTheDocument();
  });

  it("only lists reports when the role cannot generate them (donor viewers)", async () => {
    renderWithClient(<ReportsList projectId="p-1" canGenerate={false} />);
    expect(await screen.findByText("Q3 summary")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Generate Report/ })).not.toBeInTheDocument();
    expect(api.generateReport).not.toHaveBeenCalled();
  });

  it("has translated empty states: staff and read-only (donors see published reports only)", async () => {
    vi.mocked(api.getReports).mockResolvedValue([]);
    const { unmount } = renderWithClient(<ReportsList projectId="p-1" />);
    expect(await screen.findByText("No reports generated yet.")).toBeInTheDocument();
    unmount();
    renderWithClient(<ReportsList projectId="p-1" canGenerate={false} />);
    expect(await screen.findByText("No reports have been published yet.")).toBeInTheDocument();
  });

  it("shows an error with a retry, never the empty state, when the request fails", async () => {
    vi.mocked(api.getReports).mockRejectedValueOnce(new Error("Internal server error")).mockResolvedValueOnce([{ id: "r-1", title: "Q3 summary", type: "quarterly_summary" }]);
    const user = userEvent.setup({ delay: null });
    renderWithClient(<ReportsList projectId="p-1" canGenerate={false} />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We couldn't load the reports.");
    expect(screen.queryByText("No reports have been published yet.")).not.toBeInTheDocument();
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
