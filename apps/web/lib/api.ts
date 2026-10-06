// Browser-side client for the NOVA API. Every response is `{ data }` or `{ error }`.

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: options.method ?? "GET",
    ...(options.body === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(options.body) }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || payload.error) {
    const error = payload?.error;
    throw new ApiError(error?.code ?? "INTERNAL", error?.message ?? "Something went wrong.", error?.details);
  }
  return payload.data as T;
}

/** One line a person can read, including which fields were wrong. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.details?.length) return error.details.map((d) => `${d.path}: ${d.message}`).join(" · ");
    return error.message;
  }
  return "Something went wrong.";
}
