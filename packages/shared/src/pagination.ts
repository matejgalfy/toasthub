import { z } from 'zod';

export const PAGE_LIMIT_DEFAULT = 20;
export const PAGE_LIMIT_MAX = 50;

// `?cursor=` with no value means "first page", same as leaving it out.
const blankAsUndefined = (value: unknown): unknown => (value === '' ? undefined : value);

export const pageQuerySchema = z.object({
  cursor: z.preprocess(blankAsUndefined, z.string().max(512).optional()),
  limit: z.preprocess(
    blankAsUndefined,
    z.coerce.number().int().min(1).max(PAGE_LIMIT_MAX).default(PAGE_LIMIT_DEFAULT),
  ),
});

export type PageQuery = z.infer<typeof pageQuerySchema>;

export function pageSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
