import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import ProjectDetail from "@/pages/ProjectDetail";
import { AuthProvider } from "@/contexts/AuthContext";
import { api } from "@/services/api";
import { ApiError } from "@/lib/apiError";
import { emitProjectArchivedRefusal } from "@/lib/projectEvents";
import { renderWithClient } from "@/test/utils";
import {
  makeAuthUser,
  makeIndicator,
  makeKpiAssistantStatus,
  makeKpiSuggestion,
  makeKpiSuggestionList,
  sampleResultNodes,
} from "@/test/fixtures";
import type { Framework, ProjectDetail as ProjectDetailData, UserRole } from "@/types/api";

/**
 * The KPI Assistant on the real project page (ProjectDetail → IndicatorTable → ResultsChainPanel → KPI components), with
 * the API mocked: on an archived project every KPI write control is off through the page's one access flag set
 * (useProjectAccess), the suggestions stay readable, and a KPI write refused with 409 project_archived turns the page
 * read-only like any other write. Made-up data only.
 */

vi.mock("@/services/api", () => ({
  api: {
    getProject: vi.fn(),
    getFramework: vi.fn(),
    getFrameworkResults: vi.fn(),
    getKpiAssistantStatus: vi.fn(),
    getKpiSuggestions: vi.fn(),
    getKpiSuggestionRun: vi.fn(),
    getIndicatorQuality: vi.fn(),
    requestKpiSuggestions: vi.fn(),
    acceptKpiSuggestion: vi.fn(),
    rejectKpiSuggestion: vi.fn(),
    archiveProject: vi.fn(),
    restoreProject: vi.fn(),
    deleteProject: vi.fn(),
    getUser: vi.fn(() => null),
    getToken: vi.fn(() => "token"),
  },
}));
vi.mock("@/components/project/PalestineMap", () => ({ default: () => null }));

const NAME = "Hebron Youth Employment";
const SUGGESTION = "Households with an acceptable Food Consumption Score";
const ARCHIVED_BANNER = /This project is archived\./;
const ARCHIVED_MESSAGE = "This project is archived, so it is read-only. An organisation admin can restore it to make changes.";
/** The KPI Assistant's write controls, by accessible name. */
const KPI_WRITE = /^(Suggest KPIs|Suggest again|Accept|Edit & accept|Reject|Show alternatives)/;

const framework = (): Framework => ({
  id: "fw-1", projectId: "p-1", version: 1, status: "draft", name: "Logframe", aiModelUsed: null,
  generatedAt: "2026-10-01T00:00:00.000Z", approvedAt: null, approvedBy: null, resultNodes: sampleResultNodes(),
  indicators: [makeIndicator({ id: "i-1", resultId: "o1", indicatorText: "% of households reached" })],
});

function project(status: ProjectDetailData["status"] = "active"): ProjectDetailData {
  return {
    id: "p-1", organizationId: "org-1", name: NAME, nameAr: null, description: null, sector: "food_security",
    sectors: ["food_security"], humanitarian: true, donor: "WFP", donorType: "wfp", budgetUsd: "250000",
    startDate: "2026-01-01", endDate: "2027-06-30", targetBeneficiaries: 800, geographicScope: "Hebron", status,
    createdAt: "2026-01-01T00:00:00.000Z", documents: [], frameworks: [framework()] as unknown as ProjectDetailData["frameworks"],
    _count: { dataPoints: 0, qualitativeEntries: 0, assessments: 0, reports: 0 },
  };
}

async function renderFramework(role: UserRole) {
  vi.mocked(api.getUser).mockReturnValue(makeAuthUser({ role }));
  renderWithClient(
    <AuthProvider>
      <Toaster />
      <MemoryRouter initialEntries={["/projects/p-1?tab=me-framework"]}>
        <Routes>
          <Route path="/projects/:id" element={<ProjectDetail />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
  await screen.findByRole("heading", { level: 1, name: NAME });
  return userEvent.setup({ delay: null });
}

const kpiWriteControls = () =>
  screen.queryAllByRole("button").filter((button) => KPI_WRITE.test(button.getAttribute("aria-label") ?? button.textContent ?? ""));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getFramework).mockResolvedValue(framework());
  vi.mocked(api.getFrameworkResults).mockResolvedValue(sampleResultNodes());
  vi.mocked(api.getKpiAssistantStatus).mockResolvedValue(makeKpiAssistantStatus());
  vi.mocked(api.getKpiSuggestions).mockResolvedValue(makeKpiSuggestionList({
    suggestions: [makeKpiSuggestion({ id: "s-1", suggestion: { name: SUGGESTION } })],
  }));
  vi.mocked(api.getIndicatorQuality).mockResolvedValue([]);
});

