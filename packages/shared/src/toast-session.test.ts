import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  createToastSessionSchema,
  TOAST_SESSION_DESCRIPTION_MAX_LENGTH,
  toastSessionDescriptionSchema,
  toastSessionSchema,
  updateToastSessionSchema,
} from './toast-session.js';

describe('createToastSessionSchema', () => {
  it('defaults to one toast', () => {
    expect(createToastSessionSchema.parse({})).toEqual({ count: 1, description: null });
  });

  it('reads the count from a multipart text field', () => {
    expect(createToastSessionSchema.parse({ count: '10' })).toEqual({
      count: 10,
      description: null,
    });
  });

  it('normalizes descriptions on creation', () => {
    expect(createToastSessionSchema.parse({ description: '  Breakfast  ' })).toEqual({
      count: 1,
      description: 'Breakfast',
    });
    expect(createToastSessionSchema.parse({ description: ' \n ' })).toEqual({
      count: 1,
      description: null,
    });
    expect(createToastSessionSchema.safeParse({ description: 'a'.repeat(501) }).success).toBe(
      false,
    );
  });

  it.each(['0', '11', '2.5', 'two', ''])('rejects count=%j', (count) => {
    expect(createToastSessionSchema.safeParse({ count }).success).toBe(false);
  });
});

describe('toastSessionDescriptionSchema', () => {
  it('trims plain text without interpreting markup and turns blank text into null', () => {
    expect(toastSessionDescriptionSchema.parse('  <b>Toast</b>\n  ')).toBe('<b>Toast</b>');
    expect(toastSessionDescriptionSchema.parse(' \n\t ')).toBeNull();
    expect(toastSessionDescriptionSchema.parse(null)).toBeNull();
  });

  it('limits the trimmed description to 500 characters', () => {
    const description = 'a'.repeat(TOAST_SESSION_DESCRIPTION_MAX_LENGTH);
    expect(toastSessionDescriptionSchema.parse(`  ${description}  `)).toBe(description);
    expect(toastSessionDescriptionSchema.safeParse(`${description}a`).success).toBe(false);
    expect(toastSessionDescriptionSchema.safeParse(123).success).toBe(false);
  });
});

describe('session description JSON Schema', () => {
  it('represents response and request descriptions as nullable strings limited to 500 characters', () => {
    for (const schema of [
      z.toJSONSchema(toastSessionSchema),
      z.toJSONSchema(updateToastSessionSchema, { io: 'input' }),
    ]) {
      expect(schema.properties?.description).toMatchObject({
        anyOf: [
          { type: 'string', maxLength: TOAST_SESSION_DESCRIPTION_MAX_LENGTH },
          { type: 'null' },
        ],
      });
    }
    expect(z.toJSONSchema(toastSessionSchema).required).toContain('description');
  });
});

describe('updateToastSessionSchema', () => {
  it('takes a JSON number from 1 to 10', () => {
    expect(updateToastSessionSchema.parse({ count: 3 })).toEqual({ count: 3 });
    expect(updateToastSessionSchema.safeParse({ count: '3' }).success).toBe(false);
    expect(updateToastSessionSchema.safeParse({ count: 0 }).success).toBe(false);
    expect(updateToastSessionSchema.safeParse({}).success).toBe(false);
  });

  it('accepts description alone or together with count, preserving omitted fields', () => {
    expect(updateToastSessionSchema.parse({ description: '  Breakfast  ' })).toEqual({
      description: 'Breakfast',
    });
    expect(updateToastSessionSchema.parse({ count: 2, description: 'Toast' })).toEqual({
      count: 2,
      description: 'Toast',
    });
    expect(updateToastSessionSchema.parse({ description: null })).toEqual({ description: null });
    expect(updateToastSessionSchema.parse({ description: ' \n ' })).toEqual({ description: null });
    expect(updateToastSessionSchema.safeParse({ other: true }).success).toBe(false);
    expect(updateToastSessionSchema.safeParse({ description: 'a'.repeat(501) }).success).toBe(
      false,
    );
  });
});
