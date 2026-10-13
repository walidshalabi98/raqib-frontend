import type {
  ClientProvenance,
  CollectionMethod,
  FrameworkStatus,
  Frequency,
  Indicator,
  IndicatorCalculation,
  IndicatorDirection,
  IndicatorInput,
  IndicatorLevel,
  IndicatorProvenance,
  IndicatorStatus,
  IntermediateTarget,
  Milestone,
  UserRole,
} from "@/types/api";
import { isIsoDate, toDateInput } from "@/lib/dates";

/**
 * State, validation and payloads of the indicator form (the indicator
 * reference sheet, knowledge/me-foundations.md §3). Validation mirrors the
 * backend (raqib-backend src/services/indicators/validation.ts) so most
 * problems are caught before saving. Pure functions only.
 */

// ------------------------------------------------------------------ limits

/** Maximum lengths accepted by the backend. */
export const LIMITS = {
  indicatorText: 1000,
  indicatorTextAr: 1000,
  unit: 100,
  definition: 5000,
  numerator: 1000,
  denominator: 1000,
  formula: 2000,
  rounding: 200,
  meansOfVerification: 2000,
  responsibility: 300,
  baselineValue: 200,
  targetValue: 200,
  currentValue: 200,
  baselineMethod: 2000,
  targetJustification: 2000,
  assumptions: 5000,
  libraryId: 50,
  standardReferenceCode: 100,
  groupKey: 50,
  intermediateTargetValue: 200,
  milestoneLabel: 300,
} as const;

export const MAX_DISAGGREGATION_GROUPS = 20;
export const MAX_INTERMEDIATE_TARGETS = 20;
export const MAX_MILESTONES = 100;

/** Disaggregation group keys are snake_case: "sex", "displacement_status". */
export const DISAGGREGATION_KEY = /^[a-z][a-z0-9_]*$/;

// ------------------------------------------------------------- form state

export interface IntermediateTargetRow {
  date: string;
  value: string;
}

export interface MilestoneRow {
  label: string;
  date: string;
  completed: boolean;
}

/** Every input of the form as the user edits it ("" = empty). */
export interface IndicatorFormValues {
  // Basics
  indicatorText: string;
  indicatorTextAr: string;
  level: IndicatorLevel;
  resultId: string;
  status: IndicatorStatus;
  // Definition and calculation
  definition: string;
  unit: string;
  direction: IndicatorDirection | "";
  numerator: string;
  denominator: string;
  formula: string;
  rounding: string;
  // Disaggregation
  disaggregation: string[];
  // Data collection
  dataCollectionMethod: CollectionMethod;
  frequency: Frequency;
  meansOfVerification: string;
  responsibility: string;
  // Baseline and targets
  baselineValue: string;
  baselineDate: string;
  baselineMethod: string;
  targetValue: string;
  targetJustification: string;
  intermediateTargets: IntermediateTargetRow[];
  currentValue: string;
  // Standard and source
  libraryId: string;
  standardReferenceCode: string;
  // Assumptions
  assumptions: string;
  // Timeline
  startDate: string;
  endDate: string;
  actualStartDate: string;
  actualEndDate: string;
  milestones: MilestoneRow[];
}

/** A blank form with the same defaults the backend uses on create. */
export function emptyIndicatorForm(overrides: Partial<IndicatorFormValues> = {}): IndicatorFormValues {
  return {
    indicatorText: "",
    indicatorTextAr: "",
    level: "output",
    resultId: "",
    status: "not_started",
    definition: "",
    unit: "",
    direction: "",
    numerator: "",
    denominator: "",
    formula: "",
    rounding: "",
    disaggregation: [],
    dataCollectionMethod: "hh_survey",
    frequency: "quarterly",
    meansOfVerification: "",
    responsibility: "",
    baselineValue: "",
    baselineDate: "",
    baselineMethod: "",
    targetValue: "",
    targetJustification: "",
    intermediateTargets: [],
    currentValue: "",
    libraryId: "",
    standardReferenceCode: "",
    assumptions: "",
    startDate: "",
    endDate: "",
    actualStartDate: "",
    actualEndDate: "",
    milestones: [],
    ...overrides,
  };
}

const str = (value: string | null | undefined): string => value ?? "";

/**
 * Fields the form reads from an indicator or a request body. `IndicatorInput` (e.g. a KPI suggestion's draft) and a
 * stored `Indicator` both fit; provenance and phases are not form fields.
 */
export type IndicatorFormSource = Omit<IndicatorInput, "provenance" | "phases">;

