/**
 * The AI state of an assessment, read from GET /api/projects/:id/assessments.
 * The backend runs the AI report after "requested" (scoping, then analysis) and
 * sets "delivered" when it is stored. When the AI step fails it puts the
 * assessment back in "analysis" with a safe message in scopeDescription that
 * starts with AI_FAILURE_PREFIX (raqib-backend assessmentGenerator.ts).
 * Pure functions only.
 */

export const AI_FAILURE_PREFIX = "AI generation failed";

/** The fields these helpers read. */
export interface AssessmentState {
  status: string;
  scopeDescription?: string | null;
  requestedAt?: string | null;
}

/** Statuses in which the AI report is being generated. */
const AI_RUNNING_STATUSES: ReadonlySet<string> = new Set(["requested", "scoping", "analysis"]);

/** Statuses shown as "in progress" on the pipeline (the AI steps and the stages staff move through). */
const IN_PROGRESS_STATUSES: ReadonlySet<string> = new Set(["scoping", "in_field", "data_cleaning", "analysis", "reporting"]);

/**
 * How long after the request the list keeps refreshing for an AI report (the AI
 * call itself times out after 5 minutes; a restart can leave an assessment in
 * "scoping" or "analysis" without a message).
 */
export const ASSESSMENT_WAIT_MS = 15 * 60_000;

/**
 * The failure message without its prefix, e.g. "The AI model declined the request.
 * Try again or write the assessment manually.", or null when the AI step did not fail.
 */
export function assessmentFailure(assessment: AssessmentState): string | null {
  if (assessment.status !== "analysis") return null;
  const text = (assessment.scopeDescription ?? "").trim();
  if (!text.startsWith(AI_FAILURE_PREFIX)) return null;
  const rest = text.slice(AI_FAILURE_PREFIX.length).replace(/^[\s:.,-]+/, "");
  return rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : "";
}

/** True while the assessment is in progress and has not failed (the "AI Generating" badge). */
export function isAssessmentInProgress(assessment: AssessmentState): boolean {
  return IN_PROGRESS_STATUSES.has(assessment.status) && assessmentFailure(assessment) === null;
}

/**
 * True while the list should refresh on its own: an AI report is being generated,
 * has not failed, and was requested less than ASSESSMENT_WAIT_MS ago. `now` is a
 * timestamp in ms.
 */
export function assessmentsNeedRefresh(assessments: readonly AssessmentState[], now: number): boolean {
  return assessments.some((assessment) => {
    if (!AI_RUNNING_STATUSES.has(assessment.status) || assessmentFailure(assessment) !== null) return false;
    const requested = Date.parse(assessment.requestedAt ?? "");
    return !Number.isNaN(requested) && now - requested < ASSESSMENT_WAIT_MS;
  });
}
