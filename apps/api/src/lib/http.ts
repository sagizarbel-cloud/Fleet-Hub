import type { z } from 'zod';

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

/** A zod issue's code; our own checks (`custom`) carry theirs in the message, e.g. `vin`. */
export const issueCode = (i: z.core.$ZodIssue) => (i.code === 'custom' ? i.message : i.code);

/** Validates input with a shared zod schema; a failure becomes a 400 with the issues. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const err = new HttpError(400, 'validation_failed');
    (err as HttpError & { issues: unknown }).issues = result.error.issues.map((i) => ({
      path: i.path.join('.'),
      code: issueCode(i),
    }));
    throw err;
  }
  return result.data;
}
