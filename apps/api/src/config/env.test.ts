import { describe, expect, it } from 'vitest';

import { parseEnv } from './env';

const DATABASE_URL = 'postgres://toasthub:secret@localhost:5432/toasthub';
const BETTER_AUTH_SECRET = 'a-test-secret-that-is-long-enough-123';
const S3_ACCESS_KEY_ID = 'toasthub';
const S3_SECRET_ACCESS_KEY = 'toasthub-secret';
const required = { DATABASE_URL, BETTER_AUTH_SECRET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY };

describe('parseEnv', () => {
  it('applies defaults', () => {
    expect(parseEnv(required)).toEqual({
      NODE_ENV: 'development',
      APP_ROLE: 'api',
      HOST: '0.0.0.0',
      PORT: 3000,
      LOG_LEVEL: 'info',
      DATABASE_URL,
      BETTER_AUTH_SECRET,
      BETTER_AUTH_URL: 'http://localhost:3000',
      WEB_ORIGIN: 'http://localhost:5173',
      SMTP_URL: 'smtp://localhost:1025',
      MAIL_FROM: 'Toasthub <no-reply@toasthub.local>',
      S3_REGION: 'us-east-1',
      S3_BUCKET: 'toasthub-photos',
      S3_ACCESS_KEY_ID,
      S3_SECRET_ACCESS_KEY,
      S3_FORCE_PATH_STYLE: false,
    });
  });

  it('coerces the port', () => {
    expect(parseEnv({ ...required, PORT: '8080' }).PORT).toBe(8080);
  });

  it('reduces the web origin to scheme, host and port', () => {
    expect(parseEnv({ ...required, WEB_ORIGIN: 'https://toasthub.sk/' }).WEB_ORIGIN).toBe(
      'https://toasthub.sk',
    );
  });

  it('names every invalid variable', () => {
    expect(() => parseEnv({ ...required, PORT: 'nope', NODE_ENV: 'staging' })).toThrow(
      /PORT[\s\S]*NODE_ENV|NODE_ENV[\s\S]*PORT/,
    );
    expect(() => parseEnv({})).toThrow(/DATABASE_URL[\s\S]*BETTER_AUTH_SECRET/);
  });

  it('parses the S3 path-style flag', () => {
    expect(parseEnv({ ...required, S3_FORCE_PATH_STYLE: 'true' }).S3_FORCE_PATH_STYLE).toBe(true);
    expect(() => parseEnv({ ...required, S3_FORCE_PATH_STYLE: 'yes please' })).toThrow(
      /S3_FORCE_PATH_STYLE/,
    );
  });

  it('rejects a short auth secret', () => {
    expect(() => parseEnv({ ...required, BETTER_AUTH_SECRET: 'short' })).toThrow(
      /BETTER_AUTH_SECRET/,
    );
  });

  it('rejects a non-Postgres database URL without echoing it', () => {
    const url = 'mysql://root:hunter2@localhost/db';
    expect(() => parseEnv({ ...required, DATABASE_URL: url })).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ ...required, DATABASE_URL: url })).not.toThrow(/hunter2/);
  });
});
