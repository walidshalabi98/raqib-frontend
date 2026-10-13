import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectDashboard } from "@/components/project/ProjectDashboard";
import { AuthProvider } from "@/contexts/AuthContext";
import { ApiError } from "@/lib/apiError";
import { api } from "@/services/api";
import { makeDonorDashboard, makeStaffDashboard } from "@/test/fixtures";
import { renderWithClient } from "@/test/utils";
import type { AuthUser, ProjectDashboard as ProjectDashboardData } from "@/types/api";

vi.mock("@/services/api", () => ({
  api: {
    getDashboard: vi.fn(),
    getUser: vi.fn(() => null),
    getToken: vi.fn(() => "token"),
  },
}));

// Recharts measures its container, which jsdom cannot: the chart is drawn at a fixed size here.
vi.mock("recharts", async (importOriginal) => {
  const recharts = await importOriginal<typeof import("recharts")>();
  return {
    ...recharts,
    ResponsiveContainer: ({ children, height }: { children: React.ReactElement; height: number }) => (
      // The trend chart is 280 px high; each card's sparkline 32 px.
      <div data-testid={height === 280 ? "trend-chart" : "sparkline"}>{children}</div>
    ),
  };
});

function signInAs(role: string, languagePref = "en") {
  const user: AuthUser = { id: "u1", email: "u@example.org", fullName: "User", role, languagePref, organization: { id: "org-1", name: "Org" } };
  vi.mocked(api.getUser).mockReturnValue(user);
}

function renderDashboard() {
  return renderWithClient(
    <AuthProvider>
      <ProjectDashboard projectId="p-1" />
    </AuthProvider>,
  );
}

/** The scorecard card of an indicator. */
async function card(text: string) {
  return (await screen.findByText(text, { selector: "li p" })).closest("li") as HTMLElement;
}

/** Opens "Show the data as a table" and returns its rows as text: month, then one cell per indicator. */
async function tableRows(user: ReturnType<typeof userEvent.setup>, summary = "Show the data as a table") {
  const toggle = screen.getByText(summary);
  if (!toggle.closest("details")?.open) await user.click(toggle);
  const table = screen.getByRole("table");
  return within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) => Array.from(row.querySelectorAll("th, td")).map((cell) => cell.textContent));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getUser).mockReturnValue(null);
});

