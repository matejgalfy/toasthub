import type { IncomingHttpHeaders } from 'node:http';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence next to `SameSite=Lax` (SPEC §10): a mutation that the browser may have sent with our
 * cookie must carry a trusted `Origin`. Requests without a cookie, or with an `Authorization` header (which
 * a cross-site page can't set without a CORS preflight we'd refuse), can't ride on a victim's session, so
 * mobile and curl clients need no `Origin`.
 */
export function isOriginAllowed(
  method: string,
  headers: IncomingHttpHeaders,
  trustedOrigins: readonly string[],
): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return true;
  if (headers.cookie === undefined || headers.authorization !== undefined) return true;
  return headers.origin !== undefined && trustedOrigins.includes(headers.origin);
}
