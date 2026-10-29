import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import { type HomeResponse, homeResponseSchema } from '@toasthub/shared';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AuthUser } from '../auth/auth.config';
import { CurrentUser } from '../auth/auth.decorators';
import { HomeService } from './home.service';

class HomeResponseDto extends createZodDto(homeResponseSchema) {}

@ApiCookieAuth()
@ApiBearerAuth()
@Controller('home')
export class HomeController {
  constructor(private readonly homeService: HomeService) {}

  /** Everything the home screen shows, in one call: today's count, streaks and the fact of the day. */
  @Get()
  @ZodResponse({ status: 200, type: HomeResponseDto })
  async get(@CurrentUser() user: AuthUser): Promise<HomeResponse> {
    return this.homeService.get(user.id);
  }
}