describe("Project page: the KPI Assistant on an archived project", () => {
  it.each<UserRole>(["me_officer", "org_admin"])("%s reads the suggestions, with no KPI write control", async (role) => {
    vi.mocked(api.getProject).mockResolvedValue(project("archived"));
    await renderFramework(role);
    expect(await screen.findByText(ARCHIVED_BANNER)).toBeInTheDocument();
    expect(await screen.findByRole("article", { name: SUGGESTION })).toBeInTheDocument();
    expect(screen.getByText(/This project is archived: you can read these suggestions/)).toBeInTheDocument();
    expect(kpiWriteControls()).toEqual([]);
    expect(screen.queryByRole("button", { name: "Add indicator" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add result" })).not.toBeInTheDocument();
  });

  it("gives the same officer every KPI control on an active project", async () => {
    vi.mocked(api.getProject).mockResolvedValue(project("active"));
    await renderFramework("me_officer");
    expect(await screen.findByRole("button", { name: `Accept “${SUGGESTION}”` })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Suggest KPIs for all results" })).toBeInTheDocument();
    expect(screen.queryByText(/This project is archived: you can read these suggestions/)).not.toBeInTheDocument();
  });

  it("an accept refused with 409 project_archived says why and turns the page read-only, the suggestion still readable", async () => {
    // Archived in another tab: the page still shows the project as active until the refusal.
    vi.mocked(api.getProject).mockResolvedValueOnce(project("active")).mockResolvedValue(project("archived"));
    vi.mocked(api.acceptKpiSuggestion).mockImplementation(async () => {
      // What src/services/api.ts does for every 409 project_archived (tested in api.test.ts).
      emitProjectArchivedRefusal();
      throw new ApiError("This project is archived. Restore it to make changes.", 409, "project_archived");
    });
    const user = await renderFramework("me_officer");
    await user.click(await screen.findByRole("button", { name: `Accept “${SUGGESTION}”` }));

    const banner = (await screen.findByText(ARCHIVED_BANNER)).closest("[role=status]") as HTMLElement;
    expect(await screen.findByText(ARCHIVED_MESSAGE)).toBeInTheDocument();
    await waitFor(() => expect(kpiWriteControls()).toEqual([]));
    expect(screen.getByRole("article", { name: SUGGESTION })).toBeInTheDocument();
    // The Accept button went with the write controls: focus moves to the reason.
    await waitFor(() => expect(banner).toHaveFocus());
    expect(api.getProject).toHaveBeenCalledTimes(2);
  });

  it("a Suggest KPIs request refused with 409 project_archived shows the archived message under the result", async () => {
    vi.mocked(api.getProject).mockResolvedValueOnce(project("active")).mockResolvedValue(project("archived"));
    vi.mocked(api.requestKpiSuggestions).mockImplementation(async () => {
      emitProjectArchivedRefusal();
      throw new ApiError("This project is archived. Restore it to make changes.", 409, "project_archived");
    });
    const user = await renderFramework("org_admin");
    await user.click(await screen.findByRole("button", { name: "Suggest KPIs for O2" }));
    const o2 = (await screen.findAllByRole("alert")).find((alert) => alert.textContent?.includes(ARCHIVED_MESSAGE));
    expect(o2).toBeDefined();
    expect(within(o2 as HTMLElement).queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(await screen.findByText(ARCHIVED_BANNER)).toBeInTheDocument();
    await waitFor(() => expect(kpiWriteControls()).toEqual([]));
  });

  it.each([
    ["a result", "Suggest KPIs for O2"],
    ["the framework", "Suggest KPIs for all results"],
  ])("a 409 project_archived message under %s goes when the project is restored", async (_target, button) => {
    // Active, then archived after the refusal, then active again after Restore project on the banner.
    let status: ProjectDetailData["status"] = "active";
    vi.mocked(api.getProject).mockImplementation(async () => project(status));
    vi.mocked(api.requestKpiSuggestions).mockImplementation(async () => {
      status = "archived";
      emitProjectArchivedRefusal();
      throw new ApiError("This project is archived. Restore it to make changes.", 409, "project_archived");
    });
    vi.mocked(api.restoreProject).mockImplementation(async () => {
      status = "active";
      return { id: "p-1", name: NAME, status: "active" } as Awaited<ReturnType<typeof api.restoreProject>>;
    });
    const archivedAlerts = () => screen.queryAllByRole("alert").filter((alert) => alert.textContent?.includes(ARCHIVED_MESSAGE));
    const user = await renderFramework("org_admin");
    await user.click(await screen.findByRole("button", { name: button }));
    await waitFor(() => expect(archivedAlerts()).toHaveLength(1));

    const banner = (await screen.findByText(ARCHIVED_BANNER)).closest("[role=status]") as HTMLElement;
    await user.click(within(banner).getByRole("button", { name: "Restore project" }));
    expect(api.restoreProject).toHaveBeenCalledWith("p-1");

    // Writable again: the controls are back, the archived message is gone, and the request can be made again.
    expect(await screen.findByRole("button", { name: `Accept “${SUGGESTION}”` })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(ARCHIVED_BANNER)).not.toBeInTheDocument());
    expect(archivedAlerts()).toEqual([]);
    expect(screen.getByRole("button", { name: button })).toBeInTheDocument();
  });
});
