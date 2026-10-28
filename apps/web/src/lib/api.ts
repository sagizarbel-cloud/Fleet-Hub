export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    /** Field problems the server found (e.g. a serial that is taken), by field path. */
    public readonly issues: { path: string; code: string }[] = [],
  ) {
    super(code);
  }
}

/** JSON fetch against our own /api with the session cookie. */
export async function api<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...rest,
    headers: {
      accept: 'application/json',
      ...(json !== undefined ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      issues?: { path: string; code: string }[];
    };
    throw new ApiError(res.status, body.error ?? 'unknown', body.issues);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
