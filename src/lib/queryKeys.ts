/** TanStack Query keys shared by the project screens, so mutations invalidate precisely. */
export const queryKeys = {
  projects: ["projects"] as const,
  orgOverview: ["org-overview"] as const,
  project: (projectId: string) => ["project", projectId] as const,
  framework: (projectId: string) => ["framework", projectId] as const,
  dashboard: (projectId: string) => ["dashboard", projectId] as const,
  frameworkResults: (frameworkId: string) => ["framework-results", frameworkId] as const,
  documents: (projectId: string) => ["documents", projectId] as const,
  libraryEntry: (id: string) => ["indicator-library", "entry", id] as const,
};
