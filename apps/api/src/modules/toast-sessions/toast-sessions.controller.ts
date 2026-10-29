import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiCookieAuth } from '@nestjs/swagger';
import {
  createToastSessionSchema,
  pageQuerySchema,
  PHOTO_FIELD,
  TOAST_SESSION_MAX_COUNT,
  type ToastSessionChangeResponse,
  toastSessionChangeResponseSchema,
  type ToastSessionPage,
  toastSessionPageSchema,
  toastSessionParamsSchema,
  type ToastSessionResponse,
  toastSessionResponseSchema,
  updateToastSessionSchema,
} from '@toasthub/shared';
import type { FastifyRequest } from 'fastify';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { AppError } from '../../common/errors/app-error';
import type { AuthUser } from '../auth/auth.config';
import { CurrentUser } from '../auth/auth.decorators';
import { readPhotoUpload } from '../toasts/photo-upload';
import { ToastSessionsService } from './toast-sessions.service';

class ToastSessionChangeResponseDto extends createZodDto(toastSessionChangeResponseSchema) {}
class ToastSessionResponseDto extends createZodDto(toastSessionResponseSchema) {}
class ToastSessionPageDto extends createZodDto(toastSessionPageSchema) {}
class ToastSessionParamsDto extends createZodDto(toastSessionParamsSchema) {}
class UpdateToastSessionDto extends createZodDto(updateToastSessionSchema) {}
class PageQueryDto extends createZodDto(pageQuerySchema) {}

const PHOTO_PROPERTY = { type: 'string', format: 'binary' } as const;

@ApiCookieAuth()
@ApiBearerAuth()
@Controller()
export class ToastSessionsController {
  constructor(private readonly sessions: ToastSessionsService) {}

  /**
   * Logs 1–10 toasts eaten now as one session. Send no body, or `multipart/form-data` with an optional
   * `count` (default 1) and an optional `photo` (JPEG, PNG, WebP or HEIC, at most 10 MB) for the lead
   * toast. Limited to 30 toasts per hour.
   */
  @Post('toast-sessions')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    required: false,
    schema: {
      type: 'object',
      properties: {
        count: { type: 'integer', minimum: 1, maximum: TOAST_SESSION_MAX_COUNT, default: 1 },
        [PHOTO_FIELD]: PHOTO_PROPERTY,
      },
    },
  })
  @ZodResponse({ status: 201, type: ToastSessionChangeResponseDto })
  async create(
    @CurrentUser() user: AuthUser,
    @Req() request: FastifyRequest,
  ): Promise<ToastSessionChangeResponse> {
    const { fields, photo } = await readPhotoUpload(request);
    const parsed = createToastSessionSchema.safeParse(fields);
    if (!parsed.success) throw AppError.validation(parsed.error);
    // After reading the count, before the photo is processed.
    this.sessions.consumeQuota(user.id, parsed.data.count);
    return this.sessions.create(user.id, parsed.data.count, photo);
  }

  /** The caller's own toast sessions, newest first, with their photos. */
  @Get('me/toast-sessions')
  @ZodResponse({ status: 200, type: ToastSessionPageDto })
  list(@CurrentUser() user: AuthUser, @Query() query: PageQueryDto): Promise<ToastSessionPage> {
    return this.sessions.list(user.id, query);
  }

  /**
   * Sets the number of toasts of today's session. Raising adds toasts eaten now; lowering removes the
   * newest, never the first. 409 after the session's day.
   */
  @Patch('toast-sessions/:id')
  @ZodResponse({ status: 200, type: ToastSessionChangeResponseDto })
  updateCount(
    @CurrentUser() user: AuthUser,
    @Param() params: ToastSessionParamsDto,
    @Body() body: UpdateToastSessionDto,
  ): Promise<ToastSessionChangeResponse> {
    return this.sessions.updateCount(user.id, params.id, body.count);
  }

  /**
   * Adds or replaces the photo of today's session (`multipart/form-data` with a `photo`). 409 after the
   * session's day or when an admin hid its photo. Counts as one toast toward the hourly limit.
   */
  @Put('toast-sessions/:id/photo')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: [PHOTO_FIELD],
      properties: { [PHOTO_FIELD]: PHOTO_PROPERTY },
    },
  })
  @ZodResponse({ status: 200, type: ToastSessionChangeResponseDto })
  async setPhoto(
    @CurrentUser() user: AuthUser,
    @Param() params: ToastSessionParamsDto,
    @Req() request: FastifyRequest,
  ): Promise<ToastSessionChangeResponse> {
    await this.sessions.assertCanSetPhoto(user.id, params.id);
    this.sessions.consumeQuota(user.id, 1);
    const { photo } = await readPhotoUpload(request);
    if (!photo) {
      throw new AppError('VALIDATION_ERROR', 'A photo is required', { [PHOTO_FIELD]: 'Required' });
    }
    return this.sessions.setPhoto(user.id, params.id, photo);
  }

  /** Removes the photo of today's session. 409 after the session's day. */
  @Delete('toast-sessions/:id/photo')
  @ZodResponse({ status: 200, type: ToastSessionResponseDto })
  removePhoto(
    @CurrentUser() user: AuthUser,
    @Param() params: ToastSessionParamsDto,
  ): Promise<ToastSessionResponse> {
    return this.sessions.removePhoto(user.id, params.id);
  }

  /** Deletes today's session with its toasts (soft delete); likes on them are removed. */
  @Delete('toast-sessions/:id')
  @HttpCode(204)
  async delete(
    @CurrentUser() user: AuthUser,
    @Param() params: ToastSessionParamsDto,
  ): Promise<void> {
    await this.sessions.delete(user.id, params.id);
  }
}
