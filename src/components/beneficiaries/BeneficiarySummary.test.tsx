import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BeneficiarySummary } from "@/components/beneficiaries/BeneficiarySummary";
import { AuthProvider } from "@/contexts/AuthContext";
import { ApiError } from "@/lib/apiError";
import { api } from "@/services/api";
import { makeDonorSummary } from "@/test/fixtures";
import { renderWithClient } from "@/test/utils";
import type { AuthUser, DisclosedCell } from "@/types/api";

vi.mock("@/services/api", () => ({
  api: {
    getBeneficiaryStats: vi.fn(),
    getUser: vi.fn(() => null),
    getToken: vi.fn(() => "token"),
  },
}));

const NOTE = "Individual beneficiary records are visible to project staff only. You see totals and breakdowns without names, phone numbers or ID numbers, as humanitarian data-protection standards require.";
const hiddenCell: DisclosedCell = { key: null, count: null, suppressed: true };

function renderSummary() {
  return renderWithClient(
    <AuthProvider>
      <BeneficiarySummary projectId="p-1" />
    </AuthProvider>,
  );
}

function arabicDonor(): AuthUser {
  return { id: "u1", email: "d@example.org", fullName: "Donor", role: "donor_viewer", languagePref: "ar", organization: { id: "org-1", name: "Org" } };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getUser).mockReturnValue(null);
});

