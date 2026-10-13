import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import { KpiProgressSteps } from "@/components/kpi/KpiProgressSteps";

describe("KpiProgressSteps", () => {
  it("shows four named steps with done, current and not-started states", () => {
    render(<KpiProgressSteps step="model" scope="result" lang="en" code="O1" />);
    expect(screen.getByText("Preparing suggestions for O1")).toBeInTheDocument();
    const steps = within(screen.getByRole("list", { name: "Preparing suggestions for O1" })).getAllByRole("listitem");
    expect(steps.map((s) => s.textContent)).toEqual([
      "Reading your results chain… (done)",
      "Matching standard indicators… (done)",
      "Writing suggestions… (in progress)",
      "Checking quality… (not started)",
    ]);
    expect(steps[2]).toHaveAttribute("aria-current", "step");
    expect(steps[2].querySelector("svg")?.getAttribute("class")).toContain("motion-safe:animate-spin");
    expect(screen.getByText("This usually takes about 15 seconds.")).toBeInTheDocument();
  });

  it("shows every step done when saving, the framework title and estimate, and Arabic", () => {
    const { rerender } = render(<KpiProgressSteps step="saving" scope="framework" lang="en" />);
    expect(screen.getByText("Preparing suggestions for all results")).toBeInTheDocument();
    expect(screen.getByText("This usually takes one to two minutes.")).toBeInTheDocument();
    expect(screen.getAllByText("(done)", { exact: false })).toHaveLength(4);
    rerender(<KpiProgressSteps step="context" scope="result" lang="ar" code="O1" />);
    expect(screen.getByText("جارٍ إعداد الاقتراحات للنتيجة O1")).toBeInTheDocument();
    expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("قراءة سلسلة النتائج… (قيد التنفيذ)");
  });

  it("announces the step only when it changes", () => {
    const { rerender } = render(<KpiProgressSteps step="context" scope="result" lang="en" code="O1" />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Reading your results chain…");
    rerender(<KpiProgressSteps step="context" scope="result" lang="en" code="O1" />);
    expect(screen.getByRole("status")).toBe(status);
    expect(status).toHaveTextContent("Reading your results chain…");
    rerender(<KpiProgressSteps step="retrieval" scope="result" lang="en" code="O1" />);
    expect(status).toHaveTextContent("Matching standard indicators…");
  });

  it("offers Refresh when it is taking longer", async () => {
    const onRefresh = vi.fn();
    render(<KpiProgressSteps step="model" scope="result" lang="en" code="O1" takingLonger onRefresh={onRefresh} />);
    expect(screen.getByRole("status")).toHaveTextContent("This is taking longer than expected.");
    await userEvent.setup({ delay: null }).click(screen.getByRole("button", { name: "Refresh" }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
