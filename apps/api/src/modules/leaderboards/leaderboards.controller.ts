import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import {
  type ClanLeaderboard,
  clanLeaderboardQuerySchema,
  clanLeaderboardSchema,
  type ClanMemberLeaderboard,
  clanMemberLeaderboardSchema,
  clanParamsSchema,
  type UserLeaderboard,
  userLeaderboardQuerySchema,
  userLeaderboardSchema,
} from '@toasthub/shared';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AuthUser } from '../auth/auth.config';
import { CurrentUser } from '../auth/auth.decorators';
import { LeaderboardsService } from './leaderboards.service';

class UserLeaderboardDto extends createZodDto(userLeaderboardSchema) {}
class ClanLeaderboardDto extends createZodDto(clanLeaderboardSchema) {}
class ClanMemberLeaderboardDto extends createZodDto(clanMemberLeaderboardSchema) {}
class UserLeaderboardQueryDto extends createZodDto(userLeaderboardQuerySchema) {}
class ClanLeaderboardQueryDto extends createZodDto(clanLeaderboardQuerySchema) {}
class ClanParamsDto extends createZodDto(clanParamsSchema) {}

@ApiCookieAuth()
@ApiBearerAuth()
@Controller()
export class LeaderboardsController {
  constructor(private readonly leaderboards: LeaderboardsService) {}

  /** Users by countable toasts in this week (default), month or year; `me` is the caller's row. */
  @Get('leaderboards/users')
  @ZodResponse({ status: 200, type: UserLeaderboardDto })
  users(
    @CurrentUser() viewer: AuthUser,
    @Query() query: UserLeaderboardQueryDto,
  ): Promise<UserLeaderboard> {
    return this.leaderboards.users(viewer.id, query.period);
  }

  /** Clans by toasts credited to them, this month by default; `myClan` is the caller's clan. */
  @Get('leaderboards/clans')
  @ZodResponse({ status: 200, type: ClanLeaderboardDto })
  clans(
    @CurrentUser() viewer: AuthUser,
    @Query() query: ClanLeaderboardQueryDto,
  ): Promise<ClanLeaderboard> {
    return this.leaderboards.clans(viewer.id, query.period);
  }

  /** The clan's current members by toasts logged for it, this month by default. */
  @Get('clans/:id/leaderboard')
  @ZodResponse({ status: 200, type: ClanMemberLeaderboardDto })
  clanMembers(
    @Param() params: ClanParamsDto,
    @Query() query: ClanLeaderboardQueryDto,
  ): Promise<ClanMemberLeaderboard> {
    return this.leaderboards.clanMembers(params.id, query.period);
  }
}
