import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Assessments from "@/pages/Assessments";
import { AuthProvider } from "@/contexts/AuthContext";
import { api } from "@/services/api";
import { renderWithClient } from "@/test/utils";
import type { AuthUser, Project } from "@/types/api";

vi.mock("@/services/api", () => ({
  api: {
    getProjects: vi.fn(),
    getAssessments: vi.fn(),
    requestAssessment: vi.fn(),
    getUser: vi.fn(() => null),
    getToken: vi.fn(() => "token"),
  },
}));

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }) }));

function renderAs(role: string) {
  const user: AuthUser = { id: "u1", email: "u@example.org", fullName: "User", role, languagePref: "en", organization: { id: "org-1", name: "Org" } };
  vi.mocked(api.getUser).mockReturnValue(user);
  return renderWithClient(
    <AuthProvider>
      <MemoryRouter>
        <Assessments />
      </MemoryRouter>
    </AuthProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getProjects).mockResolvedValue([{ id: "p-1", name: "Water project" } as Project]);
  vi.mocked(api.getAssessments).mockResolvedValue([]);
  vi.mocked(api.requestAssessment).mockResolvedValue({});
});

describe("Assessments page", () => {
  it("hides Request Assessment from donor viewers", async () => {
    renderAs("donor_viewer");
    expect(await screen.findByRole("link", { name: "Water project" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Request Assessment/ })).not.toBeInTheDocument();
  });

  it("hides it for an unknown role too (deny by default)", async () => {
    renderAs("viewer");
    expect(await screen.findByRole("link", { name: "Water project" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Request Assessment/ })).not.toBeInTheDocument();
  });

  it("lets staff request an assessment for that project (the page has no project in its URL)", async () => {
    const user = userEvent.setup({ delay: null });
    renderAs("me_officer");
    await user.click(await screen.findByRole("button", { name: /Request Assessment/ }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Generate AI Assessment" }));
    expect(api.requestAssessment).toHaveBeenCalledWith("p-1", expect.objectContaining({ type: "baseline" }));
  });
});
