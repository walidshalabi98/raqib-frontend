import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { RequireCapability } from "@/components/RequireCapability";
import { api } from "@/services/api";
import type { AuthUser } from "@/types/api";

vi.mock("@/services/api", () => ({
  api: {
    getUser: vi.fn(() => null),
    getToken: vi.fn(() => "token"),
  },
}));

function signInAs(role: string) {
  const user: AuthUser = { id: "u1", email: "u@example.org", fullName: "User", role, languagePref: "en", organization: { id: "org-1", name: "Org" } };
  vi.mocked(api.getUser).mockReturnValue(user);
}

function renderAt(path: string) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/wizard/:id"
            element={
              <RequireCapability capability="ai.run" redirectTo={(p) => `/projects/${encodeURIComponent(p.id ?? "")}`}>
                <p>AI wizard</p>
              </RequireCapability>
            }
          />
          <Route path="/projects/:id" element={<p>Project page</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("RequireCapability", () => {
  it("sends a donor viewer from the AI wizard back to the project", () => {
    signInAs("donor_viewer");
    renderAt("/wizard/p-1");
    expect(screen.getByText("Project page")).toBeInTheDocument();
    expect(screen.queryByText("AI wizard")).not.toBeInTheDocument();
  });

  it("sends an unknown role back too (deny by default)", () => {
    signInAs("auditor");
    renderAt("/wizard/p-1");
    expect(screen.getByText("Project page")).toBeInTheDocument();
  });

  it("lets an M&E officer use the wizard", () => {
    signInAs("me_officer");
    renderAt("/wizard/p-1");
    expect(screen.getByText("AI wizard")).toBeInTheDocument();
    expect(screen.queryByText("Project page")).not.toBeInTheDocument();
  });
});
