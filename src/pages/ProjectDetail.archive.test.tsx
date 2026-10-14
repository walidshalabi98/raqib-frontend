import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import ProjectDetail from "@/pages/ProjectDetail";
import { AuthProvider } from "@/contexts/AuthContext";
import { api } from "@/services/api";
import { ApiError } from "@/lib/apiError";
import { emitProjectArchivedRefusal } from "@/lib/projectEvents";
import { renderWithClient } from "@/test/utils";
import { makeIndicator } from "@/test/fixtures";
import type { AuthUser, Project, ProjectDetail as ProjectDetailData } from "@/types/api";

vi.mock("@/services/api", () => ({
  api: {
    getProject: vi.fn(),
    archiveProject: vi.fn(),
    restoreProject: vi.fn(),
    deleteProject: vi.fn(),
    getUser: vi.fn(() => null),
    getToken: vi.fn(() => "token"),
  },
}));

// The tabs' children show the props the page passes: one access flag set decides them all.
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

const NAME = "Hebron Youth Employment";
const ARCHIVED_BANNER = /This project is archived\./;

function project(overrides: Partial<ProjectDetailData> = {}): ProjectDetailData {
  return {
    id: "p-1",
    organizationId: "org-1",
    name: NAME,
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
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    documents: [{ id: "d1" }, { id: "d2" }, { id: "d3" }] as ProjectDetailData["documents"],
    frameworks: [{ id: "fw-1", indicators: [makeIndicator({ id: "i1" }), makeIndicator({ id: "i2" })] }] as unknown as ProjectDetailData["frameworks"],
    _count: { dataPoints: 12, qualitativeEntries: 2, assessments: 1, reports: 4 },
    ...overrides,
  };
}

function signInAs(role: string, languagePref = "en") {
  const user: AuthUser = { id: "u1", email: "u@example.org", fullName: "User", role, languagePref, organization: { id: "org-1", name: "Org" } };
  vi.mocked(api.getUser).mockReturnValue(user);
}

function Location() {
  const { pathname, search } = useLocation();
  return <output data-testid="location">{`${pathname}${search}`}</output>;
}

