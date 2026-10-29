import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import { type MeResponse, meResponseSchema, updateMeSchema } from '@toasthub/shared';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AuthUser } from '../auth/auth.config';
import { CurrentUser } from '../auth/auth.decorators';
import { MeService } from './me.service';

class MeResponseDto extends createZodDto(meResponseSchema) {}
class UpdateMeDto extends createZodDto(updateMeSchema) {}

@ApiCookieAuth()
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(private readonly meService: MeService) {}

  /** The signed-in user's own profile, with the `onboarded` flag. */
  @Get()
  @ZodResponse({ status: 200, type: MeResponseDto })
  async get(@CurrentUser() user: AuthUser): Promise<MeResponse> {
    return { user: await this.meService.get(user.id) };
  }

  /** Updates the own profile; onboarding uses this to set the display name. */
  @Patch()
  @ZodResponse({ status: 200, type: MeResponseDto })
  async update(@CurrentUser() user: AuthUser, @Body() body: UpdateMeDto): Promise<MeResponse> {
    return { user: await this.meService.update(user.id, body) };
  }
}
