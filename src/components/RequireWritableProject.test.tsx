import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RequireWritableProject } from "@/components/RequireWritableProject";
import { api } from "@/services/api";
import { ApiError } from "@/lib/apiError";
import { renderWithClient } from "@/test/utils";
import type { ProjectDetail } from "@/types/api";

vi.mock("@/services/api", () => ({
  api: {
    getProject: vi.fn(),
    getUser: vi.fn(() => null),
    getToken: vi.fn(() => "token"),
  },
}));

function renderAt(path: string) {
  return renderWithClient(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/wizard/:id" element={<RequireWritableProject><p>AI wizard</p></RequireWritableProject>} />
        <Route path="/projects/:id" element={<p>Project page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("RequireWritableProject", () => {
  it("sends everyone from the AI wizard of an archived project back to the project page", async () => {
    vi.mocked(api.getProject).mockResolvedValue({ id: "p-1", status: "archived" } as ProjectDetail);
    renderAt("/wizard/p-1");
    expect(await screen.findByText("Project page")).toBeInTheDocument();
    expect(screen.queryByText("AI wizard")).not.toBeInTheDocument();
    expect(api.getProject).toHaveBeenCalledWith("p-1");
  });

  it("opens the wizard for a project that is not archived, after a named loading state", async () => {
    vi.mocked(api.getProject).mockResolvedValue({ id: "p-1", status: "setup" } as ProjectDetail);
    renderAt("/wizard/p-1");
    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
    expect(await screen.findByText("AI wizard")).toBeInTheDocument();
  });

  it("leaves a project that cannot be loaded to the wizard's own errors", async () => {
    vi.mocked(api.getProject).mockRejectedValue(new ApiError("Project not found", 404));
    renderAt("/wizard/p-1");
    expect(await screen.findByText("AI wizard")).toBeInTheDocument();
  });
});
