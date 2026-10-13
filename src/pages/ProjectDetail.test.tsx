import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import ProjectDetail from "@/pages/ProjectDetail";
import { AuthProvider } from "@/contexts/AuthContext";
import { api } from "@/services/api";
import { renderWithClient } from "@/test/utils";
import type { AuthUser, ProjectDetail as ProjectDetailData } from "@/types/api";

vi.mock("@/services/api", () => ({
  api: {
    getProject: vi.fn(),
    getUser: vi.fn(() => null),
    getToken: vi.fn(() => "token"),
  },
}));

// The children are mocked to show the props the page passes: the page decides per role.
const { props } = vi.hoisted(() => ({
  props: (name: string) =>
    function MockChild(p: Record<string, unknown>) {
      return <div data-testid={name}>{JSON.stringify(p)}</div>;
    },
}));
vi.mock("@/components/project/RiskAlerts", () => ({ default: props("RiskAlerts") }));
vi.mock("@/components/project/DocumentManager", () => ({ default: props("DocumentManager") }));
vi.mock("@/components/project/ExportPanel", () => ({ default: props("ExportPanel") }));
vi.mock("@/components/project/ReportsList", () => ({ ReportsList: props("ReportsList") }));
vi.mock("@/components/project/QualitativeCards", () => ({ QualitativeCards: props("QualitativeCards") }));
vi.mock("@/components/project/AssessmentModal", () => ({ AssessmentModal: () => <button type="button">Request assessment</button> }));
vi.mock("@/components/project/AssessmentPipeline", () => ({ AssessmentPipeline: props("AssessmentPipeline") }));
vi.mock("@/components/project/IndicatorTable", () => ({ IndicatorTable: props("IndicatorTable") }));
vi.mock("@/components/project/ProjectDashboard", () => ({ ProjectDashboard: props("ProjectDashboard") }));
vi.mock("@/components/project/PalestineMap", () => ({ default: props("PalestineMap") }));

const BANNER = "You have read-only access to this project. Project staff add and change its data.";

function project(overrides: Partial<ProjectDetailData> = {}): ProjectDetailData {
  return {
    id: "p-1",
    organizationId: "org-1",
    name: "Hebron Youth Employment",
    nameAr: null,
    description: null,
    sector: "livelihoods",
    sectors: ["livelihoods"],
    humanitarian: false,
    donor: "EU",
    donorType: "eu",
    budgetUsd: "450000",
    startDate: "2026-01-01",
    endDate: "2027-12-31",
    targetBeneficiaries: 1200,
    geographicScope: "Hebron",
    status: "setup",
    createdAt: "2026-01-01T00:00:00.000Z",
    documents: [],
    frameworks: [],
    ...overrides,
  };
}

function signInAs(role: string, languagePref = "en") {
  const user: AuthUser = { id: "u1", email: "u@example.org", fullName: "User", role, languagePref, organization: { id: "org-1", name: "Org" } };
  vi.mocked(api.getUser).mockReturnValue(user);
}

/** Shows the current address, so tests can check the open tab is in it. */
function Location() {
  const { pathname, search } = useLocation();
  return <output data-testid="location">{`${pathname}${search}`}</output>;
}

async function renderPage(path = "/projects/p-1") {
  renderWithClient(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/projects/:id" element={<><ProjectDetail /><Location /></>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
  await screen.findByRole("heading", { name: "Hebron Youth Employment" });
  return userEvent.setup({ delay: null });
}

/** The props a mocked child received (after opening its tab). */
async function propsOf(user: ReturnType<typeof userEvent.setup>, tab: string, child: string) {
  await user.click(screen.getByRole("tab", { name: tab }));
  return JSON.parse((await screen.findByTestId(child)).textContent ?? "{}");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getProject).mockResolvedValue(project());
});

