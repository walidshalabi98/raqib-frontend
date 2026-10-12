import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { AssessmentPipeline } from "@/components/project/AssessmentPipeline";
import { AuthProvider } from "@/contexts/AuthContext";
import { api } from "@/services/api";
import { renderWithClient } from "@/test/utils";
import type { AuthUser } from "@/types/api";

vi.mock("@/services/api", () => ({
  api: {
    getAssessments: vi.fn(),
    getAssessmentReport: vi.fn(),
    getUser: vi.fn(() => null),
    getToken: vi.fn(() => null),
  },
}));

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

const failed = {
  id: "a-1",
  type: "midterm",
  status: "analysis",
  scopeDescription: "AI generation failed: the AI model declined the request. Try again or write the assessment manually.",
  methodsIncluded: [],
  requestedAt: ago(60_000),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getUser).mockReturnValue(null);
});

describe("AssessmentPipeline", () => {
  it("shows the failure message with an error icon instead of 'AI Generating', and stops polling", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.mocked(api.getAssessments).mockResolvedValue([failed]);
      renderWithClient(<AssessmentPipeline projectId="p-1" />);

      const title = await screen.findByText("AI generation failed");
      expect(screen.getByText("The AI model declined the request. Try again or write the assessment manually.")).toBeInTheDocument();
      expect(title.closest("div[aria-live]")).not.toBeNull();
      expect(title.parentElement?.parentElement?.querySelector("svg")).not.toBeNull();
      expect(screen.queryByText("AI Generating")).not.toBeInTheDocument();

      await vi.advanceTimersByTimeAsync(60_000);
      expect(api.getAssessments).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("polls while the AI report is generated and shows the failure when it arrives", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.mocked(api.getAssessments)
        .mockResolvedValueOnce([{ ...failed, status: "scoping", scopeDescription: "AI-generated midterm assessment" }])
        .mockResolvedValue([failed]);
      renderWithClient(<AssessmentPipeline projectId="p-1" />);

      expect(await screen.findByText("AI Generating")).toBeInTheDocument();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(await screen.findByText("AI generation failed")).toBeInTheDocument();
      expect(screen.queryByText("AI Generating")).not.toBeInTheDocument();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(api.getAssessments).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not poll for an assessment requested long ago", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.mocked(api.getAssessments).mockResolvedValue([
        { ...failed, status: "scoping", scopeDescription: "AI-generated midterm assessment", requestedAt: ago(24 * 3_600_000) },
      ]);
      renderWithClient(<AssessmentPipeline projectId="p-1" />);
      expect(await screen.findByText("AI Generating")).toBeInTheDocument();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(api.getAssessments).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("labels the failure in Arabic for an Arabic-speaking user", async () => {
    const arabicUser: AuthUser = {
      id: "u1", email: "sara@example.org", fullName: "Sara", role: "me_officer", languagePref: "ar",
      organization: { id: "org-1", name: "Org" },
    };
    vi.mocked(api.getUser).mockReturnValue(arabicUser);
    vi.mocked(api.getAssessments).mockResolvedValue([failed]);
    renderWithClient(<AuthProvider><AssessmentPipeline projectId="p-1" /></AuthProvider>);

    const title = await screen.findByText("تعذّر إنشاء التقييم بالذكاء الاصطناعي");
    const block = title.parentElement?.parentElement;
    expect(block).toHaveAttribute("lang", "ar");
    expect(block).toHaveAttribute("dir", "rtl");
  });
});
