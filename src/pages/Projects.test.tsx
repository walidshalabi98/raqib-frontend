import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
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
  id: "u1", email: "sara@example.org", fullName: "Sara", role: "me_officer", languagePref: "ar",
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
