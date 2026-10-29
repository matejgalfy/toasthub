import { Controller, Delete, HttpCode, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiCookieAuth } from '@nestjs/swagger';
import {
  type CreateToastResponse,
  createToastResponseSchema,
  PHOTO_FIELD,
  toastParamsSchema,
} from '@toasthub/shared';
import type { FastifyRequest } from 'fastify';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AuthUser } from '../auth/auth.config';
import { CurrentUser } from '../auth/auth.decorators';
import { readPhotoUpload } from './photo-upload';
import { ToastsService } from './toasts.service';

class CreateToastResponseDto extends createZodDto(createToastResponseSchema) {}
class ToastParamsDto extends createZodDto(toastParamsSchema) {}

@ApiCookieAuth()
@ApiBearerAuth()
@Controller('toasts')
export class ToastsController {
  constructor(private readonly toastsService: ToastsService) {}

  /**
   * Logs a toast at the current time. Send no body, or `multipart/form-data` with an optional `photo`
   * (JPEG, PNG, WebP or HEIC, at most 10 MB). Limited to 30 per hour.
   */
  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    required: false,
    schema: { type: 'object', properties: { [PHOTO_FIELD]: { type: 'string', format: 'binary' } } },
  })
  @ZodResponse({ status: 201, type: CreateToastResponseDto })
  async create(
    @CurrentUser() user: AuthUser,
    @Req() request: FastifyRequest,
  ): Promise<CreateToastResponse> {
    this.toastsService.consumeCreateQuota(user.id);
    const photo = await readPhotoUpload(request);
    return this.toastsService.create(user.id, photo);
  }

  /** Deletes one of the caller's own toasts (soft delete). Likes on it are removed. */
  @Delete(':id')
  @HttpCode(204)
  async delete(@CurrentUser() user: AuthUser, @Param() params: ToastParamsDto): Promise<void> {
    await this.toastsService.delete(user.id, params.id);
  }
}
