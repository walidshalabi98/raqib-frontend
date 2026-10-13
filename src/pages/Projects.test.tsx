import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Projects from "@/pages/Projects";
import { AuthProvider } from "@/contexts/AuthContext";
import { api } from "@/services/api";
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

const arabicUser: AuthUser = {
  id: "u1", email: "sara@example.org", fullName: "Sara", role: "org_admin", languagePref: "ar",
  organization: { id: "org-1", name: "Org" },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getUser).mockReturnValue(arabicUser);
  vi.mocked(api.getProjects).mockResolvedValue([
    { id: "p-1", name: "Gaza water trucking", status: "active", donor: "DG ECHO", sector: "wash", sectors: ["wash"], geographicScope: "Gaza" } as Project,
  ]);
});

describe("Projects page", () => {
  it("marks translated parts with their language on the English page (WCAG 3.1.2)", async () => {
    renderWithClient(<MemoryRouter><AuthProvider><Projects /></AuthProvider></MemoryRouter>);
    expect(await screen.findByText("Gaza water trucking")).toBeInTheDocument();
    expect(screen.getByText("المياه والصرف الصحي والنظافة")).toHaveAttribute("lang", "ar");
    expect(screen.getByRole("button", { name: "مشروع جديد" })).toHaveAttribute("lang", "ar");
    // The sector filter shows the selected (translated) item.
    expect(screen.getByText("جميع القطاعات")).toHaveAttribute("lang", "ar");
  });
});

function renderDonor(languagePref: string) {
  const user: AuthUser = { id: "u2", email: "d@example.org", fullName: "Donor", role: "donor_viewer", languagePref, organization: { id: "org-1", name: "Org" } };
  vi.mocked(api.getUser).mockReturnValue(user);
  return renderWithClient(<MemoryRouter><AuthProvider><Projects /></AuthProvider></MemoryRouter>);
}

// Every donor passes through this page to reach a project (axe button-name, WCAG 4.1.2; contrast, 1.4.3).
describe("Projects list controls", () => {
  it("names the search, both filters and the layout toggles, and says which layout is on", async () => {
    const user = userEvent.setup({ delay: null });
    renderDonor("en");
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
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("names them in Arabic, marked as Arabic", async () => {
    renderDonor("ar");
    await screen.findByText("Gaza water trucking");
    expect(screen.getByRole("combobox", { name: "التصفية حسب القطاع" })).toHaveAttribute("lang", "ar");
    expect(screen.getByRole("group", { name: "طريقة العرض" })).toHaveAttribute("lang", "ar");
    expect(screen.getByRole("textbox", { name: "البحث في المشاريع" })).toHaveAttribute("placeholder", "ابحث في المشاريع");
  });

  it("offers New project to admins only (the API refuses everyone else)", async () => {
    renderDonor("en");
    await screen.findByText("Gaza water trucking");
    expect(screen.queryByRole("button", { name: "New project" })).not.toBeInTheDocument();
  });

  it("shows the status with foreground text on its tint (contrast), not coloured text", async () => {
    renderDonor("en");
    const pill = await screen.findByText("Active");
    expect(pill.className).toContain("text-foreground");
    expect(pill.className).not.toContain("text-success");
  });
});
