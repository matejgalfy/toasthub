import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import { type FeedPage, feedPageSchema, pageQuerySchema } from '@toasthub/shared';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AuthUser } from '../auth/auth.config';
import { CurrentUser } from '../auth/auth.decorators';
import { FeedService } from './feed.service';

export class FeedPageDto extends createZodDto(feedPageSchema) {}
class PageQueryDto extends createZodDto(pageQuerySchema) {}

@ApiCookieAuth()
@ApiBearerAuth()
@Controller('feed')
export class FeedController {
  constructor(private readonly feed: FeedService) {}

  /** Every user's toast sessions, newest first (the global feed on home). */
  @Get()
  @ZodResponse({ status: 200, type: FeedPageDto })
  list(@CurrentUser() user: AuthUser, @Query() query: PageQueryDto): Promise<FeedPage> {
    return this.feed.list(user.id, query);
  }
}
