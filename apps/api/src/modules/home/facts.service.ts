import { Inject, Injectable } from '@nestjs/common';
import { dayNumber, type Fact, type LocalDate, Locale } from '@toasthub/shared';
import { count } from 'drizzle-orm';

import { type Database, DB } from '../../db/db.module';
import { toastFact } from '../../db/schema';

@Injectable()
export class FactsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** `facts[dayNumber mod count]` in id order: the same fact for everyone all day (SPEC §4.11). */
  async forDay(date: LocalDate, locale: Locale): Promise<Fact | null> {
    const [total] = await this.db.select({ count: count() }).from(toastFact);
    if (!total?.count) return null;
    const [row] = await this.db
      .select()
      .from(toastFact)
      .orderBy(toastFact.id)
      .offset(dayNumber(date) % total.count)
      .limit(1);
    if (!row) return null;
    return { id: row.id, text: locale === Locale.sk ? row.textSk : row.textEn };
  }
}
