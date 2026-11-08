/** Also what the web shows (as `auth.email.notAllowed`) when the API answers 403 to a sign-in request. */
export const EMAIL_NOT_ALLOWED_MESSAGE = 'Email address not allowed, try a different one.';

/**
 * BR-AUTH-6. The domain must match exactly: `muni.cz` doesn't let in `mail.muni.cz`. An empty list lets in
 * every domain (dev and tests). Expects lower-cased domains, as `parseEnv` gives them.
 */
export function isEmailDomainAllowed(email: string, allowedDomains: readonly string[]): boolean {
  if (allowedDomains.length === 0) return true;
  const domain = email
    .slice(email.lastIndexOf('@') + 1)
    .trim()
    .toLowerCase();
  return allowedDomains.includes(domain);
}
