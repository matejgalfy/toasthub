import { describe, expect, it } from 'vitest';

import { parseEnv } from './env';

const DATABASE_URL = 'postgres://toasthub:secret@localhost:5432/toasthub';

describe('parseEnv', () => {
  it('applies defaults', () => {
    expect(parseEnv({ DATABASE_URL })).toEqual({
      NODE_ENV: 'development',
      HOST: '0.0.0.0',
      PORT: 3000,
      LOG_LEVEL: 'info',
      DATABASE_URL,
    });
  });

  it('coerces the port', () => {
    expect(parseEnv({ DATABASE_URL, PORT: '8080' }).PORT).toBe(8080);
  });

  it('names every invalid variable', () => {
    expect(() => parseEnv({ PORT: 'nope', NODE_ENV: 'staging' })).toThrow(
      /PORT[\s\S]*NODE_ENV|NODE_ENV[\s\S]*PORT/,
    );
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
  });

  it('rejects a non-Postgres database URL without echoing it', () => {
    const url = 'mysql://root:hunter2@localhost/db';
    expect(() => parseEnv({ DATABASE_URL: url })).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ DATABASE_URL: url })).not.toThrow(/hunter2/);
  });
});