async function renderPage(heading = NAME) {
  renderWithClient(
    <AuthProvider>
      <Toaster />
      <MemoryRouter initialEntries={["/projects/p-1"]}>
        <Routes>
          <Route path="/projects/:id" element={<><ProjectDetail /><Location /></>} />
          <Route path="/projects" element={<><h1>Projects list</h1><Location /></>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
  await screen.findByRole("heading", { level: 1, name: heading });
  return userEvent.setup({ delay: null });
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Project actions" }));
  return screen.findByRole("menu");
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

describe("Project actions menu", () => {
  it("offers org admins Archive and Delete on an active project", async () => {
    signInAs("org_admin");
    const user = await renderPage();
    const menu = await openMenu(user);
    const items = within(menu).getAllByRole("menuitem").map((item) => item.textContent);
    expect(items).toEqual(["Archive project", "Delete permanently"]);
  });

  it("offers Restore instead of Archive on an archived project (platform admins too)", async () => {
    signInAs("platform_admin");
    vi.mocked(api.getProject).mockResolvedValue(project({ status: "archived" }));
    const user = await renderPage();
    const menu = await openMenu(user);
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Restore project", "Delete permanently"]);
  });

  it("is not there for M&E officers or donor viewers, archived or not", async () => {
    for (const role of ["me_officer", "donor_viewer"]) {
      for (const status of ["active", "archived"] as const) {
        signInAs(role);
        vi.mocked(api.getProject).mockResolvedValue(project({ status }));
        const { unmount } = renderWithClient(
          <AuthProvider>
            <MemoryRouter initialEntries={["/projects/p-1"]}>
              <Routes><Route path="/projects/:id" element={<ProjectDetail />} /></Routes>
            </MemoryRouter>
          </AuthProvider>,
        );
        await screen.findByRole("heading", { level: 1, name: NAME });
        expect(screen.queryByRole("button", { name: "Project actions" }), `${role} ${status}`).not.toBeInTheDocument();
        unmount();
      }
    }
  });
});

describe("Archive", () => {
  it("explains what archiving means, and Cancel returns focus to the menu button", async () => {
    signInAs("org_admin");
    const user = await renderPage();
    await user.click(within(await openMenu(user)).getByRole("menuitem", { name: "Archive project" }));
    const dialog = await screen.findByRole("alertdialog", { name: `Archive “⁨${NAME}⁩”?` });
    for (const text of [
      /Donors may audit them for years, so nothing is deleted/,
      /leaves the active projects list/,
      /read-only for everyone/,
      /Nothing is deleted/,
      /can restore it at any time/,
    ]) {
      expect(within(dialog).getByText(text)).toBeInTheDocument();
    }
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(api.archiveProject).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("button", { name: "Project actions" })).toHaveFocus());
  });

  it("archives, shows the archived banner with focus on it, and turns the page read-only", async () => {
    signInAs("org_admin");
    vi.mocked(api.archiveProject).mockResolvedValue({ id: "p-1", name: NAME, status: "archived" } as Project);
    vi.mocked(api.getProject).mockResolvedValueOnce(project()).mockResolvedValue(project({ status: "archived" }));
    const user = await renderPage();
    await user.click(within(await openMenu(user)).getByRole("menuitem", { name: "Archive project" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Archive project" }));

    expect(api.archiveProject).toHaveBeenCalledWith("p-1");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    const banner = (await screen.findByText(ARCHIVED_BANNER)).closest("[role=status]") as HTMLElement;
    expect(banner).not.toBeNull();
    await waitFor(() => expect(banner).toHaveFocus());
    expect(await screen.findByText(/is archived\. It is read-only until it is restored\./)).toBeInTheDocument();
    expect(await propsOf(user, "M&E Framework", "IndicatorTable")).toEqual({ projectId: "p-1", canEdit: false });
  });

  it("shows the server's refusal in the dialog, in the user's words", async () => {
    signInAs("org_admin");
    vi.mocked(api.archiveProject).mockRejectedValueOnce(new ApiError("Project is already archived", 409, "project_already_archived"));
    const user = await renderPage();
    await user.click(within(await openMenu(user)).getByRole("menuitem", { name: "Archive project" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Archive project" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("This project is already archived.");

    vi.mocked(api.archiveProject).mockRejectedValueOnce(new ApiError("Insufficient permissions", 403));
    await user.click(within(dialog).getByRole("button", { name: "Archive project" }));
    expect(await within(dialog).findByText(/You don't have permission to do this/)).toBeInTheDocument();
    expect(within(dialog).queryByText("Insufficient permissions")).not.toBeInTheDocument();
  });
});

describe("An archived project", () => {
  const archived = () => project({ status: "archived" });

  it("is read-only for every role: banner with text and icon, no write controls in any tab", async () => {
    for (const [role, audience] of [["org_admin", "staff"], ["me_officer", "staff"], ["donor_viewer", "donor"]] as const) {
      vi.clearAllMocks();
      signInAs(role);
      vi.mocked(api.getProject).mockResolvedValue(archived());
      const { unmount } = renderWithClient(
        <AuthProvider>
          <MemoryRouter initialEntries={["/projects/p-1"]}>
            <Routes><Route path="/projects/:id" element={<ProjectDetail />} /></Routes>
          </MemoryRouter>
        </AuthProvider>,
      );
      await screen.findByRole("heading", { level: 1, name: NAME });
      const user = userEvent.setup({ delay: null });

      const banner = screen.getByText(ARCHIVED_BANNER).closest("[role=status]") as HTMLElement;
      expect(banner, role).not.toBeNull();
      expect(banner.querySelector("svg")).not.toBeNull();
      expect(banner).toHaveTextContent(/no one can add or change its data, and nothing in it was deleted/);
      // Only admins can restore; everyone else is told who can.
      if (role === "org_admin") expect(within(banner).getByRole("button", { name: "Restore project" })).toBeInTheDocument();
      else {
        expect(within(banner).queryByRole("button")).not.toBeInTheDocument();
        expect(banner).toHaveTextContent("An organisation admin can restore it.");
      }
      // The archived banner replaces the donor note.
      expect(screen.queryByRole("note")).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Back to projects" })).toHaveAttribute("href", "/projects?view=archived");
      expect(screen.queryByRole("button", { name: /Order Assessment/ })).not.toBeInTheDocument();

      expect(await propsOf(user, "M&E Framework", "IndicatorTable"), role).toEqual({ projectId: "p-1", canEdit: false });
      expect(screen.queryByRole("link", { name: "Generate with AI" })).not.toBeInTheDocument();
      expect(await propsOf(user, "Reports", "ReportsList"), role).toEqual({ projectId: "p-1", canGenerate: false, canPublish: false, audience });
      expect(await propsOf(user, "Documents", "DocumentManager"), role).toEqual({ projectId: "p-1", canManage: false, audience });
      expect(await propsOf(user, "Qualitative", "QualitativeCards"), role).toEqual({ projectId: "p-1", readOnly: audience === "donor", canManage: false });
      expect(await propsOf(user, "Assessments", "AssessmentPipeline"), role).toEqual({ projectId: "p-1", readOnly: audience === "donor", canRequest: false });
      expect(screen.queryByRole("button", { name: "Request assessment" })).not.toBeInTheDocument();
      // Reading stays: the risk analysis is a read (GET), and staff keep the full export.
      expect(await propsOf(user, "Risk Alerts", "RiskAlerts"), role).toEqual({ projectId: "p-1", readOnly: audience === "donor" });
      expect(await propsOf(user, "Export", "ExportPanel"), role).toEqual({ projectId: "p-1", audience });
      unmount();
    }
  });

  it("shows the banner in Arabic, right to left", async () => {
    signInAs("me_officer", "ar");
    vi.mocked(api.getProject).mockResolvedValue(archived());
    await renderPage();
    const banner = screen.getByText("هذا المشروع مؤرشف.").closest("[role=status]") as HTMLElement;
    expect(banner).toHaveAttribute("lang", "ar");
    expect(banner).toHaveAttribute("dir", "rtl");
    expect(banner).toHaveTextContent("يمكن لمسؤول المؤسسة استعادته.");
    expect(screen.getByRole("tablist", { name: "أقسام المشروع" })).toHaveAttribute("lang", "ar");
    expect(screen.getByRole("tab", { name: "التقارير" })).toBeInTheDocument();
    // The same word as the Documents screens' heading (وثائق المشروع).
    expect(screen.getByRole("tab", { name: "الوثائق" })).toBeInTheDocument();
    expect(screen.getByText("مؤرشف: لا يُظهر المخطط الزمني أي مرحلة حالية ما دام المشروع مؤرشفًا.").closest("p")).toHaveAttribute("dir", "rtl");
  });

  it("is restored from the banner: the server's status shows, focus moves to the heading", async () => {
    signInAs("org_admin");
    vi.mocked(api.getProject).mockResolvedValueOnce(archived()).mockResolvedValue(project({ status: "framework_review" }));
    vi.mocked(api.restoreProject).mockResolvedValue({ id: "p-1", name: NAME, status: "framework_review" } as Project);
    const user = await renderPage();
    const banner = screen.getByText(ARCHIVED_BANNER).closest("[role=status]") as HTMLElement;
    await user.click(within(banner).getByRole("button", { name: "Restore project" }));
    expect(api.restoreProject).toHaveBeenCalledWith("p-1");
    await waitFor(() => expect(screen.queryByText(ARCHIVED_BANNER)).not.toBeInTheDocument());
    expect(screen.getByRole("heading", { level: 1, name: NAME })).toHaveFocus();
    expect(await screen.findByText(/is restored\. You can make changes again\./)).toBeInTheDocument();
    expect(await propsOf(user, "M&E Framework", "IndicatorTable")).toEqual({ projectId: "p-1", canEdit: true });
  });

  it("is restored from the menu too, and a failed restore says why", async () => {
    signInAs("org_admin");
    vi.mocked(api.getProject).mockResolvedValue(archived());
    vi.mocked(api.restoreProject).mockRejectedValueOnce(new ApiError("Project is not archived", 409, "project_not_archived"));
    const user = await renderPage();
    await user.click(within(await openMenu(user)).getByRole("menuitem", { name: "Restore project" }));
    expect(api.restoreProject).toHaveBeenCalledWith("p-1");
    expect(await screen.findByText("This project is not archived any more.")).toBeInTheDocument();
  });

  it("appears when a change is refused because someone archived the project elsewhere", async () => {
    signInAs("me_officer");
    vi.mocked(api.getProject).mockResolvedValueOnce(project()).mockResolvedValue(archived());
    await renderPage();
    expect(screen.queryByText(ARCHIVED_BANNER)).not.toBeInTheDocument();
    emitProjectArchivedRefusal();
    expect(await screen.findByText(ARCHIVED_BANNER)).toBeInTheDocument();
    expect(api.getProject).toHaveBeenCalledTimes(2);
  });

  it("takes focus when the refused form closed with the write controls and left focus nowhere", async () => {
    signInAs("me_officer");
    vi.mocked(api.getProject).mockResolvedValueOnce(project()).mockResolvedValue(archived());
    await renderPage();
    // The refused dialog and its opener are gone: focus fell back to the page body.
    expect(document.activeElement).toBe(document.body);
    emitProjectArchivedRefusal();
    const banner = (await screen.findByText(ARCHIVED_BANNER)).closest("[role=status]") as HTMLElement;
    await waitFor(() => expect(banner).toHaveFocus());
  });

  it("leaves focus in a dialog that stays open (it shows the reason and keeps focus)", async () => {
    signInAs("me_officer");
    vi.mocked(api.getProject).mockResolvedValueOnce(project()).mockResolvedValue(archived());
    await renderPage();
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const inside = document.createElement("button");
    dialog.append(inside);
    document.body.append(dialog);
    inside.focus();
    emitProjectArchivedRefusal();
    await screen.findByText(ARCHIVED_BANNER);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(inside).toHaveFocus();
    dialog.remove();
  });

  it("moves no focus when the project turns out not to be archived", async () => {
    signInAs("me_officer");
    vi.mocked(api.getProject).mockResolvedValue(project());
    await renderPage();
    emitProjectArchivedRefusal();
    await waitFor(() => expect(api.getProject).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText(ARCHIVED_BANNER)).not.toBeInTheDocument();
    expect(document.activeElement).toBe(document.body);
  });

  it("shows no stage on the timeline: archiving can end a project at any stage", async () => {
    signInAs("donor_viewer");
    vi.mocked(api.getProject).mockResolvedValue(archived());
    renderWithClient(
      <AuthProvider>
        <MemoryRouter initialEntries={["/projects/p-1"]}>
          <Routes><Route path="/projects/:id" element={<ProjectDetail />} /></Routes>
        </MemoryRouter>
      </AuthProvider>,
    );
    const timeline = await screen.findByRole("region", { name: "Project Timeline" });
    expect(timeline.querySelector("[aria-current]")).toBeNull();
    // No stage is shown as done (green) either.
    expect(timeline.querySelector(".bg-success")).toBeNull();
    const marker = screen.getByText("Archived: the timeline shows no current stage while the project is archived.");
    expect(marker.closest("p")?.querySelector("svg")).not.toBeNull();
  });
});

describe("The project timeline", () => {
  it("marks the current stage as the current step (not by colour alone)", async () => {
    signInAs("me_officer");
    vi.mocked(api.getProject).mockResolvedValue(project({ status: "active" }));
    await renderPage();
    const timeline = screen.getByRole("region", { name: "Project Timeline" });
    expect(timeline.querySelector("[aria-current=step]")).toHaveTextContent("Implementation");
    expect(screen.queryByText(/the timeline shows no current stage/)).not.toBeInTheDocument();
  });

  it("still shows a completed project as complete", async () => {
    signInAs("me_officer");
    vi.mocked(api.getProject).mockResolvedValue(project({ status: "completed" }));
    await renderPage();
    expect(screen.getByRole("region", { name: "Project Timeline" }).querySelector("[aria-current=step]")).toHaveTextContent("Complete");
  });
});

describe("Delete permanently", () => {
  async function openDelete(user: ReturnType<typeof userEvent.setup>) {
    await user.click(within(await openMenu(user)).getByRole("menuitem", { name: "Delete permanently" }));
    return screen.findByRole("alertdialog", { name: `Delete “⁨${NAME}⁩” permanently?` });
  }

  it("says it cannot be undone, lists what goes, and puts focus in the name field", async () => {
    signInAs("org_admin");
    const user = await renderPage();
    const dialog = await openDelete(user);
    expect(dialog).toHaveAccessibleDescription(/This cannot be undone\./);
    expect(within(dialog).getByText(/Delete only test projects or projects created by mistake/)).toBeInTheDocument();
    const items = within(within(dialog).getByRole("list")).getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual([
      "The M&E framework (all versions) and its results chain",
      "Indicators in the current framework: 2",
      "Data points: 12",
      "Qualitative entries: 2",
      "Assessments: 1",
      "Reports, published ones included: 4",
      "Documents and their stored files: 3",
      "Beneficiary records and the services recorded for them",
      "Notifications about this project",
    ]);
    const field = within(dialog).getByLabelText("Type the project name to confirm");
    await waitFor(() => expect(field).toHaveFocus());
    expect(field).toHaveAccessibleDescription(/Type it exactly as shown, capital letters included/);
    expect(within(dialog).getByRole("button", { name: "Delete permanently" })).toBeDisabled();
  });

  it("keeps the delete button off until the name matches exactly, capitals included", async () => {
    signInAs("org_admin");
    const user = await renderPage();
    const dialog = await openDelete(user);
    const field = within(dialog).getByLabelText("Type the project name to confirm");
    const button = within(dialog).getByRole("button", { name: "Delete permanently" });

    await user.type(field, "hebron youth employment");
    expect(button).toBeDisabled();
    await user.clear(field);
    await user.type(field, "Hebron Youth");
    expect(button).toBeDisabled();
    expect(within(dialog).queryByText(/The name matches/)).not.toBeInTheDocument();
    await user.type(field, " Employment");
    expect(button).toBeEnabled();
    expect(within(dialog).getByText("The name matches. You can delete the project.")).toBeInTheDocument();
    // Enter does nothing while it does not match.
    await user.type(field, "x{Enter}");
    expect(button).toBeDisabled();
    expect(api.deleteProject).not.toHaveBeenCalled();
  });

  it("deletes, goes back to the projects list and confirms", async () => {
    signInAs("org_admin");
    vi.mocked(api.deleteProject).mockResolvedValue({ deleted: true, removed: {} as never });
    const user = await renderPage();
    const dialog = await openDelete(user);
    await user.type(within(dialog).getByLabelText("Type the project name to confirm"), NAME);
    await user.click(within(dialog).getByRole("button", { name: "Delete permanently" }));

    expect(api.deleteProject).toHaveBeenCalledWith("p-1", NAME);
    expect(await screen.findByRole("heading", { name: "Projects list" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/projects$/);
    expect(await screen.findByText(/and everything in it were deleted permanently\./)).toBeInTheDocument();
    // The deleted project is never fetched again.
    expect(api.getProject).toHaveBeenCalledTimes(1);
  });

  it("goes back to the archived list after deleting an archived project", async () => {
    signInAs("org_admin");
    vi.mocked(api.getProject).mockResolvedValue(project({ status: "archived" }));
    vi.mocked(api.deleteProject).mockResolvedValue({ deleted: true, removed: {} as never });
    const user = await renderPage();
    const dialog = await openDelete(user);
    // No "Archive instead" for a project that is archived already.
    expect(within(dialog).queryByRole("button", { name: "Archive instead" })).not.toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Type the project name to confirm"), `  ${NAME} `);
    await user.click(within(dialog).getByRole("button", { name: "Delete permanently" }));
    await screen.findByRole("heading", { name: "Projects list" });
    expect(screen.getByTestId("location")).toHaveTextContent("/projects?view=archived");
  });

  it("shows the server's refusals in the dialog and keeps it open", async () => {
    signInAs("org_admin");
    const user = await renderPage();
    const dialog = await openDelete(user);
    const field = within(dialog).getByLabelText("Type the project name to confirm");
    await user.type(field, NAME);

    vi.mocked(api.deleteProject).mockRejectedValueOnce(new ApiError("Confirmation name does not match", 400, "confirm_name_mismatch"));
    await user.click(within(dialog).getByRole("button", { name: "Delete permanently" }));
    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent("The name you typed does not match the project name. Type it exactly as shown.");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveFocus();

    vi.mocked(api.deleteProject).mockRejectedValueOnce(new ApiError("Insufficient permissions", 403));
    await user.click(within(dialog).getByRole("button", { name: "Delete permanently" }));
    expect(await within(dialog).findByText(/You don't have permission to do this/)).toBeInTheDocument();

    vi.mocked(api.deleteProject).mockRejectedValueOnce(new ApiError("Internal server error", 500));
    await user.click(within(dialog).getByRole("button", { name: "Delete permanently" }));
    expect(await within(dialog).findByText("We couldn't delete the project. Try again.")).toBeInTheDocument();
    expect(within(dialog).queryByText("Internal server error")).not.toBeInTheDocument();
    // Still on the project page (behind the modal dialog).
    expect(screen.getByRole("heading", { level: 1, name: NAME, hidden: true })).toBeInTheDocument();
  });

  it("closes with Escape, back to the menu button, and starts empty next time", async () => {
    signInAs("org_admin");
    const user = await renderPage();
    let dialog = await openDelete(user);
    await user.type(within(dialog).getByLabelText("Type the project name to confirm"), "Hebron");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: "Project actions" })).toHaveFocus());
    dialog = await openDelete(user);
    expect(within(dialog).getByLabelText("Type the project name to confirm")).toHaveValue("");
  });

  it("offers to archive instead", async () => {
    signInAs("org_admin");
    const user = await renderPage();
    const dialog = await openDelete(user);
    await user.click(within(dialog).getByRole("button", { name: "Archive instead" }));
    expect(await screen.findByRole("alertdialog", { name: `Archive “⁨${NAME}⁩”?` })).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog", { name: /permanently/ })).not.toBeInTheDocument();
  });

  it("is in Arabic, right to left, for Arabic users", async () => {
    signInAs("org_admin", "ar");
    const user = await renderPage();
    await user.click(screen.getByRole("button", { name: "إجراءات المشروع" }));
    await user.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "حذف نهائي" }));
    const dialog = await screen.findByRole("alertdialog", { name: `حذف المشروع «⁨${NAME}⁩» نهائيًا؟` });
    expect(dialog).toHaveAttribute("dir", "rtl");
    expect(dialog).toHaveAttribute("lang", "ar");
    expect(within(dialog).getByText("نقاط البيانات: 12")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "حذف نهائي" })).toBeDisabled();
  });
});
