import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import {
  type Heatmap,
  heatmapQuerySchema,
  heatmapSchema,
  pageQuerySchema,
  type UserAchievements,
  userAchievementsSchema,
  userParamsSchema,
  type UserProfileResponse,
  userProfileResponseSchema,
  type UserStats,
  userStatsSchema,
  type UserToastPage,
  userToastPageSchema,
} from '@toasthub/shared';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AuthUser } from '../auth/auth.config';
import { CurrentUser } from '../auth/auth.decorators';
import { UsersService } from './users.service';

class UserProfileResponseDto extends createZodDto(userProfileResponseSchema) {}
class UserToastPageDto extends createZodDto(userToastPageSchema) {}
class UserStatsDto extends createZodDto(userStatsSchema) {}
class HeatmapDto extends createZodDto(heatmapSchema) {}
class UserAchievementsDto extends createZodDto(userAchievementsSchema) {}
class UserParamsDto extends createZodDto(userParamsSchema) {}
class HeatmapQueryDto extends createZodDto(heatmapQuerySchema) {}
class PageQueryDto extends createZodDto(pageQuerySchema) {}

// Every profile is public (SPEC §4.2, §12 D67); unknown, banned and not onboarded users are a 404.
@ApiCookieAuth()
@ApiBearerAuth()
@Controller('users/:id')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** A user's name, avatar and leaderboard counts. */
  @Get()
  @ZodResponse({ status: 200, type: UserProfileResponseDto })
  async getProfile(@Param() params: UserParamsDto): Promise<UserProfileResponse> {
    return { profile: await this.users.getProfile(params.id) };
  }

  /** The user's toast photos, newest first, one per toast session. */
  @Get('toasts')
  @ZodResponse({ status: 200, type: UserToastPageDto })
  listToasts(
    @CurrentUser() viewer: AuthUser,
    @Param() params: UserParamsDto,
    @Query() query: PageQueryDto,
  ): Promise<UserToastPage> {
    return this.users.listToasts(viewer.id, params.id, query);
  }

  /** Totals, averages since the first toast, the best day and streaks. */
  @Get('stats')
  @ZodResponse({ status: 200, type: UserStatsDto })
  getStats(@Param() params: UserParamsDto): Promise<UserStats> {
    return this.users.getStats(params.id);
  }

  /** Toasts per day of one year (default: the current one), only days with toasts. */
  @Get('heatmap')
  @ZodResponse({ status: 200, type: HeatmapDto })
  getHeatmap(@Param() params: UserParamsDto, @Query() query: HeatmapQueryDto): Promise<Heatmap> {
    return this.users.getHeatmap(params.id, query.year);
  }

  /** Every achievement, with `earnedAt` where the user earned it. */
  @Get('achievements')
  @ZodResponse({ status: 200, type: UserAchievementsDto })
  getAchievements(@Param() params: UserParamsDto): Promise<UserAchievements> {
    return this.users.getAchievements(params.id);
  }
}