describe("ProjectDetail: donor viewer", () => {
  it("shows the read-only banner and passes read-only props to every child", async () => {
    signInAs("donor_viewer");
    const user = await renderPage();

    const banner = screen.getByRole("note");
    expect(banner).toHaveTextContent(BANNER);
    expect(banner.querySelector("svg")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Order Assessment/ })).not.toBeInTheDocument();

    expect(await propsOf(user, "Risk Alerts", "RiskAlerts")).toEqual({ projectId: "p-1", readOnly: true });
    expect(await propsOf(user, "Reports", "ReportsList")).toEqual({ projectId: "p-1", canGenerate: false, canPublish: false });
    // Staff and donor viewers get the same dashboard screen; the server sends donors less.
    expect(await propsOf(user, "Dashboard", "ProjectDashboard")).toEqual({ projectId: "p-1" });
    expect(await propsOf(user, "Documents", "DocumentManager")).toEqual({ projectId: "p-1", canManage: false });
    expect(await propsOf(user, "Qualitative", "QualitativeCards")).toEqual({ projectId: "p-1", readOnly: true });
    expect(await propsOf(user, "Export", "ExportPanel")).toEqual({ projectId: "p-1", audience: "donor" });
    expect(await propsOf(user, "Assessments", "AssessmentPipeline")).toEqual({ projectId: "p-1", readOnly: true });
    expect(screen.queryByRole("button", { name: "Request assessment" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "M&E Framework" }));
    expect(await screen.findByTestId("IndicatorTable")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Generate M&E Framework" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Generate with AI" })).not.toBeInTheDocument();
  });

  it("treats an unknown role as read-only (deny by default)", async () => {
    signInAs("auditor");
    const user = await renderPage();
    expect(screen.getByRole("note")).toHaveTextContent(BANNER);
    expect(await propsOf(user, "Export", "ExportPanel")).toEqual({ projectId: "p-1", audience: "donor" });
  });

  it("shows the banner in Arabic, right to left", async () => {
    signInAs("donor_viewer", "ar");
    await renderPage();
    const banner = screen.getByRole("note");
    expect(banner).toHaveTextContent("لديك صلاحية الاطلاع فقط على هذا المشروع");
    expect(banner).toHaveAttribute("dir", "rtl");
    expect(banner).toHaveAttribute("lang", "ar");
  });
});

describe("ProjectDetail: M&E officer", () => {
  it("shows no banner and keeps every staff control", async () => {
    signInAs("me_officer");
    const user = await renderPage();

    expect(screen.queryByText(BANNER)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Order Assessment/ })).toBeInTheDocument();
    // Accessible names found by axe: the back link and the timeline that scrolls on phones.
    expect(screen.getByRole("link", { name: "Back to projects" })).toHaveAttribute("href", "/projects");
    expect(screen.getByRole("region", { name: "Project Timeline" })).toHaveAttribute("tabindex", "0");

    expect(await propsOf(user, "Risk Alerts", "RiskAlerts")).toEqual({ projectId: "p-1", readOnly: false });
    // Officers generate reports; publishing them to donors is for org admins.
    expect(await propsOf(user, "Reports", "ReportsList")).toEqual({ projectId: "p-1", canGenerate: true, canPublish: false });
    expect(await propsOf(user, "Dashboard", "ProjectDashboard")).toEqual({ projectId: "p-1" });
    expect(await propsOf(user, "Documents", "DocumentManager")).toEqual({ projectId: "p-1", canManage: true });
    expect(await propsOf(user, "Qualitative", "QualitativeCards")).toEqual({ projectId: "p-1", readOnly: false });
    expect(await propsOf(user, "Export", "ExportPanel")).toEqual({ projectId: "p-1", audience: "staff" });
    expect(await propsOf(user, "Assessments", "AssessmentPipeline")).toEqual({ projectId: "p-1", readOnly: false });
    expect(await screen.findByRole("button", { name: "Request assessment" })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "M&E Framework" }));
    const card = (await screen.findByRole("heading", { name: "Generate M&E Framework" })).parentElement as HTMLElement;
    expect(within(card).getByRole("link")).toHaveAttribute("href", "/wizard/p-1");
  });
});

describe("ProjectDetail: org admin", () => {
  it("may publish reports to donor viewers", async () => {
    signInAs("org_admin");
    const user = await renderPage();
    expect(await propsOf(user, "Reports", "ReportsList")).toEqual({ projectId: "p-1", canGenerate: true, canPublish: true });
  });
});

describe("ProjectDetail: tabs in the address", () => {
  it("opens the tab named in ?tab= (links from the Reports page and from report notifications)", async () => {
    signInAs("donor_viewer");
    await renderPage("/projects/p-1?tab=reports");
    expect(screen.getByRole("tab", { name: "Reports" })).toHaveAttribute("aria-selected", "true");
    expect(JSON.parse(screen.getByTestId("ReportsList").textContent ?? "{}")).toEqual({ projectId: "p-1", canGenerate: false, canPublish: false });
  });

  it("opens Overview for an unknown tab, and keeps the open tab in the address", async () => {
    signInAs("me_officer");
    const user = await renderPage("/projects/p-1?tab=nonsense");
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("tab", { name: "Dashboard" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/projects/p-1?tab=dashboard");
    await user.click(screen.getByRole("tab", { name: "Overview" }));
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/projects\/p-1$/);
  });
});
