import type { DonorType, ProjectInput, Sector } from "@/types/api";
import type { FormErrors } from "@/lib/indicatorForm";
import { isIsoDate } from "@/lib/dates";
import { parseNonNegative } from "@/lib/numbers";

/**
 * State, validation and payload of the "Create project" form. Mirrors the
 * backend (raqib-backend src/services/projects/validation.ts): `sector` is the
 * primary sector and `sectors` always includes it. Pure functions only.
 */

/** Project.budgetUsd is DECIMAL(12, 2). */
export const MAX_BUDGET_USD = 9_999_999_999.99;
/** Project.targetBeneficiaries is a Postgres INTEGER. */
export const MAX_TARGET_BENEFICIARIES = 2_147_483_647;

export interface ProjectFormValues {
  name: string;
  description: string;
  sector: Sector;
  /** Sectors besides the primary one. */
  additionalSectors: Sector[];
  donorType: DonorType;
  donor: string;
  budgetUsd: string;
  targetBeneficiaries: string;
  startDate: string;
  endDate: string;
  geographicScope: string;
  humanitarian: boolean;
}

export function emptyProjectForm(): ProjectFormValues {
  return {
    name: "",
    description: "",
    sector: "livelihoods",
    additionalSectors: [],
    donorType: "eu",
    donor: "",
    budgetUsd: "",
    targetBeneficiaries: "",
    startDate: "",
    endDate: "",
    geographicScope: "",
    humanitarian: false,
  };
}

/** The primary sector first, then the others without repeats (same rule as the backend). */
export function mergeSectors(primary: Sector, others: readonly Sector[]): Sector[] {
  return Array.from(new Set<Sector>([primary, ...others]));
}

/** New values after choosing a primary sector: it leaves the additional list (it is always included). */
export function withPrimarySector(values: ProjectFormValues, sector: Sector): ProjectFormValues {
  return { ...values, sector, additionalSectors: values.additionalSectors.filter((s) => s !== sector) };
}

/** New values after ticking or unticking an additional sector. */
export function toggleSector(values: ProjectFormValues, sector: Sector, checked: boolean): ProjectFormValues {
  if (sector === values.sector) return values;
  const rest = values.additionalSectors.filter((s) => s !== sector);
  return { ...values, additionalSectors: checked ? [...rest, sector] : rest };
}

/** Budget in USD, or null when the text is not a number from 0 to MAX_BUDGET_USD (Arabic digits and "1,200" accepted). */
export const parseBudget = (text: string) => parseNonNegative(text, { max: MAX_BUDGET_USD });
/** Target beneficiaries, or null when the text is not a whole number from 0 to MAX_TARGET_BENEFICIARIES. */
export const parseBeneficiaries = (text: string) => parseNonNegative(text, { max: MAX_TARGET_BENEFICIARIES, integer: true });

/** Every problem in the form, keyed by field (messages under projectForm.errors). */
export function validateProjectForm(values: ProjectFormValues): FormErrors {
  const errors: FormErrors = {};
  if (!values.name.trim()) errors.name = { key: "name" };
  if (!values.donor.trim()) errors.donor = { key: "donor" };

  if (!values.startDate) errors.startDate = { key: "startDate" };
  else if (!isIsoDate(values.startDate)) errors.startDate = { key: "date" };
  if (!values.endDate) errors.endDate = { key: "endDate" };
  else if (!isIsoDate(values.endDate)) errors.endDate = { key: "date" };
  if (!errors.startDate && !errors.endDate && values.endDate < values.startDate) errors.endDate = { key: "endBeforeStart" };

  const budget = values.budgetUsd.trim();
  if (budget && parseBudget(budget) === null) errors.budgetUsd = { key: "number" };
  const people = values.targetBeneficiaries.trim();
  if (people && parseBeneficiaries(people) === null) errors.targetBeneficiaries = { key: "wholeNumber" };
  return errors;
}

/** Body of POST /api/projects. Empty optional fields are left out; numbers are sent as JSON numbers. */
export function projectFormToPayload(values: ProjectFormValues): ProjectInput {
  const optional = (v: string) => (v.trim() ? v.trim() : undefined);
  const budget = values.budgetUsd.trim();
  const people = values.targetBeneficiaries.trim();
  return {
    name: values.name.trim(),
    description: optional(values.description),
    sector: values.sector,
    sectors: mergeSectors(values.sector, values.additionalSectors),
    humanitarian: values.humanitarian,
    donor: values.donor.trim(),
    donorType: values.donorType,
    budgetUsd: budget ? (parseBudget(budget) ?? undefined) : undefined,
    startDate: values.startDate,
    endDate: values.endDate,
    targetBeneficiaries: people ? (parseBeneficiaries(people) ?? undefined) : undefined,
    geographicScope: optional(values.geographicScope),
  };
}
