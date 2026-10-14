import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import Projects from "@/pages/Projects";
import { AuthProvider } from "@/contexts/AuthContext";
import { api } from "@/services/api";
import { ApiError } from "@/lib/apiError";
import { renderWithClient } from "@/test/utils";
import type { AuthUser, Project } from "@/types/api";

vi.mock("@/services/api", () => ({
  api: {
    getProjects: vi.fn(),
    createProject: vi.fn(),
    getUser: vi.fn(() => null),
    getToken: vi.fn(() => "token"),
  },
}));

const ACTIVE = [
  { id: "p-1", name: "Gaza water trucking", status: "active", donor: "DG ECHO", sector: "wash", sectors: ["wash"], geographicScope: "Gaza" },
  { id: "p-2", name: "Hebron youth jobs", status: "setup", donor: "EU", sector: "livelihoods", sectors: ["livelihoods"], geographicScope: "Hebron" },
] as Project[];
const ARCHIVED = [
  { id: "p-9", name: "Jenin school rehabilitation 2024", status: "archived", donor: "UNICEF", sector: "education", sectors: ["education"], geographicScope: "Jenin" },
] as Project[];

function signInAs(role: string, languagePref = "en") {
  const user: AuthUser = { id: "u1", email: "u@example.org", fullName: "User", role, languagePref, organization: { id: "org-1", name: "Org" } };
  vi.mocked(api.getUser).mockReturnValue(user);
}

function Location() {
  const { pathname, search } = useLocation();
  return <output data-testid="location">{`${pathname}${search}`}</output>;
}

