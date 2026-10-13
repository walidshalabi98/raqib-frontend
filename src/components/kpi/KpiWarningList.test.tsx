import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import "@/i18n";
import { KpiWarningList } from "@/components/kpi/KpiWarningList";
import { makeKpiWarning } from "@/test/fixtures";

describe("KpiWarningList", () => {
  it("translates each note by code with its params and marks its kind with an icon and hidden text", () => {
    const warnings = [
      makeKpiWarning("target_in_name"),
      makeKpiWarning("sex_keys_from_library", { params: { keys: "sex_of_household_head" } }),
    ];
    render(<KpiWarningList warnings={warnings} lang="en" id="notes" />);
    const list = screen.getByRole("list");
    expect(list).toHaveAttribute("id", "notes");
    const [warning, info] = within(list).getAllByRole("listitem");
    expect(warning).toHaveTextContent("Warning: Move the target out of the name.");
    expect(warning.className).toContain("bg-warning/10");
    expect(warning.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(info).toHaveTextContent("Note: Sex disaggregation added from the library entry (sex_of_household_head).");
    expect(info.className).toContain("text-muted-foreground");
  });

  it("labels an AI note and keeps the model's English text", () => {
    const note = makeKpiWarning("model_note", { params: { message: "Consider a protection indicator." }, message: "AI note: Consider a protection indicator." });
    render(<KpiWarningList warnings={[note]} lang="ar" />);
    expect(screen.getByText("ملاحظة من الذكاء الاصطناعي:")).toBeInTheDocument();
    expect(screen.getByText("Consider a protection indicator.")).toHaveAttribute("lang", "en");
  });

  it("renders Arabic texts and nothing for an empty list", () => {
    const { container, rerender } = render(<KpiWarningList warnings={[makeKpiWarning("arabic_name_missing")]} lang="ar" />);
    expect(screen.getByText(/الاسم العربي غير موجود/)).toBeInTheDocument();
    rerender(<KpiWarningList warnings={[]} lang="en" />);
    expect(container).toBeEmptyDOMElement();
  });
});