/**
 * The form values for an indicator body (knowledge/me-foundations.md §3): missing or null fields become empty
 * inputs, dates become date-input values. Used for a stored indicator (edit) and for a KPI suggestion's draft
 * (Edit & accept; design section 9.5).
 */
export function inputToFormValues(input: IndicatorFormSource): IndicatorFormValues {
  const calc: IndicatorCalculation = input.calculation ?? {};
  return emptyIndicatorForm({
    indicatorText: str(input.indicatorText),
    indicatorTextAr: str(input.indicatorTextAr),
    level: input.level ?? "output",
    resultId: str(input.resultId),
    status: input.status ?? "not_started",
    definition: str(input.definition),
    unit: str(input.unit),
    direction: input.direction ?? "",
    numerator: str(calc.numerator),
    denominator: str(calc.denominator),
    formula: str(calc.formula),
    rounding: str(calc.rounding),
    disaggregation: Array.isArray(input.disaggregation) ? input.disaggregation.filter((k) => typeof k === "string") : [],
    dataCollectionMethod: input.dataCollectionMethod ?? "hh_survey",
    frequency: input.frequency ?? "quarterly",
    meansOfVerification: str(input.meansOfVerification),
    responsibility: str(input.responsibility),
    baselineValue: str(input.baselineValue),
    baselineDate: toDateInput(input.baselineDate),
    baselineMethod: str(input.baselineMethod),
    targetValue: str(input.targetValue),
    targetJustification: str(input.targetJustification),
    intermediateTargets: Array.isArray(input.intermediateTargets)
      ? input.intermediateTargets.map((t) => ({ date: toDateInput(t.date), value: str(t.value) }))
      : [],
    currentValue: str(input.currentValue),
    libraryId: str(input.libraryId),
    standardReferenceCode: str(input.standardReferenceCode),
    assumptions: str(input.assumptions),
    startDate: toDateInput(input.startDate),
    endDate: toDateInput(input.endDate),
    actualStartDate: toDateInput(input.actualStartDate),
    actualEndDate: toDateInput(input.actualEndDate),
    milestones: Array.isArray(input.milestones)
      ? input.milestones.map((m) => ({ label: str(m.label), date: toDateInput(m.date), completed: Boolean(m.completed) }))
      : [],
  });
}

/** The form values for an existing indicator. */
export function indicatorToFormValues(ind: Indicator): IndicatorFormValues {
  return inputToFormValues(ind);
}

// ---------------------------------------------------------------- helpers

/** True when the unit is a percentage ("%", "percent", "percentage", "نسبة مئوية"). */
export function isPercentUnit(unit: string): boolean {
  const u = unit.trim().toLowerCase();
  if (!u) return false;
  return u.includes("%") || u.includes("٪") || u.startsWith("percent") || u === "pct" || u.includes("نسبة مئوية");
}

/** A snake_case key close to what the user typed ("Female headed HH" → "female_headed_hh"); "" when nothing usable is left. */
export function suggestGroupKey(raw: string): string {
  const key = raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^[^a-z]+/, "")
    .replace(/_$/, "");
  return key.slice(0, LIMITS.groupKey);
}

/** True when the provenance is one of Raqib's AI features. */
export function isAiProvenance(provenance: IndicatorProvenance | null | undefined): boolean {
  return provenance === "ai_suggested" || provenance === "ai_generated";
}

/**
 * True once an org admin has approved the framework ("approved", or "active" after it). Indicator approval is
 * offered from then on (IndicatorTable; design section 9.5).
 */
export function isFrameworkApproved(status: FrameworkStatus | null | undefined): boolean {
  return status === "approved" || status === "active";
}

/**
 * The "AI suggested — review before approval" label stays on an AI-made indicator until an org admin approves the
 * indicator itself (raqib-frontend CLAUDE.md rule 5; knowledge/kpi-assistant-spec.md §A7 with design deviation D18):
 * approving the framework no longer removes it, because an indicator accepted into an already approved framework
 * has not been reviewed.
 */
export function needsAiReviewLabel(
  provenance: IndicatorProvenance | null | undefined,
  isApproved: boolean | null | undefined,
): boolean {
  return isAiProvenance(provenance) && !isApproved;
}

/** Roles that may approve an indicator (PATCH /api/indicators/:id/approve; raqib-backend src/routes/indicators.ts). */
export const INDICATOR_APPROVER_ROLES: readonly UserRole[] = ["org_admin", "platform_admin"];

/**
 * Whether the indicator table offers "Approve" for an indicator (design D18 and section 9.5): an org or platform admin,
 * an indicator not yet approved, in a framework that is already approved or active (before that, approving the
 * framework approves its indicators).
 */
