/** TanStack Query keys shared by the project screens, so mutations invalidate precisely. */
export const queryKeys = {
  /** Every project list (the prefix of projectList): invalidate it after a project is created, archived, restored or deleted. */
  projects: ["projects"] as const,
  /** GET /api/projects: the active projects, or the archived ones (`archived`). */
  projectList: (archived = false) => ["projects", archived ? "archived" : "active"] as const,
  orgOverview: ["org-overview"] as const,
  /** GET /api/projects/:id (the project page; archived projects too, read-only). */
  project: (projectId: string) => ["project", projectId] as const,
  framework: (projectId: string) => ["framework", projectId] as const,
  dashboard: (projectId: string) => ["dashboard", projectId] as const,
  frameworkResults: (frameworkId: string) => ["framework-results", frameworkId] as const,
  documents: (projectId: string) => ["documents", projectId] as const,
  /** The project's reports (the project Reports tab and the Reports page share it). */
  reports: (projectId: string) => ["reports", projectId] as const,
  /** One report with its narrative (the reading view). */
  report: (reportId: string) => ["report", reportId] as const,
  beneficiaryStats: (projectId: string) => ["beneficiary-stats", projectId] as const,
  libraryEntry: (id: string) => ["indicator-library", "entry", id] as const,
  /** The organisation's members (Settings → Team members). */
  users: ["users"] as const,
  /** GET /api/notifications: the bell in the top bar and the dashboard's activity feed share it. */
  notifications: ["notifications"] as const,
  // KPI Assistant (Phase 4)
  kpiAssistantStatus: ["kpi-assistant-status"] as const,
  kpiSuggestions: (projectId: string) => ["kpi-suggestions", projectId] as const,
  kpiSuggestionRun: (runId: string) => ["kpi-suggestion-run", runId] as const,
  indicatorQuality: (frameworkId: string) => ["indicator-quality", frameworkId] as const,
};
