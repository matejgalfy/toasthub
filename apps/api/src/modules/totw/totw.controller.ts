import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import {
  pageQuerySchema,
  type ToastOfTheWeekPage,
  toastOfTheWeekPageSchema,
} from '@toasthub/shared';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { TotwService } from './totw.service';

class ToastOfTheWeekPageDto extends createZodDto(toastOfTheWeekPageSchema) {}
class PageQueryDto extends createZodDto(pageQuerySchema) {}

@ApiCookieAuth()
@ApiBearerAuth()
@Controller('toast-of-the-week')
export class TotwController {
  constructor(private readonly totw: TotwService) {}

  /** Every drawn week, newest first: the winner, no winner, or a winner removed since. */
  @Get()
  @ZodResponse({ status: 200, type: ToastOfTheWeekPageDto })
  history(@Query() query: PageQueryDto): Promise<ToastOfTheWeekPage> {
    return this.totw.history(query);
  }
}