export function canApproveIndicator(
  role: string | null | undefined,
  indicator: { isApproved: boolean | null | undefined },
  frameworkStatus: FrameworkStatus | null | undefined,
): boolean {
  return typeof role === "string" && (INDICATOR_APPROVER_ROLES as readonly string[]).includes(role)
    && !indicator.isApproved && isFrameworkApproved(frameworkStatus);
}

/** A library id as the library stores it: trimmed and upper-case ("fs-01 " → "FS-01"). */
export function normaliseLibraryId(value: string): string {
  return value.trim().toUpperCase();
}

/** Provenance sent on create: library when a library entry is linked, else manual. */
export function createProvenance(values: Pick<IndicatorFormValues, "libraryId">): ClientProvenance {
  return values.libraryId.trim() ? "library" : "manual";
}

// ------------------------------------------------------------- validation

/** An error as an i18n key (under indicatorForm.errors) plus interpolation values. */
export interface FormError {
  key: string;
  values?: Record<string, string | number>;
}

export type FormErrors = Record<string, FormError>;

/** The problem with a new disaggregation key, or null when it can be added. */
export function checkGroupKey(raw: string, existing: readonly string[]): FormError | null {
  const key = raw.trim();
  if (!key) return { key: "groupEmpty" };
  if (key.length > LIMITS.groupKey) return { key: "tooLong", values: { max: LIMITS.groupKey } };
  if (!DISAGGREGATION_KEY.test(key)) {
    const suggestion = suggestGroupKey(key);
    return suggestion && !existing.includes(suggestion)
      ? { key: "groupKeyWithSuggestion", values: { key, suggestion } }
      : { key: "groupKey", values: { key } };
  }
  if (existing.includes(key)) return { key: "groupDuplicate", values: { key } };
  if (existing.length >= MAX_DISAGGREGATION_GROUPS) return { key: "groupMax", values: { max: MAX_DISAGGREGATION_GROUPS } };
  return null;
}

type TextField = keyof typeof LIMITS & keyof IndicatorFormValues;

const TEXT_FIELDS: TextField[] = [
  "indicatorText",
  "indicatorTextAr",
  "unit",
  "definition",
  "numerator",
  "denominator",
  "formula",
  "rounding",
  "meansOfVerification",
  "responsibility",
  "baselineValue",
  "targetValue",
  "currentValue",
  "baselineMethod",
  "targetJustification",
  "assumptions",
  "libraryId",
  "standardReferenceCode",
];

const DATE_FIELDS = ["baselineDate", "startDate", "endDate", "actualStartDate", "actualEndDate"] as const;

/**
 * Every problem in the form, keyed by field id: "indicatorText",
 * "intermediateTargets.0.date", "milestones.1.label", "disaggregation".
 * An empty object means the form can be saved. Advice that does not block
 * saving is in indicatorFormWarnings.
 */
export function validateIndicatorForm(values: IndicatorFormValues): FormErrors {
  const errors: FormErrors = {};

  if (!values.indicatorText.trim()) errors.indicatorText = { key: "indicatorTextRequired" };

  for (const field of TEXT_FIELDS) {
    if (!errors[field] && values[field].trim().length > LIMITS[field]) {
      errors[field] = { key: "tooLong", values: { max: LIMITS[field] } };
    }
  }

  for (const field of DATE_FIELDS) {
    const v = values[field].trim();
    if (v && !isIsoDate(v)) errors[field] = { key: "date" };
  }
  if (!errors.startDate && !errors.endDate && values.startDate && values.endDate && values.endDate < values.startDate) {
    errors.endDate = { key: "endBeforeStart" };
  }
  if (
    !errors.actualStartDate && !errors.actualEndDate && values.actualStartDate && values.actualEndDate
    && values.actualEndDate < values.actualStartDate
  ) {
    errors.actualEndDate = { key: "actualEndBeforeStart" };
  }

  // Disaggregation keys (added through the chip input, but stored data may be invalid).
  const groups = values.disaggregation;
  const badGroup = groups.find((k) => !DISAGGREGATION_KEY.test(k) || k.length > LIMITS.groupKey);
  if (badGroup !== undefined) errors.disaggregation = { key: "groupKey", values: { key: badGroup } };
  else if (new Set(groups).size !== groups.length) {
    const dup = groups.find((k, i) => groups.indexOf(k) !== i) as string;
    errors.disaggregation = { key: "groupDuplicate", values: { key: dup } };
  } else if (groups.length > MAX_DISAGGREGATION_GROUPS) {
    errors.disaggregation = { key: "groupMax", values: { max: MAX_DISAGGREGATION_GROUPS } };
  }

  // Intermediate targets: a real date and a value each, one target per date.
  if (values.intermediateTargets.length > MAX_INTERMEDIATE_TARGETS) {
    errors.intermediateTargets = { key: "targetMax", values: { max: MAX_INTERMEDIATE_TARGETS } };
  }
  const seenDates = new Set<string>();
  values.intermediateTargets.forEach((target, i) => {
    const n = i + 1;
    const date = target.date.trim();
    if (!isIsoDate(date)) errors[`intermediateTargets.${i}.date`] = { key: "targetDate", values: { n } };
    else if (seenDates.has(date)) errors[`intermediateTargets.${i}.date`] = { key: "targetDuplicate", values: { date } };
    seenDates.add(date);
    const value = target.value.trim();
    if (!value) errors[`intermediateTargets.${i}.value`] = { key: "targetValue", values: { n } };
    else if (value.length > LIMITS.intermediateTargetValue) {
      errors[`intermediateTargets.${i}.value`] = { key: "tooLong", values: { max: LIMITS.intermediateTargetValue } };
    }
  });

  // Milestones: a label each; the date is optional.
  if (values.milestones.length > MAX_MILESTONES) errors.milestones = { key: "milestoneMax", values: { max: MAX_MILESTONES } };
  values.milestones.forEach((m, i) => {
    const n = i + 1;
    const label = m.label.trim();
    if (!label) errors[`milestones.${i}.label`] = { key: "milestoneLabel", values: { n } };
    else if (label.length > LIMITS.milestoneLabel) errors[`milestones.${i}.label`] = { key: "tooLong", values: { max: LIMITS.milestoneLabel } };
    if (m.date.trim() && !isIsoDate(m.date.trim())) errors[`milestones.${i}.date`] = { key: "milestoneDate", values: { n } };
  });

  return errors;
}

