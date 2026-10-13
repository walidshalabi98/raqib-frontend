import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Beneficiaries from "@/pages/Beneficiaries";
import { AuthProvider } from "@/contexts/AuthContext";
import { api } from "@/services/api";
import { makeDonorSummary } from "@/test/fixtures";
import { ApiError } from "@/lib/apiError";
import { renderWithClient } from "@/test/utils";
import type { AuthUser, Project } from "@/types/api";

vi.mock("@/services/api", () => ({
  api: {
    getProjects: vi.fn(),
    getBeneficiaries: vi.fn(),
    getBeneficiaryStats: vi.fn(),
    createBeneficiary: vi.fn(),
    getUser: vi.fn(() => null),
    getToken: vi.fn(() => "token"),
  },
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

function signInAs(role: string, languagePref = "en") {
  const user: AuthUser = { id: "u1", email: "u@example.org", fullName: "User", role, languagePref, organization: { id: "org-1", name: "Org" } };
  vi.mocked(api.getUser).mockReturnValue(user);
}

async function renderAndSelectProject() {
  const user = userEvent.setup({ delay: null });
  renderWithClient(
    <AuthProvider>
      <Beneficiaries />
    </AuthProvider>,
  );
  await user.click(await screen.findByRole("combobox"));
  await user.click(await screen.findByRole("option", { name: "Hebron Youth Employment" }));
  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getProjects).mockResolvedValue([{ id: "p-1", name: "Hebron Youth Employment" } as Project]);
  vi.mocked(api.getBeneficiaryStats).mockResolvedValue(makeDonorSummary());
  vi.mocked(api.getBeneficiaries).mockResolvedValue({
    beneficiaries: [
      { id: "b-1", fullName: "Rasha Testperson", gender: "female", age: 34, governorate: "Hebron", status: "active", services: [], registrationDate: "2026-03-01T00:00:00.000Z" },
    ],
    summary: { total: 1, active: 1, byGender: [{ gender: "female", _count: 1 }] },
  });
});

describe("Beneficiaries page: donor viewer", () => {
  it("never requests the register and shows the summary instead", async () => {
    signInAs("donor_viewer");
    await renderAndSelectProject();

    expect(await screen.findByRole("heading", { name: "Beneficiary summary" })).toBeInTheDocument();
    expect(api.getBeneficiaryStats).toHaveBeenCalledWith("p-1");
    expect(api.getBeneficiaries).not.toHaveBeenCalled();
    expect(screen.queryByText("Rasha Testperson")).not.toBeInTheDocument();

    // Hidden counts are shown as text; the explanation is a note.
    const sex = await screen.findByRole("table", { name: "By sex" });
    expect(within(sex).getByRole("rowheader", { name: "Male" }).closest("tr")).toHaveTextContent("Hidden");
    expect(screen.getByRole("note")).toHaveTextContent("Individual beneficiary records are visible to project staff only.");

    // Write controls and the name search are hidden, not disabled.
    expect(screen.queryByRole("button", { name: /Register Beneficiary/ })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Search beneficiaries...")).not.toBeInTheDocument();
  });

  it("asks a donor to pick a project before showing anything", async () => {
    signInAs("donor_viewer");
    renderWithClient(
      <AuthProvider>
        <Beneficiaries />
      </AuthProvider>,
    );
    expect(await screen.findByText("Select a project to see its beneficiary summary.")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Project" })).toBeInTheDocument();
    expect(api.getBeneficiaryStats).not.toHaveBeenCalled();
    expect(api.getBeneficiaries).not.toHaveBeenCalled();
  });

  it("treats an unknown role like a donor (deny by default)", async () => {
    signInAs("auditor");
    await renderAndSelectProject();
    expect(await screen.findByRole("heading", { name: "Beneficiary summary" })).toBeInTheDocument();
    expect(api.getBeneficiaries).not.toHaveBeenCalled();
  });

  it("shows the summary right to left in Arabic", async () => {
    signInAs("donor_viewer", "ar");
    await renderAndSelectProject();
    const heading = await screen.findByRole("heading", { name: "ملخص المستفيدين" });
    const section = heading.closest("section");
    expect(section).toHaveAttribute("dir", "rtl");
    expect(section).toHaveAttribute("lang", "ar");
    expect(await screen.findByRole("table", { name: "حسب الجنس" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "حسب المحافظة" })).toBeInTheDocument();
    expect(api.getBeneficiaries).not.toHaveBeenCalled();
  });
});

describe("Beneficiaries page: M&E officer", () => {
  it("keeps today's register, search and Register button", async () => {
    signInAs("me_officer");
    renderWithClient(
      <AuthProvider>
        <Beneficiaries />
      </AuthProvider>,
    );
    expect(await screen.findByRole("button", { name: /Register Beneficiary/ })).toBeDisabled();
    expect(screen.getByText("Select a project to view beneficiaries")).toBeInTheDocument();

    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Hebron Youth Employment" }));

    expect(await screen.findByText("Rasha Testperson")).toBeInTheDocument();
    expect(api.getBeneficiaries).toHaveBeenCalledWith("p-1");
    expect(api.getBeneficiaryStats).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText("Search beneficiaries...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Register Beneficiary/ })).toBeEnabled();
    expect(screen.queryByRole("heading", { name: "Beneficiary summary" })).not.toBeInTheDocument();
    // The register scrolls sideways on phones: a named, focusable region (axe scrollable-region-focusable).
    const region = screen.getByRole("region", { name: "Beneficiary register" });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(within(region).getByRole("table")).toBeInTheDocument();
  });

  it("shows a refused register (403, e.g. after a role change) as an error, never as 'No beneficiaries found'", async () => {
    signInAs("me_officer");
    vi.mocked(api.getBeneficiaries).mockRejectedValueOnce(new ApiError("Insufficient permissions", 403));
    await renderAndSelectProject();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("You don't have permission to do this.");
    expect(screen.queryByText("No beneficiaries found")).not.toBeInTheDocument();
    expect(screen.queryByText("Total Beneficiaries")).not.toBeInTheDocument();
  });

  it("offers a retry when the register fails to load", async () => {
    signInAs("me_officer", "ar");
    vi.mocked(api.getBeneficiaries).mockRejectedValueOnce(new Error("Internal server error"));
    const user = await renderAndSelectProject();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("تعذّر تحميل المستفيدين.");
    expect(alert).toHaveAttribute("dir", "rtl");
    await user.click(within(alert).getByRole("button", { name: "إعادة المحاولة" }));
    expect(await screen.findByText("Rasha Testperson")).toBeInTheDocument();
  });
});
