/**
 * An error from the Raqib API with the HTTP status of the response
 * (undefined when no response arrived, e.g. offline). Kept outside
 * src/services/api.ts so screens can read the status without importing the client.
 */
export class ApiError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** The HTTP status of a failed API call, or undefined when it is unknown. */
export function httpStatusOf(err: unknown): number | undefined {
  if (err instanceof ApiError) return err.status;
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : undefined;
}