/**
 * Advice that does not block saving (messages under indicatorForm.warnings):
 * a percentage should define its numerator and denominator
 * (knowledge/me-foundations.md §3). The backend does not require them.
 */
export function indicatorFormWarnings(values: IndicatorFormValues): FormErrors {
  const warnings: FormErrors = {};
  if (isPercentUnit(values.unit)) {
    if (!values.numerator.trim()) warnings.numerator = { key: "numerator" };
    if (!values.denominator.trim()) warnings.denominator = { key: "denominator" };
  }
  return warnings;
}

/** Errors that also depend on other fields: the end date errors compare it with the start. */
const RELATED_FIELDS: Record<string, readonly (keyof IndicatorFormValues)[]> = {
  endDate: ["startDate", "endDate"],
  actualEndDate: ["actualStartDate", "actualEndDate"],
};

/**
 * The errors that block saving. On create, all of them. On edit (`initial` =
 * the stored indicator's values), only those on fields the user changed:
 * problems already in the stored data are not sent (only changed fields are)
 * and must not stop the user from saving other changes.
 */
export function blockingErrors(errors: FormErrors, values: IndicatorFormValues, initial: IndicatorFormValues | null): FormErrors {
  if (!initial) return errors;
  const changed = (field: keyof IndicatorFormValues) => JSON.stringify(values[field]) !== JSON.stringify(initial[field]);
  const out: FormErrors = {};
  for (const [key, error] of Object.entries(errors)) {
    const field = key.split(".")[0] as keyof IndicatorFormValues;
    if ((RELATED_FIELDS[field] ?? [field]).some(changed)) out[key] = error;
  }
  return out;
}

/** Form sections, in display order. */
export const FORM_SECTIONS = [
  "basics",
  "definition",
  "disaggregation",
  "collection",
  "baseline",
  "standard",
  "assumptions",
  "timeline",
] as const;
export type FormSection = (typeof FORM_SECTIONS)[number];

const SECTION_OF_FIELD: Record<string, FormSection> = {
  indicatorText: "basics",
  indicatorTextAr: "basics",
  level: "basics",
  resultId: "basics",
  status: "basics",
  definition: "definition",
  unit: "definition",
  direction: "definition",
  numerator: "definition",
  denominator: "definition",
  formula: "definition",
  rounding: "definition",
  disaggregation: "disaggregation",
  dataCollectionMethod: "collection",
  frequency: "collection",
  meansOfVerification: "collection",
  responsibility: "collection",
  baselineValue: "baseline",
  baselineDate: "baseline",
  baselineMethod: "baseline",
  targetValue: "baseline",
  targetJustification: "baseline",
  intermediateTargets: "baseline",
  currentValue: "baseline",
  libraryId: "standard",
  standardReferenceCode: "standard",
  assumptions: "assumptions",
  startDate: "timeline",
  endDate: "timeline",
  actualStartDate: "timeline",
  actualEndDate: "timeline",
  milestones: "timeline",
};

