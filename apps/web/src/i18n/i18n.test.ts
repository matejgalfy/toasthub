import { describe, expect, it } from 'vitest';

import { ACHIEVEMENTS, ErrorCode } from '@toasthub/shared';

import en from './en.json';
import { formatDateTime, formatLocalDate, formatNumber } from './format';
import { detectLocale } from './index';
import sk from './sk.json';

function keys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    keys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('translations', () => {
  it('have the same keys in sk and en', () => {
    expect(keys(sk).sort()).toEqual(keys(en).sort());
  });

  it('cover every API error code and achievement', () => {
    const all = new Set(keys(en));
    for (const code of Object.values(ErrorCode)) expect(all).toContain(`errors.${code}`);
    for (const achievement of ACHIEVEMENTS) {
      expect(all).toContain(achievement.nameKey);
      expect(all).toContain(achievement.descriptionKey);
    }
  });
});

describe('detectLocale', () => {
  it.each([
    ['en', ['sk-SK'], 'en'],
    ['sk', ['en-US'], 'sk'],
    [null, ['sk-SK', 'en'], 'sk'],
    [null, ['de-DE', 'sk'], 'sk'],
    [null, ['en-GB', 'sk'], 'en'],
    [null, ['de-DE'], 'en'],
    ['fr', [], 'en'],
  ] as const)('stored %s, browser %j → %s', (stored, languages, expected) => {
    expect(detectLocale(stored, languages)).toBe(expected);
  });
});

describe('formatting', () => {
  it('formats numbers per locale', () => {
    expect(formatNumber(1234.5, 'sk')).toBe('1 234,5');
    expect(formatNumber(1234.5, 'en')).toBe('1,234.5');
  });

  it('shows instants in Bratislava time, across DST and midnight', () => {
    const options = { dateStyle: 'short', timeStyle: 'short' } as const;
    // 31 Oct 23:30 UTC is already 1 Nov 00:30 CET.
    expect(formatDateTime('2026-10-31T23:30:00Z', 'en', options)).toBe('01/11/2026, 00:30');
    // Summer time: UTC+2.
    expect(formatDateTime('2026-07-01T10:00:00Z', 'sk', options)).toBe('1. 7. 2026 12:00');
  });

  it('keeps a local date on its day', () => {
    expect(formatLocalDate('2026-03-29', 'en')).toBe('29 Mar 2026');
    expect(formatLocalDate('2026-03-29', 'sk')).toBe('29. 3. 2026');
  });
});
