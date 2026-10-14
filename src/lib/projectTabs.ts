/**
 * Tabs of the project page (src/pages/ProjectDetail.tsx). A link can open one directly with `?tab=<value>`, for
 * example the AI Wizard's "Open the framework" toast action (`?tab=me-framework`, Phase 4 design 9.5).
 */
export const PROJECT_TAB_VALUES = [
  "overview",
  "me-framework",
  "dashboard",
  "risks",
  "assessments",
  "reports",
  "documents",
  "qualitative",
  "export",
] as const;

export type ProjectTab = (typeof PROJECT_TAB_VALUES)[number];

/** The tab named by the `tab` search parameter, or "overview" when it is missing or unknown. */
export function projectTabFrom(requested: string | null | undefined): ProjectTab {
  return (PROJECT_TAB_VALUES as readonly string[]).includes(requested ?? "") ? (requested as ProjectTab) : "overview";
}
