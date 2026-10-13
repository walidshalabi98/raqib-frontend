import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "@/i18n";
import { StandardBadge } from "@/components/kpi/StandardBadge";

describe("StandardBadge", () => {
  it("shows the standard reference left-to-right when there is one", () => {
    render(<StandardBadge libraryId="EU-01" standardReferenceCode="EU GERF 2.38" lang="ar" />);
    const code = screen.getByText("EU GERF 2.38");
    expect(code).toHaveAttribute("dir", "ltr");
    expect(screen.queryByText(/EU-01/)).not.toBeInTheDocument();
  });

  it("falls back to the library id, then Custom, in both languages", () => {
    const { rerender } = render(<StandardBadge libraryId="FS-01" standardReferenceCode={null} lang="en" />);
    expect(screen.getByText("Library FS-01")).toBeInTheDocument();
    rerender(<StandardBadge libraryId="FS-01" standardReferenceCode="  " lang="ar" />);
    expect(screen.getByText("المكتبة FS-01")).toBeInTheDocument();
    rerender(<StandardBadge libraryId={null} standardReferenceCode={null} lang="en" />);
    expect(screen.getByText("Custom")).toBeInTheDocument();
    rerender(<StandardBadge libraryId={null} standardReferenceCode={null} lang="ar" />);
    expect(screen.getByText("مخصّص")).toBeInTheDocument();
  });

  it("shows Custom for an AI-written indicator with no library entry, whatever code it carries (SPEC-4)", () => {
    const { rerender } = render(<StandardBadge libraryId={null} standardReferenceCode="SDG 4.1.1 (aligned)" provenance="ai_suggested" lang="en" />);
    expect(screen.getByText("Custom")).toBeInTheDocument();
    expect(screen.queryByText(/SDG 4\.1\.1/)).not.toBeInTheDocument();
    rerender(<StandardBadge libraryId={null} standardReferenceCode="EU GERF 2.38" provenance="ai_generated" lang="ar" />);
    expect(screen.getByText("مخصّص")).toBeInTheDocument();
    // A library-linked AI suggestion keeps its standard code; a code staff typed on their own indicator is shown.
    rerender(<StandardBadge libraryId="EU-01" standardReferenceCode="EU GERF 2.38" provenance="ai_suggested" lang="en" />);
    expect(screen.getByText("EU GERF 2.38")).toBeInTheDocument();
    rerender(<StandardBadge libraryId={null} standardReferenceCode="ECHO KRI 1" provenance="manual" lang="en" />);
    expect(screen.getByText("ECHO KRI 1")).toBeInTheDocument();
  });
});
