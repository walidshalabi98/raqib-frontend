import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Reports from "@/pages/Reports";
import { AuthProvider } from "@/contexts/AuthContext";
import { api } from "@/services/api";
import { makeDonorReport, makeReport } from "@/test/fixtures";
import { renderWithClient } from "@/test/utils";
import type { AuthUser, Project } from "@/types/api";

vi.mock("@/services/api", () => ({
  api: {
    getProjects: vi.fn(),
    getReports: vi.fn(),
    generateReport: vi.fn(),
    publishReport: vi.fn(),
    unpublishReport: vi.fn(),
    getUser: vi.fn(() => null),
    getToken: vi.fn(() => "token"),
  },
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

const projects = [
  { id: "p-1", name: "Hebron Youth Employment" },
  { id: "p-2", name: "Gaza Water Access" },
] as Project[];

function signInAs(role: string, languagePref = "en") {
  const user: AuthUser = { id: "u1", email: "u@example.org", fullName: "User", role, languagePref, organization: { id: "org-1", name: "Org" } };
  vi.mocked(api.getUser).mockReturnValue(user);
}

function renderPage() {
  return renderWithClient(
    <AuthProvider>
      <MemoryRouter>
        <Reports />
      </MemoryRouter>
    </AuthProvider>,
  );
}

const section = async (name: string) => screen.findByRole("region", { name });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getProjects).mockResolvedValue(projects);
});

describe("Reports page", () => {
  it("shows donor viewers the published reports per project, and says when none are published yet", async () => {
    signInAs("donor_viewer");
    vi.mocked(api.getReports).mockImplementation(async (projectId) => (projectId === "p-1" ? [makeDonorReport()] : []));
    renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Reports" })).toBeInTheDocument();
    expect(screen.getByText("Reports your organisation has published for you, by project.")).toBeInTheDocument();
    const hebron = await section("Hebron Youth Employment");
    expect(await within(hebron).findByText("Q3 summary")).toBeInTheDocument();
    expect(within(hebron).queryByText("Published to donors")).not.toBeInTheDocument();
    const gaza = await section("Gaza Water Access");
    expect(await within(gaza).findByText("Reports appear here once your organisation publishes them.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Generate a report/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Publish/ })).not.toBeInTheDocument();
  });

  it("gives org admins each report's status, Review and publish, Unpublish, and sends them to the project's Reports tab to generate one", async () => {
    signInAs("org_admin");
    vi.mocked(api.getReports).mockImplementation(async (projectId) =>
      projectId === "p-1" ? [makeReport(), makeReport({ id: "r-2", title: "Annual review 2025", status: "published" })] : [],
    );
    renderPage();

    const hebron = await section("Hebron Youth Employment");
    expect(await within(hebron).findByText("Draft")).toBeInTheDocument();
    expect(within(hebron).getByText("Published to donors")).toBeInTheDocument();
    // Publishing happens in the reading view, after the text has been read.
    expect(within(hebron).getByRole("button", { name: /^Review .*Q3 summary.* and publish it to donors$/ })).toBeInTheDocument();
    expect(within(hebron).queryByRole("button", { name: /^Publish/ })).not.toBeInTheDocument();
    expect(within(hebron).getByRole("button", { name: /^Unpublish .*Annual review 2025/ })).toBeInTheDocument();
    expect(within(hebron).getByRole("link", { name: /^Generate a report for .*Hebron Youth Employment/ })).toHaveAttribute("href", "/projects/p-1?tab=reports");
    // The form lives in the project: no second Generate report dialog here.
    expect(screen.queryByRole("button", { name: /Generate report/i })).not.toBeInTheDocument();
    const gaza = await section("Gaza Water Access");
    expect(await within(gaza).findByText("No reports generated yet.")).toBeInTheDocument();
  });

  it("shows M&E officers the status without Publish", async () => {
    signInAs("me_officer");
    vi.mocked(api.getReports).mockResolvedValue([makeReport()]);
    renderPage();
    const hebron = await section("Hebron Youth Employment");
    expect(await within(hebron).findByText("Draft")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Publish|Review/ })).not.toBeInTheDocument();
    expect(within(hebron).getByRole("button", { name: /^Read .*Q3 summary/ })).toBeInTheDocument();
  });

  it("shows an error with a retry when the projects cannot be loaded", async () => {
    signInAs("donor_viewer");
    vi.mocked(api.getProjects).mockRejectedValueOnce(new Error("Internal server error")).mockResolvedValueOnce([]);
    const user = userEvent.setup({ delay: null });
    renderPage();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We couldn't load the projects.");
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No projects yet.")).toBeInTheDocument();
  });

  it("is in Arabic, right to left, for Arabic users", async () => {
    signInAs("donor_viewer", "ar");
    vi.mocked(api.getReports).mockResolvedValue([]);
    renderPage();
    const heading = screen.getByRole("heading", { level: 1, name: "التقارير" });
    expect(heading.closest("[dir]")).toHaveAttribute("dir", "rtl");
    expect(screen.getByRole("status")).toHaveTextContent("جارٍ التحميل…");
    // One empty state per project.
    await waitFor(() => expect(screen.getAllByText("تظهر التقارير هنا بعد أن تنشرها مؤسستك.")).toHaveLength(2));
  });
});
