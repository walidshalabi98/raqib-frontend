import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { IndicatorTable } from "@/components/project/IndicatorTable";
import { AuthProvider } from "@/contexts/AuthContext";
import { api } from "@/services/api";
import { renderWithClient } from "@/test/utils";
import { makeIndicator, sampleResultNodes } from "@/test/fixtures";
import type { AuthUser, Framework, FrameworkStatus } from "@/types/api";

vi.mock("@/services/api", () => ({
  api: {
    getFramework: vi.fn(),
    getFrameworkResults: vi.fn(),
    getUser: vi.fn(() => null),
    getToken: vi.fn(() => "token"),
  },
}));

const AI_LABEL = "AI suggested — review before approval";

function framework(status: FrameworkStatus): Framework {
  return {
    id: "fw-1",
    projectId: "p-1",
    version: 1,
    status,
    name: "Logframe",
    aiModelUsed: "claude-sonnet-5-5",
    generatedAt: "2026-01-01T00:00:00.000Z",
    approvedAt: null,
    approvedBy: null,
    resultNodes: sampleResultNodes(),
    indicators: [makeIndicator({ provenance: "ai_generated", isApproved: false })],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getFrameworkResults).mockResolvedValue(sampleResultNodes());
});

describe("IndicatorTable", () => {
  it("labels unapproved AI-made indicators while the framework is under review", async () => {
    vi.mocked(api.getFramework).mockResolvedValue(framework("client_review"));
    renderWithClient(<IndicatorTable projectId="p-1" />);
    expect(await screen.findByText(AI_LABEL)).toBeInTheDocument();
  });

  it.each(["approved", "active"] as const)("drops the AI label once the framework is %s", async (status) => {
    vi.mocked(api.getFramework).mockResolvedValue(framework(status));
    renderWithClient(<IndicatorTable projectId="p-1" />);
    expect(await screen.findByText("% of households with acceptable FCS")).toBeInTheDocument();
    expect(screen.queryByText(AI_LABEL)).not.toBeInTheDocument();
  });

  it("marks translated buttons with their language on this English screen", async () => {
    const arabicUser: AuthUser = {
      id: "u1", email: "sara@example.org", fullName: "Sara", role: "me_officer", languagePref: "ar",
      organization: { id: "org-1", name: "Org" },
    };
    vi.mocked(api.getUser).mockReturnValue(arabicUser);
    vi.mocked(api.getFramework).mockResolvedValue(framework("draft"));
    renderWithClient(<AuthProvider><IndicatorTable projectId="p-1" /></AuthProvider>);
    expect(await screen.findByRole("button", { name: "إضافة مؤشر" })).toHaveAttribute("lang", "ar");
    const edits = screen.getAllByRole("button", { name: /^تعديل المؤشر: / });
    expect(edits.length).toBeGreaterThan(0);
    for (const edit of edits) expect(edit).toHaveAttribute("lang", "ar");
  });
});