/** The section holding a field id ("intermediateTargets.0.date" → "baseline"). */
export function sectionOfField(field: string): FormSection {
  return SECTION_OF_FIELD[field.split(".")[0]] ?? "basics";
}

// --------------------------------------------------------------- payloads

/** Trimmed text, or null when empty (nullable fields are cleared with null). */
const textOrNull = (value: string): string | null => {
  const v = value.trim();
  return v ? v : null;
};

/**
 * The full request body for the form (POST /api/frameworks/:id/indicators and
 * PATCH /api/indicators/:id). Empty inputs become null; empty lists become null.
 * Provenance is not included (it is read-only in the form).
 */
export function formValuesToPayload(values: IndicatorFormValues): IndicatorInput {
  const calculation: IndicatorCalculation = {};
  for (const key of ["numerator", "denominator", "formula", "rounding"] as const) {
    const v = values[key].trim();
    if (v) calculation[key] = v;
  }

  const intermediateTargets: IntermediateTarget[] = values.intermediateTargets.map((t) => ({
    date: t.date.trim(),
    value: t.value.trim(),
  }));

  const milestones: Milestone[] = values.milestones.map((m) => ({
    label: m.label.trim(),
    ...(m.date.trim() ? { date: m.date.trim() } : {}),
    completed: m.completed,
  }));

  return {
    indicatorText: values.indicatorText.trim(),
    indicatorTextAr: textOrNull(values.indicatorTextAr),
    level: values.level,
    resultId: values.resultId || null,
    status: values.status,
    definition: textOrNull(values.definition),
    unit: textOrNull(values.unit),
    direction: values.direction || null,
    calculation: Object.keys(calculation).length > 0 ? calculation : null,
    disaggregation: values.disaggregation.length > 0 ? [...values.disaggregation] : null,
    dataCollectionMethod: values.dataCollectionMethod,
    frequency: values.frequency,
    meansOfVerification: textOrNull(values.meansOfVerification),
    responsibility: textOrNull(values.responsibility),
    baselineValue: textOrNull(values.baselineValue),
    baselineDate: textOrNull(values.baselineDate),
    baselineMethod: textOrNull(values.baselineMethod),
    targetValue: textOrNull(values.targetValue),
    targetJustification: textOrNull(values.targetJustification),
    intermediateTargets: intermediateTargets.length > 0 ? intermediateTargets : null,
    currentValue: textOrNull(values.currentValue),
    libraryId: textOrNull(normaliseLibraryId(values.libraryId)),
    standardReferenceCode: textOrNull(values.standardReferenceCode),
    assumptions: textOrNull(values.assumptions),
    startDate: textOrNull(values.startDate),
    endDate: textOrNull(values.endDate),
    actualStartDate: textOrNull(values.actualStartDate),
    actualEndDate: textOrNull(values.actualEndDate),
    milestones: milestones.length > 0 ? milestones : null,
  };
}

/** The body for creating an indicator: every field plus its provenance. */
export function buildCreatePayload(values: IndicatorFormValues): IndicatorInput {
  return { ...formValuesToPayload(values), provenance: createProvenance(values) };
}

/** The fields of `after` that differ from `before` (deep comparison of values). */
export function changedFields(before: IndicatorInput, after: IndicatorInput): IndicatorInput {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(after)) {
    const previous = (before as Record<string, unknown>)[key];
    if (JSON.stringify(previous ?? null) !== JSON.stringify(value ?? null)) out[key] = value;
  }
  return out as IndicatorInput;
}

/**
 * The body for editing an indicator: only the fields the user changed. Both
 * sides go through the same conversion, so formatting differences in the
 * stored data (e.g. ISO date-times) are never sent as changes.
 */
export function buildUpdatePayload(indicator: Indicator, values: IndicatorFormValues): IndicatorInput {
  return changedFields(formValuesToPayload(indicatorToFormValues(indicator)), formValuesToPayload(values));
}

/**
 * The edits sent when a KPI suggestion is accepted from the form (design sections 8.1 and 9.5): the fields whose
 * values differ from the suggestion's draft, both sides converted the same way so formatting never counts as an
 * edit; `undefined` when nothing changed (the suggestion is then accepted as is, status `accepted`).
 */
export function acceptEdits(draft: IndicatorFormSource, values: IndicatorFormValues): IndicatorInput | undefined {
  const edits = changedFields(formValuesToPayload(inputToFormValues(draft)), formValuesToPayload(values));
  return Object.keys(edits).length > 0 ? edits : undefined;
}
