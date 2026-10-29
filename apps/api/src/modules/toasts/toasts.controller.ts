import { Body, Controller, Delete, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import { reportToastSchema, toastParamsSchema } from '@toasthub/shared';
import { createZodDto } from 'nestjs-zod';

import type { AuthUser } from '../auth/auth.config';
import { CurrentUser } from '../auth/auth.decorators';
import { ToastsService } from './toasts.service';

class ToastParamsDto extends createZodDto(toastParamsSchema) {}
class ReportToastDto extends createZodDto(reportToastSchema) {}

// `:id` is a toast session's lead toast: the `toastId` of a feed item, the `id` of a profile photo.
@ApiCookieAuth()
@ApiBearerAuth()
@Controller('toasts/:id')
export class ToastsController {
  constructor(private readonly toasts: ToastsService) {}

  /** Likes the toast session with 🍞; idempotent. Only on a session the caller can see. */
  @Post('like')
  @HttpCode(204)
  async like(@CurrentUser() user: AuthUser, @Param() params: ToastParamsDto): Promise<void> {
    await this.toasts.like(user.id, params.id);
  }

  /** Takes the caller's like back; idempotent. */
  @Delete('like')
  @HttpCode(204)
  async unlike(@CurrentUser() user: AuthUser, @Param() params: ToastParamsDto): Promise<void> {
    await this.toasts.unlike(user.id, params.id);
  }

  /** Reports the photo to the admins. 409 without a visible photo; rate limited. */
  @Post('report')
  @HttpCode(202)
  async report(
    @CurrentUser() user: AuthUser,
    @Param() params: ToastParamsDto,
    @Body() body: ReportToastDto,
  ): Promise<void> {
    await this.toasts.report(user.id, params.id, body.reason);
  }
}
