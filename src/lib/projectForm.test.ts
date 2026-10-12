import { describe, expect, it } from "vitest";
import {
  emptyProjectForm,
  mergeSectors,
  projectFormToPayload,
  toggleSector,
  validateProjectForm,
  withPrimarySector,
} from "@/lib/projectForm";

const filled = () => ({
  ...emptyProjectForm(),
  name: "Food voucher programme",
  donor: "ECHO",
  donorType: "echo" as const,
  startDate: "2026-01-01",
  endDate: "2026-12-31",
});

describe("project form", () => {
  it("keeps the primary sector first and out of the additional list", () => {
    expect(mergeSectors("health", ["wash", "health", "cash"])).toEqual(["health", "wash", "cash"]);
    let values = toggleSector(filled(), "cash", true);
    values = toggleSector(values, "mhpss", true);
    values = withPrimarySector(values, "cash");
    expect(values.sector).toBe("cash");
    expect(values.additionalSectors).toEqual(["mhpss"]);
    expect(toggleSector(values, "cash", false)).toBe(values);
    expect(toggleSector(values, "mhpss", false).additionalSectors).toEqual([]);
  });

  it("validates required fields, dates and numbers", () => {
    expect(validateProjectForm(emptyProjectForm())).toEqual({
      name: { key: "name" },
      donor: { key: "donor" },
      startDate: { key: "startDate" },
      endDate: { key: "endDate" },
    });
    expect(validateProjectForm({ ...filled(), endDate: "2025-12-31" }).endDate).toEqual({ key: "endBeforeStart" });
    expect(validateProjectForm({ ...filled(), budgetUsd: "-5", targetBeneficiaries: "12.5" })).toEqual({
      budgetUsd: { key: "number" },
      targetBeneficiaries: { key: "wholeNumber" },
    });
    expect(validateProjectForm(filled())).toEqual({});
  });

  it("accepts Arabic-Indic digits and thousands separators, as the backend does", () => {
    for (const [budgetUsd, targetBeneficiaries] of [["٥٠٠٠٠٠", "١٢٠٠"], ["500,000", "1,200"], ["۵۰۰٬۰۰۰", "۱۲۰۰"]]) {
      const values = { ...filled(), budgetUsd, targetBeneficiaries };
      expect(validateProjectForm(values), budgetUsd).toEqual({});
      expect(projectFormToPayload(values)).toMatchObject({ budgetUsd: 500000, targetBeneficiaries: 1200 });
    }
    expect(projectFormToPayload({ ...filled(), budgetUsd: "١٢٫٥" }).budgetUsd).toBe(12.5);
    expect(validateProjectForm({ ...filled(), budgetUsd: "500 USD", targetBeneficiaries: "١٢٫٥" })).toEqual({
      budgetUsd: { key: "number" },
      targetBeneficiaries: { key: "wholeNumber" },
    });
    expect(validateProjectForm({ ...filled(), budgetUsd: "10000000000" }).budgetUsd).toEqual({ key: "number" });
  });

  it("sends sectors and the humanitarian flag", () => {
    const values = { ...toggleSector(filled(), "cash", true), humanitarian: true, budgetUsd: "250000", targetBeneficiaries: "1200" };
    expect(projectFormToPayload(values)).toEqual({
      name: "Food voucher programme",
      description: undefined,
      sector: "livelihoods",
      sectors: ["livelihoods", "cash"],
      humanitarian: true,
      donor: "ECHO",
      donorType: "echo",
      budgetUsd: 250000,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      targetBeneficiaries: 1200,
      geographicScope: undefined,
    });
  });
});
