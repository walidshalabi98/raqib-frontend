import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RiskAlerts from "@/components/project/RiskAlerts";
import { AuthProvider } from "@/contexts/AuthContext";
import { api } from "@/services/api";
import { renderWithClient } from "@/test/utils";
import type { AuthUser } from "@/types/api";

vi.mock("@/services/api", () => ({
  api: {
    getRiskAnalysis: vi.fn(),
    getUser: vi.fn(() => null),
    getToken: vi.fn(() => "token"),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getUser).mockReturnValue(null);
  vi.mocked(api.getRiskAnalysis).mockResolvedValue({ risks: [], analyzedAt: "2026-10-13T08:00:00.000Z" });
});

describe("RiskAlerts", () => {
  it("read-only: explains that staff run and review the analysis, and never calls it", async () => {
    renderWithClient(<RiskAlerts projectId="p-1" readOnly />);
    expect(screen.getByRole("heading", { name: "Risk analysis" })).toBeInTheDocument();
    expect(screen.getByText("Project staff run the AI risk analysis and review it. Reviewed findings are shared with you in reports.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(api.getRiskAnalysis).not.toHaveBeenCalled();
  });

  it("read-only in Arabic, right to left", () => {
    const arabic: AuthUser = { id: "u1", email: "d@example.org", fullName: "Donor", role: "donor_viewer", languagePref: "ar", organization: { id: "o", name: "Org" } };
    vi.mocked(api.getUser).mockReturnValue(arabic);
    renderWithClient(
      <AuthProvider>
        <RiskAlerts projectId="p-1" readOnly />
      </AuthProvider>,
    );
    const heading = screen.getByRole("heading", { name: "تحليل المخاطر" });
    const card = heading.closest("[dir]");
    expect(card).toHaveAttribute("dir", "rtl");
    expect(card).toHaveAttribute("lang", "ar");
  });

  it("staff (default): runs the analysis only when asked", async () => {
    const user = userEvent.setup({ delay: null });
    renderWithClient(<RiskAlerts projectId="p-1" />);
    expect(api.getRiskAnalysis).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /Run Risk Analysis/ }));
    expect(await screen.findByText("All indicators are on track!")).toBeInTheDocument();
    expect(api.getRiskAnalysis).toHaveBeenCalledWith("p-1");
  });
});
