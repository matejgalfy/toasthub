const UNIQUE_VIOLATION = '23505';

interface PgErrorFields {
  code?: unknown;
  constraint?: unknown;
  cause?: unknown;
}

/**
 * The name of the unique index or constraint a failed query violated, or null for any other error. Drizzle
 * wraps the driver's error, so its `cause` is checked too.
 */
export function uniqueViolation(error: unknown): string | null {
  for (let current = error, depth = 0; depth < 2; depth++) {
    if (typeof current !== 'object' || current === null) return null;
    const fields = current as PgErrorFields;
    if (fields.code === UNIQUE_VIOLATION && typeof fields.constraint === 'string') {
      return fields.constraint;
    }
    current = fields.cause;
  }
  return null;
}
