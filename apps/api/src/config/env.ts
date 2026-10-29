import { z } from 'zod';

const httpUrl = z.url({ protocol: /^https?$/ });

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  // Signs session cookies and bearer tokens. Rotating it signs everyone out.
  BETTER_AUTH_SECRET: z.string().min(32),
  // Public URL under which clients reach `/api/v1` (magic links point here).
  BETTER_AUTH_URL: httpUrl.default('http://localhost:3000'),
  // The SPA's origin: the only CORS origin and the only trusted `Origin` on mutations.
  WEB_ORIGIN: httpUrl.transform((url) => new URL(url).origin).default('http://localhost:5173'),
  SMTP_URL: z.url({ protocol: /^smtps?$/ }).default('smtp://localhost:1025'),
  MAIL_FROM: z.string().min(3).default('Toasthub <no-reply@toasthub.local>'),
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
