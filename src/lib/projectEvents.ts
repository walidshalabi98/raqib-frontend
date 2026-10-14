/**
 * Tells the open screens that the server refused a change because a project is archived (409
 * `project_archived`): someone archived it in another tab or browser while this one still showed it as
 * active. The project page listens and fetches the project again, so it shows the archived banner and
 * the read-only view. Kept outside src/services/api.ts so tests that mock the API client keep these real.
 */

type ArchivedRefusalListener = () => void;

const listeners = new Set<ArchivedRefusalListener>();

/** Calls `listener` after every refusal; returns the function that stops it. */
export function onProjectArchivedRefusal(listener: ArchivedRefusalListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitProjectArchivedRefusal(): void {
  for (const listener of [...listeners]) listener();
}
