import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import {
  adminClanResponseSchema,
  adminFlagListQuerySchema,
  type AdminFlagPage,
  adminFlagPageSchema,
  type AdminFlagResponse,
  adminFlagResponseSchema,
  type AdminMetrics,
  adminMetricsSchema,
  adminUpdateClanSchema,
  adminUserListQuerySchema,
  type AdminUserPage,
  adminUserPageSchema,
  adminUserParamsSchema,
  type AdminUserResponse,
  adminUserResponseSchema,
  type AppSettingsResponse,
  appSettingsResponseSchema,
  type ClanResponse,
  clanParamsSchema,
  flagParamsSchema,
  redrawParamsSchema,
  resolveFlagSchema,
  setUserStatusSchema,
  type ToastOfTheWeek,
  toastOfTheWeekSchema,
  updateAppSettingsSchema,
} from '@toasthub/shared';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { AdminGuard } from '../auth/admin.guard';
import type { AuthUser } from '../auth/auth.config';
import { CurrentUser } from '../auth/auth.decorators';
import { ClansService } from '../clans/clans.service';
import { SettingsService } from '../settings/settings.service';
import { TotwService } from '../totw/totw.service';
import { AdminFlagsService } from './admin-flags.service';
import { AdminMetricsService } from './admin-metrics.service';
import { AdminUsersService } from './admin-users.service';

class AdminFlagListQueryDto extends createZodDto(adminFlagListQuerySchema) {}
class AdminFlagPageDto extends createZodDto(adminFlagPageSchema) {}
class FlagParamsDto extends createZodDto(flagParamsSchema) {}
class ResolveFlagDto extends createZodDto(resolveFlagSchema) {}
class AdminFlagResponseDto extends createZodDto(adminFlagResponseSchema) {}
class AdminUserListQueryDto extends createZodDto(adminUserListQuerySchema) {}
class AdminUserPageDto extends createZodDto(adminUserPageSchema) {}
class AdminUserParamsDto extends createZodDto(adminUserParamsSchema) {}
class SetUserStatusDto extends createZodDto(setUserStatusSchema) {}
class AdminUserResponseDto extends createZodDto(adminUserResponseSchema) {}
class ClanParamsDto extends createZodDto(clanParamsSchema) {}
class AdminUpdateClanDto extends createZodDto(adminUpdateClanSchema) {}
class AdminClanResponseDto extends createZodDto(adminClanResponseSchema) {}
class UpdateAppSettingsDto extends createZodDto(updateAppSettingsSchema) {}
class AppSettingsResponseDto extends createZodDto(appSettingsResponseSchema) {}
class AdminMetricsDto extends createZodDto(adminMetricsSchema) {}
class RedrawParamsDto extends createZodDto(redrawParamsSchema) {}
class ToastOfTheWeekDto extends createZodDto(toastOfTheWeekSchema) {}

/** SPEC §8 `/admin/*`: admins only (403 for everyone else). */
@ApiCookieAuth()
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly flags: AdminFlagsService,
    private readonly users: AdminUsersService,
    private readonly metrics: AdminMetricsService,
    private readonly clans: ClansService,
    private readonly settings: SettingsService,
    private readonly totw: TotwService,
  ) {}

  /** The flag queue, newest first, optionally of one type and status. */
  @Get('flags')
  @ZodResponse({ status: 200, type: AdminFlagPageDto })
  listFlags(@Query() query: AdminFlagListQueryDto): Promise<AdminFlagPage> {
    return this.flags.list(query);
  }

  /** Dismisses the flag, rejects its toasts or hides its photo, optionally banning the subject. */
  @Post('flags/:id/resolve')
  @HttpCode(200)
  @ZodResponse({ status: 200, type: AdminFlagResponseDto })
  resolveFlag(
    @CurrentUser() admin: AuthUser,
    @Param() params: FlagParamsDto,
    @Body() body: ResolveFlagDto,
  ): Promise<AdminFlagResponse> {
    return this.flags.resolve(admin.id, params.id, body);
  }

  /** Users newest first; `search` matches part of the email or display name. */
  @Get('users')
  @ZodResponse({ status: 200, type: AdminUserPageDto })
  listUsers(@Query() query: AdminUserListQueryDto): Promise<AdminUserPage> {
    return this.users.list(query);
  }

  /** Bans (and signs out) or unbans a user. 409 for the own account. */
  @Post('users/:id/status')
  @HttpCode(200)
  @ZodResponse({ status: 200, type: AdminUserResponseDto })
  setUserStatus(
    @CurrentUser() admin: AuthUser,
    @Param() params: AdminUserParamsDto,
    @Body() body: SetUserStatusDto,
  ): Promise<AdminUserResponse> {
    return this.users.setStatus(admin.id, params.id, body.status);
  }

  /** Renames or describes any clan, or hands it to another member. */
  @Patch('clans/:id')
  @ZodResponse({ status: 200, type: AdminClanResponseDto })
  updateClan(
    @Param() params: ClanParamsDto,
    @Body() body: AdminUpdateClanDto,
  ): Promise<ClanResponse> {
    return this.clans.adminUpdate(params.id, body);
  }

  /** Deletes any clan, its memberships and pending requests. */
  @Delete('clans/:id')
  @HttpCode(204)
  async deleteClan(@CurrentUser() admin: AuthUser, @Param() params: ClanParamsDto): Promise<void> {
    await this.clans.adminDelete(admin.id, params.id);
  }

  @Get('settings')
  @ZodResponse({ status: 200, type: AppSettingsResponseDto })
  async getSettings(): Promise<AppSettingsResponse> {
    return { settings: await this.settings.getAll() };
  }

  /** Changes the given settings and returns all of them. */
  @Patch('settings')
  @ZodResponse({ status: 200, type: AppSettingsResponseDto })
  async updateSettings(@Body() body: UpdateAppSettingsDto): Promise<AppSettingsResponse> {
    return { settings: await this.settings.set(body) };
  }

  /** Users, today's active users, toasts per day over the last 30 days and open flags. */
  @Get('metrics')
  @ZodResponse({ status: 200, type: AdminMetricsDto })
  getMetrics(): Promise<AdminMetrics> {
    return this.metrics.get();
  }

  /** Draws the week again, replacing its winner. 400 unless a Monday, 409 before the week has ended. */
  @Post('toast-of-the-week/:weekStart/redraw')
  @HttpCode(200)
  @ZodResponse({ status: 200, type: ToastOfTheWeekDto })
  redraw(
    @CurrentUser() admin: AuthUser,
    @Param() params: RedrawParamsDto,
  ): Promise<ToastOfTheWeek> {
    return this.totw.redraw(admin.id, params.weekStart);
  }
}
