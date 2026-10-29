import { describe, expect, it } from 'vitest';

import { isOriginAllowed } from './origin-check';

const trusted = ['http://localhost:5173'];
const cookie = 'toasthub.session_token=abc';

describe('isOriginAllowed', () => {
  it.each(['GET', 'HEAD', 'OPTIONS', 'get'])('allows safe method %s from anywhere', (method) => {
    expect(isOriginAllowed(method, { cookie, origin: 'https://evil.example' }, trusted)).toBe(true);
  });

  it.each(['POST', 'PATCH', 'PUT', 'DELETE'])('checks %s with a cookie', (method) => {
    expect(isOriginAllowed(method, { cookie, origin: 'http://localhost:5173' }, trusted)).toBe(
      true,
    );
    expect(isOriginAllowed(method, { cookie, origin: 'https://evil.example' }, trusted)).toBe(
      false,
    );
    expect(isOriginAllowed(method, { cookie }, trusted)).toBe(false);
  });

  it('allows cookie-less mutations without an Origin (curl, mobile)', () => {
    expect(isOriginAllowed('POST', {}, trusted)).toBe(true);
  });

  it('allows bearer mutations without an Origin', () => {
    expect(isOriginAllowed('PATCH', { cookie, authorization: 'Bearer t' }, trusted)).toBe(true);
  });

  it('matches the origin exactly', () => {
    expect(isOriginAllowed('POST', { cookie, origin: 'http://localhost:51730' }, trusted)).toBe(
      false,
    );
  });
});
