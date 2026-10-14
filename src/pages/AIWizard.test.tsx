import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { toast } from "sonner";
import AIWizard from "@/pages/AIWizard";
import { api } from "@/services/api";
import { renderWithClient } from "@/test/utils";
import type { Framework, ProjectDetail } from "@/types/api";

vi.mock("@/services/api", () => ({
  api: {
    getDocuments: vi.fn(),
    uploadDocument: vi.fn(),
    generateFramework: vi.fn(),
    checkGenerationStatus: vi.fn(),
    getFramework: vi.fn(),
    getProject: vi.fn(),
    getUser: vi.fn(() => null),
    getToken: vi.fn(() => null),
  },
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

const FAILURE = "Framework generation did not finish (the run was interrupted). Generate a new version to try again.";

function renderWizard() {
  return renderWithClient(
    <MemoryRouter initialEntries={["/projects/p-1/wizard"]}>
      <Routes>
        <Route path="/projects/:id/wizard" element={<AIWizard />} />
        <Route path="/projects/:id" element={<p>Project page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getUser).mockReturnValue(null);
  vi.mocked(api.getDocuments).mockResolvedValue([]);
  vi.mocked(api.getProject).mockResolvedValue({ id: "p-1", status: "setup" } as ProjectDetail);
  vi.mocked(api.generateFramework).mockResolvedValue({ frameworkId: "fw-2", status: "processing" });
});

describe("AIWizard framework generation", () => {
  it("shows the backend's failure message, stops polling and offers the start button again", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.mocked(api.checkGenerationStatus)
        .mockResolvedValueOnce({ frameworkId: "fw-2", status: "processing" })
        .mockResolvedValue({ frameworkId: "fw-2", status: "failed", message: FAILURE });
      const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
      renderWizard();

      await user.click(await screen.findByRole("button", { name: /Upload & Process/ }));
      await vi.advanceTimersByTimeAsync(2_000);
      await vi.advanceTimersByTimeAsync(3_000);

      const alert = await screen.findByRole("alert");
      expect(within(alert).getByText("Framework generation failed")).toBeInTheDocument();
      expect(within(alert).getByText(FAILURE)).toBeInTheDocument();
      expect(alert.querySelector("svg")).not.toBeNull();
      expect(toast.error).toHaveBeenCalledWith("Framework generation failed", { description: FAILURE });
      // Back on the upload step: starting again is the retry.
      expect(screen.getByRole("button", { name: /Upload & Process/ })).toBeInTheDocument();

      const calls = vi.mocked(api.checkGenerationStatus).mock.calls.length;
      expect(calls).toBe(2);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(api.checkGenerationStatus).toHaveBeenCalledTimes(calls);
      expect(api.getFramework).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("moves to the review step with the framework the status returns", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const framework = {
        id: "fw-2",
        indicators: [{ id: "i-1", indicatorText: "% of youth employed", level: "outcome", dataCollectionMethod: "hh_survey", targetValue: null }],
      } as unknown as Framework;
      vi.mocked(api.checkGenerationStatus).mockResolvedValue({ frameworkId: "fw-2", status: "completed", framework });
      const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
      renderWizard();

      await user.click(await screen.findByRole("button", { name: /Upload & Process/ }));
      await vi.advanceTimersByTimeAsync(3_000);
      expect(await screen.findByText("% of youth employed")).toBeInTheDocument();
      expect(api.getFramework).not.toHaveBeenCalled();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("warns that names and addresses are not removed, next to the upload, and refuses .doc files", async () => {
    renderWizard();
    const warning = await screen.findByText(/Raqib cannot remove names or addresses/);
    const input = document.querySelector('input[type="file"]');
    expect(input).toHaveAttribute("accept", ".pdf,.docx,.xlsx");
    expect(input).toHaveAttribute("aria-describedby", warning.parentElement?.id);
  });
});

describe("AIWizard on an archived project", () => {
  it("sends the user back to the read-only project page without loading or changing anything", async () => {
    vi.mocked(api.getProject).mockResolvedValue({ id: "p-1", status: "archived" } as ProjectDetail);
    renderWizard();
    expect(await screen.findByText("Project page")).toBeInTheDocument();
    expect(api.getDocuments).not.toHaveBeenCalled();
    expect(api.generateFramework).not.toHaveBeenCalled();
  });
});
