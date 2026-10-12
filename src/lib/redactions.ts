/**
 * The backend removes phone numbers, ID numbers and email addresses from typed
 * qualitative notes when they are saved, and returns how many it removed
 * (`redactions` on POST /api/projects/:id/qualitative). Older backends send
 * nothing. Pure functions only.
 */
import type { RedactionCounts } from "@/types/api";

/** Each count as a whole number of at least 0; anything else (missing, negative, not a number) counts as 0. */
function countOf(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** Everything removed, over all kinds; 0 when the response has no counts. */
export function redactionTotal(redactions: Partial<RedactionCounts> | null | undefined): number {
  if (!redactions || typeof redactions !== "object") return 0;
  return countOf(redactions.phone) + countOf(redactions.idNumber) + countOf(redactions.email);
}

/** True when the saved text differs from what was typed because personal data was removed. */
export function removedPersonalData(redactions: Partial<RedactionCounts> | null | undefined): boolean {
  return redactionTotal(redactions) > 0;
}
