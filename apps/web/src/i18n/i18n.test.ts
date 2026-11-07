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

// i18next plural keys end in the CLDR category, and Slovak has more categories than English.
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

/** Each key once, with plural forms folded into their base key. */
function baseKeys(value: unknown): string[] {
  return [...new Set(keys(value).map((key) => key.replace(PLURAL_SUFFIX, '')))].sort();
}

function entries(value: unknown, prefix = ''): [string, string][] {
  if (typeof value === 'string') return [[prefix, value]];
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) =>
    entries(child, prefix ? `${prefix}.${key}` : key),
  );
}

/** Base key → the sorted interpolation variables used in any of its forms. */
function placeholders(value: unknown): Record<string, string[]> {
  const found: Record<string, Set<string>> = {};
  for (const [key, text] of entries(value)) {
    const names = (found[key.replace(PLURAL_SUFFIX, '')] ??= new Set());
    for (const match of text.matchAll(/\{\{\s*([\w.]+)[^}]*\}\}/g)) names.add(match[1] ?? '');
  }
  return Object.fromEntries(
    Object.entries(found).map(([key, names]) => [key, [...names].sort()] as const),
  );
}

describe('translations', () => {
  it('have the same keys in sk and en', () => {
    expect(baseKeys(sk)).toEqual(baseKeys(en));
  });

  it.each([
    ['sk', sk],
    ['en', en],
  ] as const)('have every plural form %s needs', (locale, messages) => {
    const all = keys(messages);
    const plurals = new Set(
      all.filter((key) => PLURAL_SUFFIX.test(key)).map((key) => key.replace(PLURAL_SUFFIX, '')),
    );
    const categories = new Intl.PluralRules(locale).resolvedOptions().pluralCategories;
    for (const base of plurals) {
      for (const category of categories) expect(all).toContain(`${base}_${category}`);
    }
  });

  it.each([
    ['sk', sk],
    ['en', en],
  ] as const)('have no empty %s strings', (_locale, messages) => {
    expect(entries(messages).filter(([, text]) => text.trim() === '')).toEqual([]);
  });

  it('use the same {{placeholders}} in sk and en', () => {
    // Per base key, so a plural form may leave out `{{count}}` ("One toast") as long as another has it.
    expect(placeholders(sk)).toEqual(placeholders(en));
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