function renderPage(path = "/projects", state?: unknown) {
  renderWithClient(
    <AuthProvider>
      <MemoryRouter initialEntries={[{ pathname: path.split("?")[0], search: path.includes("?") ? `?${path.split("?")[1]}` : "", state }]}>
        <Routes>
          <Route path="/projects" element={<><Projects /><Location /></>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
  return userEvent.setup({ delay: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  signInAs("org_admin");
  vi.mocked(api.getProjects).mockImplementation(async (options) => (options?.archived ? ARCHIVED : ACTIVE));
});

describe("Projects page language", () => {
  it("is in the user's language, right to left in Arabic", async () => {
    signInAs("org_admin", "ar");
    renderPage();
    expect(await screen.findByText("Gaza water trucking")).toBeInTheDocument();
    const heading = screen.getByRole("heading", { level: 1, name: "المشاريع" });
    const page = heading.closest("[lang]") as HTMLElement;
    expect(page).toHaveAttribute("lang", "ar");
    expect(page).toHaveAttribute("dir", "rtl");
    expect(screen.getByText("المياه والصرف الصحي والنظافة", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "مشروع جديد" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "المشاريع النشطة" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "المشاريع المؤرشفة" })).toBeInTheDocument();
    expect(screen.getByText("نشط")).toBeInTheDocument();
  });
});

// Every donor passes through this page to reach a project (axe button-name, WCAG 4.1.2; contrast, 1.4.3).
describe("Projects list controls", () => {
  it("names the search, both filters and the layout toggles, and says which layout is on", async () => {
    signInAs("donor_viewer");
    const user = renderPage();
    expect(await screen.findByText("Gaza water trucking")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Search projects" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filter by sector" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filter by status" })).toBeInTheDocument();
    const cards = screen.getByRole("button", { name: "Show as cards" });
    const list = screen.getByRole("button", { name: "Show as a list" });
    expect(cards).toHaveAttribute("aria-pressed", "true");
    expect(list).toHaveAttribute("aria-pressed", "false");
    await user.click(list);
    expect(list).toHaveAttribute("aria-pressed", "true");
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("columnheader").map((th) => th.textContent)).toEqual(["Project", "Sector", "Donor", "Status"]);
  });

  it("names them in Arabic", async () => {
    signInAs("donor_viewer", "ar");
    renderPage();
    await screen.findByText("Gaza water trucking");
    expect(screen.getByRole("combobox", { name: "التصفية حسب القطاع" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "طريقة العرض" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "البحث في المشاريع" })).toHaveAttribute("placeholder", "ابحث في المشاريع");
  });

  it("offers New project to admins only (the API refuses everyone else)", async () => {
    signInAs("donor_viewer");
    renderPage();
    await screen.findByText("Gaza water trucking");
    expect(screen.queryByRole("button", { name: "New project" })).not.toBeInTheDocument();
  });

  it("shows the status with foreground text on its tint (contrast), not coloured text", async () => {
    signInAs("donor_viewer");
    renderPage();
    const pill = await screen.findByText("Active");
    expect(pill.className).toContain("text-foreground");
    expect(pill.className).not.toContain("text-success");
    expect(screen.getByText("Setup")).toBeInTheDocument();
  });

  it("filters by search and says when nothing matches", async () => {
    const user = renderPage();
    await screen.findByText("Gaza water trucking");
    await user.type(screen.getByRole("textbox", { name: "Search projects" }), "hebron");
    expect(screen.queryByText("Gaza water trucking")).not.toBeInTheDocument();
    expect(screen.getByText("Hebron youth jobs")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Search projects" }), " nothing");
    expect(screen.getByText("No projects match your search or filters.")).toBeInTheDocument();
  });
});

describe("Active and archived projects", () => {
  it("shows active projects by default; the switch is a labelled tab list", async () => {
    renderPage();
    expect(await screen.findByText("Gaza water trucking")).toBeInTheDocument();
    const tabs = screen.getByRole("tablist", { name: "Which projects to show" });
    expect(within(tabs).getByRole("tab", { name: "Active projects" })).toHaveAttribute("aria-selected", "true");
    expect(within(tabs).getByRole("tab", { name: "Archived projects" })).toHaveAttribute("aria-selected", "false");
    expect(api.getProjects).toHaveBeenCalledTimes(1);
    expect(api.getProjects).toHaveBeenCalledWith();
    expect(screen.queryByText("Jenin school rehabilitation 2024")).not.toBeInTheDocument();
  });

  it("switches to archived projects, with an Archived badge (text and icon) and the view in the address", async () => {
    const user = renderPage();
    await screen.findByText("Gaza water trucking");
    await user.click(screen.getByRole("tab", { name: "Archived projects" }));
    expect(await screen.findByText("Jenin school rehabilitation 2024")).toBeInTheDocument();
    expect(api.getProjects).toHaveBeenLastCalledWith({ archived: true });
    expect(screen.queryByText("Gaza water trucking")).not.toBeInTheDocument();
    const badge = screen.getByText("Archived");
    expect(badge.querySelector("svg")).not.toBeNull();
    expect(badge.className).toContain("text-foreground");
    expect(screen.getByText(/Archived projects are read-only and nothing in them was deleted/)).toBeInTheDocument();
    // Archived projects have one status: the status filter is only in the active view.
    expect(screen.queryByRole("combobox", { name: "Filter by status" })).not.toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/projects?view=archived");
    expect(screen.getByRole("link", { name: /Jenin school rehabilitation 2024/ })).toHaveAttribute("href", "/projects/p-9");
  });

  it("works with the keyboard: arrow keys move between the two views", async () => {
    const user = renderPage();
    await screen.findByText("Gaza water trucking");
    const active = screen.getByRole("tab", { name: "Active projects" });
    active.focus();
    await user.keyboard("{ArrowRight}");
    const archived = screen.getByRole("tab", { name: "Archived projects" });
    expect(archived).toHaveFocus();
    expect(archived).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByText("Jenin school rehabilitation 2024")).toBeInTheDocument();
    await user.keyboard("{ArrowLeft}");
    expect(active).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByText("Gaza water trucking")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/projects$/);
  });

  it("opens the archived view from ?view=archived", async () => {
    renderPage("/projects?view=archived");
    expect(await screen.findByText("Jenin school rehabilitation 2024")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Archived projects" })).toHaveAttribute("aria-selected", "true");
    expect(api.getProjects).toHaveBeenCalledWith({ archived: true });
  });

  it("explains an empty archive", async () => {
    vi.mocked(api.getProjects).mockImplementation(async (options) => (options?.archived ? [] : ACTIVE));
    renderPage("/projects?view=archived");
    expect(await screen.findByText(/No archived projects\. When an organisation admin archives a project, it moves here/)).toBeInTheDocument();
  });

  it("explains an empty active list to admins and to everyone else", async () => {
    vi.mocked(api.getProjects).mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText("No active projects yet. Create one with New project.")).toBeInTheDocument();
  });

  it("tells non-admins who creates projects", async () => {
    signInAs("me_officer");
    vi.mocked(api.getProjects).mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText("No active projects yet. Your organisation's admin creates projects.")).toBeInTheDocument();
  });

  it("shows a failed request as an error with Try again, never as an empty list", async () => {
    vi.mocked(api.getProjects).mockRejectedValueOnce(new ApiError("Internal server error", 500)).mockResolvedValue(ACTIVE);
    const user = renderPage();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We couldn't load the projects.");
    expect(screen.queryByText(/No active projects/)).not.toBeInTheDocument();
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Gaza water trucking")).toBeInTheDocument();
  });

  it("shows loading as a named status", async () => {
    vi.mocked(api.getProjects).mockReturnValue(new Promise(() => undefined));
    renderPage();
    // (The test's <output> showing the address is a status too.)
    expect((await screen.findByText("Loading projects…")).closest("[role=status]")).not.toBeNull();
  });

  it("puts focus on the heading after a project was deleted", async () => {
    renderPage("/projects", { projectDeleted: true });
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Projects" })).toHaveFocus());
  });
});
