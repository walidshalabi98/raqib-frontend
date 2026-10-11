import type {
  ClientProvenance,
  CollectionMethod,
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

/** The form values for an existing indicator. */
export function indicatorToFormValues(ind: Indicator): IndicatorFormValues {
  const calc: IndicatorCalculation = ind.calculation ?? {};
  return emptyIndicatorForm({
    indicatorText: str(ind.indicatorText),
    indicatorTextAr: str(ind.indicatorTextAr),
    level: ind.level ?? "output",
    resultId: str(ind.resultId),
    status: ind.status ?? "not_started",
    definition: str(ind.definition),
    unit: str(ind.unit),
    direction: ind.direction ?? "",
    numerator: str(calc.numerator),
    denominator: str(calc.denominator),
    formula: str(calc.formula),
    rounding: str(calc.rounding),
    disaggregation: Array.isArray(ind.disaggregation) ? ind.disaggregation.filter((k) => typeof k === "string") : [],
    dataCollectionMethod: ind.dataCollectionMethod ?? "hh_survey",
    frequency: ind.frequency ?? "quarterly",
    meansOfVerification: str(ind.meansOfVerification),
    responsibility: str(ind.responsibility),
    baselineValue: str(ind.baselineValue),
    baselineDate: toDateInput(ind.baselineDate),
    baselineMethod: str(ind.baselineMethod),
    targetValue: str(ind.targetValue),
    targetJustification: str(ind.targetJustification),
    intermediateTargets: Array.isArray(ind.intermediateTargets)
      ? ind.intermediateTargets.map((t) => ({ date: toDateInput(t.date), value: str(t.value) }))
      : [],
    currentValue: str(ind.currentValue),
    libraryId: str(ind.libraryId),
    standardReferenceCode: str(ind.standardReferenceCode),
    assumptions: str(ind.assumptions),
    startDate: toDateInput(ind.startDate),
    endDate: toDateInput(ind.endDate),
    actualStartDate: toDateInput(ind.actualStartDate),
    actualEndDate: toDateInput(ind.actualEndDate),
    milestones: Array.isArray(ind.milestones)
      ? ind.milestones.map((m) => ({ label: str(m.label), date: toDateInput(m.date), completed: Boolean(m.completed) }))
      : [],
  });
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
 * The "AI suggested — review before approval" label stays on AI-made
 * indicators until an org admin approves them (CLAUDE.md rule 5).
 */
export function needsAiReviewLabel(provenance: IndicatorProvenance | null | undefined, isApproved: boolean | null | undefined): boolean {
  return isAiProvenance(provenance) && !isApproved;
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
 * An empty object means the form can be saved.
 */
export function validateIndicatorForm(values: IndicatorFormValues): FormErrors {
  const errors: FormErrors = {};

  if (!values.indicatorText.trim()) errors.indicatorText = { key: "indicatorTextRequired" };

  for (const field of TEXT_FIELDS) {
    if (!errors[field] && values[field].trim().length > LIMITS[field]) {
      errors[field] = { key: "tooLong", values: { max: LIMITS[field] } };
    }
  }

  if (isPercentUnit(values.unit)) {
    if (!values.numerator.trim()) errors.numerator = { key: "numeratorRequired" };
    if (!values.denominator.trim()) errors.denominator = { key: "denominatorRequired" };
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
    libraryId: textOrNull(values.libraryId),
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
