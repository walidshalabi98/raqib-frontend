import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "@/i18n";
import { AiSuggestedLabel } from "@/components/common/AiSuggestedLabel";
import { MethodPill } from "@/components/common/MethodPill";

describe("AiSuggestedLabel", () => {
  it("labels AI content with text and a hidden icon, in both languages", () => {
    const { rerender } = render(<AiSuggestedLabel lang="en" id="ai-label" />);
    const note = screen.getByRole("note");
    expect(note).toHaveTextContent("AI suggested — review before approval");
    expect(note).toHaveAttribute("id", "ai-label");
    expect(note).toHaveAttribute("lang", "en");
    expect(note.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    rerender(<AiSuggestedLabel lang="ar" variant="banner" />);
    expect(screen.getByRole("note")).toHaveAttribute("lang", "ar");
    expect(screen.getByRole("note").className).toContain("flex");
  });
});

describe("MethodPill", () => {
  it("shows a translated label when given, else the English short label", () => {
    const { rerender } = render(<MethodPill method="hh_survey" />);
    expect(screen.getByText("HH Survey")).toBeInTheDocument();
    rerender(<MethodPill method="hh_survey" label="مسح أسري" />);
    expect(screen.getByText("مسح أسري")).toBeInTheDocument();
  });
});
