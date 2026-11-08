import { z } from 'zod';

const httpUrl = z.url({ protocol: /^https?$/ });

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // `api` serves HTTP; `worker` runs the scheduled jobs (pg-boss) and serves only the health probes (SPEC §12 D10).
  APP_ROLE: z.enum(['api', 'worker']).default('api'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // Reverse proxies in front of the api (the ingress = 1). `request.ip`, and with it the per-IP auth limit,
  // is the address that many hops back in `X-Forwarded-For`. 0 ignores the header: a client could fake it.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  // Signs session cookies and bearer tokens. Rotating it signs everyone out.
  BETTER_AUTH_SECRET: z.string().min(32),
  // Public URL under which clients reach `/api/v1` (magic links point here).
  BETTER_AUTH_URL: httpUrl.default('http://localhost:3000'),
  // The SPA's origin: the only CORS origin and the only trusted `Origin` on mutations.
  WEB_ORIGIN: httpUrl.transform((url) => new URL(url).origin).default('http://localhost:5173'),
  // BR-AUTH-6: comma-separated email domains that may sign in, matched exactly. Empty = every domain.
  ALLOWED_EMAIL_DOMAINS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((domain) => domain.trim().toLowerCase())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/, 'Not a domain'))),
  SMTP_URL: z.url({ protocol: /^smtps?$/ }).default('smtp://localhost:1025'),
  MAIL_FROM: z.string().min(3).default('Toasthub <no-reply@toasthub.local>'),
  // Photo storage: any S3-compatible API. Without an endpoint the AWS SDK uses AWS S3 in the region.
  // Browsers load photos from presigned URLs on this endpoint, so it must be reachable from them too.
  S3_ENDPOINT: httpUrl.optional(),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_BUCKET: z.string().min(3).default('toasthub-photos'),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  // MinIO serves buckets under the path (`/bucket/key`) instead of as a subdomain.
  S3_FORCE_PATH_STYLE: z.stringbool().default(false),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    // Name the variables but never echo their values: they may be secrets.
    const problems = result.error.issues.map(
      (issue) => `  ${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(`Invalid environment variables:\n${problems.join('\n')}`);
  }
  return result.data;
}
