import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "@/i18n";
import { QualityBadge } from "@/components/kpi/QualityBadge";

describe("QualityBadge", () => {
  it("shows the band and score as text with an icon, in English and Arabic", () => {
    const { container, rerender } = render(<QualityBadge score={100} band="strong" lang="en" />);
    expect(screen.getByText("Quality: Strong (100/100)")).toBeInTheDocument();
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    rerender(<QualityBadge score={70} band="review" lang="en" />);
    expect(screen.getByText("Quality: Review (70/100)")).toBeInTheDocument();
    rerender(<QualityBadge score={55} band="weak" lang="ar" />);
    expect(screen.getByText("الجودة: ضعيفة (55/100)")).toBeInTheDocument();
  });

  it("agrees every Arabic band with the feminine الجودة", () => {
    const { rerender } = render(<QualityBadge score={100} band="strong" lang="ar" />);
    expect(screen.getByText("الجودة: قوية (100/100)")).toBeInTheDocument();
    rerender(<QualityBadge score={80} band="review" lang="ar" />);
    expect(screen.getByText("الجودة: تحتاج إلى مراجعة (80/100)")).toBeInTheDocument();
    rerender(<QualityBadge score={40} band="weak" lang="ar" />);
    expect(screen.getByText("الجودة: ضعيفة (40/100)")).toBeInTheDocument();
  });

  it("tints by band but keeps the text in the foreground colour", () => {
    const { container } = render(<QualityBadge score={55} band="weak" lang="en" />);
    const badge = container.firstElementChild as HTMLElement;
    expect(badge.className).toContain("text-foreground");
    expect(badge.className).toContain("bg-destructive/10");
    expect(container.querySelector("svg")?.getAttribute("class")).toContain("text-destructive");
  });
});
