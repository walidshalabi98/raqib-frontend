import type { IndicatorLevel, ResultNode, ResultNodeInput } from "@/types/api";
import { allowedLevelsUnder, childLevelOf, hasChildResults, parentCandidates } from "@/lib/resultsHierarchy";
import type { FormErrors } from "@/lib/indicatorForm";
import { parseNonNegative } from "@/lib/numbers";

/**
 * State, validation and payloads of the results-chain node form. Mirrors the
 * backend rules (raqib-backend src/routes/results.ts): code and text required,
 * codes unique per framework (case-insensitive), parent exactly one level
 * above. Pure functions only.
 */

export const RESULT_LIMITS = { code: 50, text: 2000, textAr: 2000, sortOrder: 1_000_000 } as const;

/** The sort order as a whole number from 0 to RESULT_LIMITS.sortOrder (Arabic digits accepted), or null. */
export const parseSortOrder = (text: string) => parseNonNegative(text, { max: RESULT_LIMITS.sortOrder, integer: true });

export interface ResultFormValues {
  level: IndicatorLevel;
  /** "" = no parent (top of the chain). */
  parentId: string;
  code: string;
  text: string;
  textAr: string;
  /** "" = let the server place it after its siblings. */
  sortOrder: string;
}

/**
 * Form values for a new result. Under `parent` the level is the one below it;
 * at the top of the chain it is `topLevel`.
 */
export function newResultValues(parent?: ResultNode | null, topLevel: IndicatorLevel = "impact"): ResultFormValues {
  const level = parent ? childLevelOf(parent.level) : null;
  return {
    level: level ?? (parent ? "activity" : topLevel),
    parentId: parent && level ? parent.id : "",
    code: "",
    text: "",
    textAr: "",
    sortOrder: "",
  };
}

export function resultToValues(node: ResultNode): ResultFormValues {
  return {
    level: node.level,
    parentId: node.parentId ?? "",
    code: node.code,
    text: node.text,
    textAr: node.textAr ?? "",
    sortOrder: String(node.sortOrder ?? 0),
  };
}

/** The level of the selected parent, or null without a parent. */
export function parentLevel(values: Pick<ResultFormValues, "parentId">, nodes: readonly ResultNode[]): IndicatorLevel | null {
  return nodes.find((n) => n.id === values.parentId)?.level ?? null;
}

/** True when the edited result has child results, so its level cannot change. */
export function isLevelLocked(editing: ResultNode | null | undefined, nodes: readonly ResultNode[]): boolean {
  return Boolean(editing && hasChildResults(editing, nodes));
}

/** Select options for the form: allowed levels under the chosen parent, and possible parents. */
export function resultFormOptions(values: ResultFormValues, nodes: readonly ResultNode[], editing?: ResultNode | null) {
  const locked = isLevelLocked(editing, nodes);
  const levels = locked ? [values.level] : allowedLevelsUnder(parentLevel(values, nodes));
  const parents = parentCandidates(nodes, { excludeId: editing?.id, forLevel: locked ? values.level : undefined });
  return { levels, parents, levelLocked: locked };
}

/**
 * New values after choosing a parent: under a parent the level is the one
 * below it; without a parent the level stays as it was.
 */
export function withParent(values: ResultFormValues, parentId: string, nodes: readonly ResultNode[]): ResultFormValues {
  const parent = nodes.find((n) => n.id === parentId);
  const level = parent ? childLevelOf(parent.level) : null;
  return { ...values, parentId: parent ? parent.id : "", level: level ?? values.level };
}

/** Every problem in the form, keyed by field (messages under results.form.errors). */
export function validateResultForm(
  values: ResultFormValues,
  nodes: readonly ResultNode[],
  editing?: ResultNode | null,
): FormErrors {
  const errors: FormErrors = {};
  const code = values.code.trim();
  if (!code) errors.code = { key: "code" };
  else if (code.length > RESULT_LIMITS.code) errors.code = { key: "tooLong", values: { max: RESULT_LIMITS.code } };
  else if (nodes.some((n) => n.id !== editing?.id && n.code.trim().toLowerCase() === code.toLowerCase())) {
    errors.code = { key: "codeTaken", values: { code } };
  }

  const text = values.text.trim();
  if (!text) errors.text = { key: "text" };
  else if (text.length > RESULT_LIMITS.text) errors.text = { key: "tooLong", values: { max: RESULT_LIMITS.text } };
  if (values.textAr.trim().length > RESULT_LIMITS.textAr) errors.textAr = { key: "tooLong", values: { max: RESULT_LIMITS.textAr } };

  const order = values.sortOrder.trim();
  if (order && parseSortOrder(order) === null) errors.sortOrder = { key: "sortOrder" };

  const { levels, parents } = resultFormOptions(values, nodes, editing);
  if (values.parentId && !parents.some((p) => p.id === values.parentId)) errors.parentId = { key: "level" };
  else if (!levels.includes(values.level)) errors.level = { key: "level" };

  return errors;
}

/** Body of POST /api/frameworks/:id/results. */
export function resultCreatePayload(values: ResultFormValues): ResultNodeInput {
  const order = parseSortOrder(values.sortOrder);
  return {
    level: values.level,
    code: values.code.trim(),
    text: values.text.trim(),
    textAr: values.textAr.trim() || null,
    parentId: values.parentId || null,
    ...(order !== null ? { sortOrder: order } : {}),
  };
}

/** Body of PATCH /api/results/:id: only the changed fields. */
export function resultUpdatePayload(node: ResultNode, values: ResultFormValues): Partial<ResultNodeInput> {
  const before = resultCreatePayload(resultToValues(node));
  const after = resultCreatePayload(values);
  const out: Partial<ResultNodeInput> = {};
  for (const key of Object.keys(after) as Array<keyof ResultNodeInput>) {
    if ((before[key] ?? null) !== (after[key] ?? null)) (out as Record<string, unknown>)[key] = after[key];
  }
  return out;
}