describe("ProjectDashboard", () => {
  it("renders the staff shape: indicator cards with status as text and icon, and the trends with a data table", async () => {
    signInAs("me_officer");
    vi.mocked(api.getDashboard).mockResolvedValue(makeStaffDashboard());
    const user = userEvent.setup({ delay: null });
    renderDashboard();

    const employed = await card("% of youth employed six months after training");
    expect(within(employed).getByText("On track").querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(employed).toHaveTextContent("45%");
    expect(employed).toHaveTextContent("Target: 60%");
    const trained = await card("Number of youth trained");
    expect(within(trained).getByText("At risk")).toBeInTheDocument();
    expect(trained).toHaveTextContent("Target: 500");

    expect(screen.getByRole("heading", { name: "Indicator trends" })).toBeInTheDocument();
    expect(screen.getByTestId("trend-chart")).toBeInTheDocument();
    // Sparklines are pictures only: the values are in the cards and the table.
    expect(within(employed).getByTestId("sparkline").parentElement).toHaveAttribute("aria-hidden", "true");
    // One row per month, oldest first; the latest value of a month (180 on 20 August, not 7 on 2 August).
    expect(await tableRows(user)).toEqual([
      ["May 2026", "30", "—"],
      ["August 2026", "45", "180"],
    ]);
    expect(api.getDashboard).toHaveBeenCalledWith("p-1");
  });

  it("renders the donor shape: survey results as monthly aggregates, hidden values not plotted, no staff fields needed", async () => {
    signInAs("donor_viewer");
    vi.mocked(api.getDashboard).mockResolvedValue(makeDonorDashboard());
    const user = userEvent.setup({ delay: null });
    renderDashboard();

    const employed = await card("% of youth employed six months after training");
    expect(within(employed).getByText("On track")).toBeInTheDocument();
    expect(employed).toHaveTextContent("45%");
    expect(screen.getByTestId("trend-chart")).toBeInTheDocument();
    expect(await tableRows(user)).toEqual([
      ["May 2026", "30", "—"],
      ["August 2026", "45.5", "180"],
    ]);
    // September's aggregate is hidden (too few answers): never shown as a value.
    expect(screen.queryByText("September 2026")).not.toBeInTheDocument();
  });

  it("draws each progress bar from baseline to target, as the backend computes progress, and none when it cannot", async () => {
    const trend = (indicatorId: string, indicatorText: string, values: Partial<ProjectDashboardData["trends"][number]>) => ({
      indicatorId, indicatorText, level: "outcome" as const, status: "on_track" as const,
      baselineValue: null, targetValue: null, currentValue: null, dataPoints: [], ...values,
    });
    vi.mocked(api.getDashboard).mockResolvedValue(
      makeStaffDashboard({
        trends: [
          // To reduce: 40% to 20%, now 38%. A tenth of the way, never a full bar (38 / 20).
          trend("ind-1", "% of households reporting water shortages", { unit: "%", baselineValue: "40%", targetValue: "20%", currentValue: "38%" }),
          // No change from the baseline: an empty bar, never 75% (60 / 80).
          trend("ind-2", "Average weekly working hours", { unit: "hours", baselineValue: "60", targetValue: "80", currentValue: "60" }),
          // An outcome without a baseline: no bar at all.
          trend("ind-3", "% of youth employed", { unit: "%", targetValue: "60%", currentValue: "45%" }),
          // An output count without a baseline starts from zero.
          trend("ind-4", "Number of youth trained", { level: "output", unit: "people", targetValue: "400", currentValue: "100" }),
        ],
      }),
    );
    renderDashboard();
    const bar = async (text: string) => within(await card(text)).queryByTestId("progress-bar");
    expect(await bar("% of households reporting water shortages")).toHaveStyle({ width: "10%" });
    expect(await bar("Average weekly working hours")).toHaveStyle({ width: "0%" });
    expect(await bar("% of youth employed")).toBeNull();
    expect(await bar("Number of youth trained")).toHaveStyle({ width: "25%" });
    // The bar is a picture: the values are in the card as text.
    expect((await bar("Number of youth trained"))?.parentElement).toHaveAttribute("aria-hidden", "true");
  });

  it("copes with indicators that have no values, no target or an unknown status", async () => {
    vi.mocked(api.getDashboard).mockResolvedValue(
      makeStaffDashboard({
        trends: [
          {
            indicatorId: "ind-9",
            indicatorText: "Number of referrals completed",
            level: "output",
            status: "paused" as never,
            baselineValue: null,
            targetValue: null,
            currentValue: null,
            dataPoints: [{ value: "pending", date: "2026-08-01T00:00:00.000Z" }],
          },
        ],
      }),
    );
    renderDashboard();
    const referrals = await card("Number of referrals completed");
    expect(referrals).toHaveTextContent("No data yet");
    expect(referrals).toHaveTextContent("Target: not set");
    expect(within(referrals).getByText("Not started")).toBeInTheDocument();
    // A value that is not a number is not drawn: no trend yet.
    expect(screen.getByText("No trend data yet. Trends appear once results have been recorded.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows an empty state when the project has no indicators (or no framework)", async () => {
    vi.mocked(api.getDashboard).mockResolvedValue(makeStaffDashboard({ framework: null, trends: [] }));
    renderDashboard();
    expect(await screen.findByText("No indicators yet. Their progress appears here once the project's M&E framework has indicators.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Indicator trends" })).not.toBeInTheDocument();
  });

  it("treats a response without trends as empty rather than crashing", async () => {
    vi.mocked(api.getDashboard).mockResolvedValue({ project: makeStaffDashboard().project } as unknown as ProjectDashboardData);
    renderDashboard();
    expect(await screen.findByText(/No indicators yet/)).toBeInTheDocument();
  });

  it("announces loading, then shows an error with a retry (never the empty state)", async () => {
    let reject: (err: unknown) => void = () => {};
    vi.mocked(api.getDashboard).mockReturnValueOnce(new Promise((_, r) => { reject = r; })).mockResolvedValueOnce(makeStaffDashboard());
    const user = userEvent.setup({ delay: null });
    renderDashboard();
    expect(screen.getByRole("status")).toHaveTextContent("Loading…");

    reject(new ApiError("Project not found", 404));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We couldn't load the project dashboard.");
    expect(screen.queryByText(/No indicators yet/)).not.toBeInTheDocument();

    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await card("Number of youth trained")).toBeInTheDocument();
  });

  it("explains a 403", async () => {
    vi.mocked(api.getDashboard).mockRejectedValue(new ApiError("Insufficient permissions", 403));
    renderDashboard();
    expect(await screen.findByRole("alert")).toHaveTextContent("You don't have permission to do this.");
  });

  it("shows the dashboard in Arabic, right to left, without mirroring the values", async () => {
    signInAs("donor_viewer", "ar");
    vi.mocked(api.getDashboard).mockResolvedValue(makeDonorDashboard());
    const user = userEvent.setup({ delay: null });
    renderDashboard();

    const employed = await card("% of youth employed six months after training");
    expect(employed.closest("[dir]")).toHaveAttribute("dir", "rtl");
    expect(within(employed).getByText("على المسار")).toBeInTheDocument();
    expect(employed).toHaveTextContent("القيمة المستهدفة: 60%");
    expect(screen.getByRole("heading", { name: "اتجاهات المؤشرات" })).toBeInTheDocument();
    // The chart's time axis is not mirrored.
    expect(screen.getByTestId("trend-chart").parentElement).toHaveAttribute("dir", "ltr");
    const rows = await tableRows(user, "عرض البيانات في جدول");
    expect(rows[0][0]).toContain("مايو");
    expect(rows[1].slice(1)).toEqual(["45.5", "180"]);
  });
});