describe("BeneficiarySummary", () => {
  it("shows a loading status, then the figures with hidden counts as icon plus text", async () => {
    vi.mocked(api.getBeneficiaryStats).mockResolvedValue(makeDonorSummary());
    renderSummary();
    expect(screen.getByRole("status")).toHaveTextContent("Loading…");

    expect(await screen.findByRole("table", { name: "By sex" })).toBeInTheDocument();
    expect(api.getBeneficiaryStats).toHaveBeenCalledWith("p-1");
    expect(screen.getByRole("note")).toHaveTextContent(NOTE);
    expect(screen.getByRole("note").querySelector("svg")).not.toBeNull();

    // Totals as a description list.
    const total = screen.getByText("Total beneficiaries").parentElement as HTMLElement;
    expect(within(total).getByText("10")).toBeInTheDocument();
    const services = screen.getByText("Services delivered").parentElement as HTMLElement;
    expect(within(services).getByText("Hidden")).toBeInTheDocument();

    // One accessible table per breakdown, with column and row headers.
    const sex = screen.getByRole("table", { name: "By sex" });
    expect(within(sex).getByRole("columnheader", { name: "Category" })).toHaveAttribute("scope", "col");
    expect(within(sex).getByRole("columnheader", { name: "People" })).toBeInTheDocument();
    const female = within(sex).getByRole("rowheader", { name: "Female" });
    expect(female).toHaveAttribute("scope", "row");
    expect(female.closest("tr")).toHaveTextContent("10");
    const maleRow = within(sex).getByRole("rowheader", { name: "Male" }).closest("tr") as HTMLElement;
    expect(maleRow).toHaveTextContent("Hidden");
    // Never colour alone: the hidden text comes with an icon.
    expect(within(maleRow).getByText("Hidden").querySelector("svg")).not.toBeNull();
    expect(within(sex).getByRole("rowheader", { name: "Other" }).closest("tr")).toHaveTextContent("0");

    for (const caption of ["By age group", "By governorate", "By status", "By vulnerability (one person can count in several rows)", "People reached, by service type (one person can count in several rows)"]) {
      expect(screen.getByRole("table", { name: caption })).toBeInTheDocument();
    }
  });

  it("labels the not-recorded and merged rows, keeps typed values as typed, and shows the legend", async () => {
    vi.mocked(api.getBeneficiaryStats).mockResolvedValue(makeDonorSummary());
    renderSummary();
    const governorate = await screen.findByRole("table", { name: "By governorate" });
    expect(within(governorate).getByRole("rowheader", { name: "Hebron" }).querySelector("bdi")).toHaveAttribute("dir", "auto");
    expect(within(governorate).getByRole("rowheader", { name: "Not recorded" })).toBeInTheDocument();
    expect(within(governorate).getByRole("rowheader", { name: "Other (combined)" })).toBeInTheDocument();
    expect(within(screen.getByRole("table", { name: "By age group" })).getByRole("rowheader", { name: "Not recorded" })).toBeInTheDocument();
    // An empty breakdown says why instead of disappearing: for services, nothing recorded or hidden whole.
    expect(
      within(screen.getByRole("table", { name: /by service type/ })).getByText("Nothing to show: nothing was recorded, or the counts are hidden to protect people's privacy."),
    ).toBeInTheDocument();

    const legend = screen.getByText(/^Hidden: counts from 1 to 4 are hidden/);
    expect(legend).toHaveTextContent(
      "Hidden: counts from 1 to 4 are hidden to protect people's privacy. In the vulnerability and service tables, counts from 1 to 9 are hidden, and so is a count that almost everyone shares (fewer than 10 people outside it). All other figures, totals included, are rounded to the nearest 5 (0 stays 0), so the rows may not add up to the total. When a hidden count could still be worked out from the rounded figures, the whole table is hidden.",
    );
    // Never claims that only "one more" count is hidden (the old wording).
    expect(legend).not.toHaveTextContent(/one more/);
    // Each table, and the totals, point at the legend.
    expect(governorate).toHaveAccessibleDescription(legend.textContent ?? "");
    expect(screen.getByText("Total beneficiaries").closest("dl")).toHaveAccessibleDescription(legend.textContent ?? "");
  });

  it("shows the legend values the backend sends", async () => {
    vi.mocked(api.getBeneficiaryStats).mockResolvedValue(makeDonorSummary({ minCell: 7, minCellSensitive: 12, roundingBase: 10 }));
    renderSummary();
    const legend = await screen.findByText(/counts from 1 to 6 are hidden/);
    expect(legend).toHaveTextContent("counts from 1 to 11 are hidden");
    expect(legend).toHaveTextContent("(fewer than 12 people outside it)");
    expect(legend).toHaveTextContent("rounded to the nearest 10");
  });

  it("assumes rounding to 5 when an older response does not say", async () => {
    const { roundingBase: _roundingBase, ...older } = makeDonorSummary();
    vi.mocked(api.getBeneficiaryStats).mockResolvedValue(older);
    renderSummary();
    expect(await screen.findByText(/rounded to the nearest 5/)).toBeInTheDocument();
  });

  it("says a free-text table of people with no rows is hidden, not empty (the backend hid it whole)", async () => {
    vi.mocked(api.getBeneficiaryStats).mockResolvedValue(makeDonorSummary({ byGovernorate: [] }));
    renderSummary();
    const governorate = await screen.findByRole("table", { name: "By governorate" });
    expect(within(governorate).getByText("This breakdown is hidden to protect people's privacy.")).toBeInTheDocument();
    expect(within(governorate).queryByText(/Nothing/)).not.toBeInTheDocument();
  });

  it("shows a table the backend hid whole as hidden rows, zeros included", async () => {
    const hiddenRow = (key: string | null) => ({ key, count: null, suppressed: true });
    vi.mocked(api.getBeneficiaryStats).mockResolvedValue(makeDonorSummary({ byStatus: ["active", "completed", "dropped_out", "referred"].map(hiddenRow) }));
    renderSummary();
    const status = await screen.findByRole("table", { name: "By status" });
    for (const name of ["Active", "Completed", "Dropped out", "Referred"]) {
      expect(within(status).getByRole("rowheader", { name }).closest("tr")).toHaveTextContent("Hidden");
    }
    expect(within(status).queryByText("0")).not.toBeInTheDocument();
  });

  it("explains when every breakdown is hidden for a very small project", async () => {
    vi.mocked(api.getBeneficiaryStats).mockResolvedValue(
      makeDonorSummary({ suppressedAll: true, total: hiddenCell, serviceCount: hiddenCell, byGender: [], byAgeGroup: [], byGovernorate: [], byStatus: [], byVulnerabilityTag: [], byServiceType: [] }),
    );
    renderSummary();
    expect(await screen.findByText("The figures for this project are hidden to protect people's privacy: it has fewer than 5 beneficiaries, or a small count could otherwise be worked out from them.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("says so when no beneficiaries are registered", async () => {
    vi.mocked(api.getBeneficiaryStats).mockResolvedValue(makeDonorSummary({ total: { key: null, count: 0, suppressed: false }, serviceCount: { key: null, count: 0, suppressed: false } }));
    renderSummary();
    expect(await screen.findByText("No beneficiaries are registered for this project yet.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows an error with a retry that loads the summary again", async () => {
    vi.mocked(api.getBeneficiaryStats).mockRejectedValueOnce(new ApiError("API request failed", 500)).mockResolvedValue(makeDonorSummary());
    const user = userEvent.setup({ delay: null });
    renderSummary();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We couldn't load the beneficiary summary.");
    expect(alert).not.toHaveTextContent("API request failed");
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("table", { name: "By sex" })).toBeInTheDocument();
    expect(api.getBeneficiaryStats).toHaveBeenCalledTimes(2);
  });

  it("explains a refusal (403) instead of a generic error", async () => {
    vi.mocked(api.getBeneficiaryStats).mockRejectedValue(new ApiError("Insufficient permissions", 403));
    renderSummary();
    expect(await screen.findByRole("alert")).toHaveTextContent("You don't have permission to do this.");
  });

  it("reads right to left in Arabic", async () => {
    vi.mocked(api.getUser).mockReturnValue(arabicDonor());
    vi.mocked(api.getBeneficiaryStats).mockResolvedValue(makeDonorSummary());
    renderSummary();
    const section = (await screen.findByRole("heading", { name: "ملخص المستفيدين" })).closest("section");
    expect(section).toHaveAttribute("dir", "rtl");
    expect(section).toHaveAttribute("lang", "ar");
    const sex = screen.getByRole("table", { name: "حسب الجنس" });
    expect(within(sex).getByRole("rowheader", { name: "ذكور" }).closest("tr")).toHaveTextContent("مخفي");
    const legend = await screen.findByText(/^مخفي: تُخفى الأعداد من 1 إلى 4/);
    expect(legend).toHaveTextContent("إلى أقرب مضاعف للعدد 5");
    expect(legend).toHaveTextContent("أقل من 10 أشخاص");
  });
});
