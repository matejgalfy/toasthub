import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import {
  type Comment,
  type CommentPage,
  commentPageSchema,
  commentParamsSchema,
  commentQuerySchema,
  commentSchema,
  createCommentSchema,
  toastParamsSchema,
} from '@toasthub/shared';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AuthUser } from '../auth/auth.config';
import { CurrentUser } from '../auth/auth.decorators';
import { CommentsService } from './comments.service';

class ToastParamsDto extends createZodDto(toastParamsSchema) {}
class CommentParamsDto extends createZodDto(commentParamsSchema) {}
class CommentQueryDto extends createZodDto(commentQuerySchema) {}
class CreateCommentDto extends createZodDto(createCommentSchema) {}
class CommentDto extends createZodDto(commentSchema) {}
class CommentPageDto extends createZodDto(commentPageSchema) {}

@ApiCookieAuth()
@ApiBearerAuth()
@Controller()
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  /** Flat thread rows on a visible session's lead toast, oldest first. */
  @Get('toasts/:id/comments')
  @ZodResponse({ status: 200, type: CommentPageDto })
  list(
    @CurrentUser() user: AuthUser,
    @Param() params: ToastParamsDto,
    @Query() query: CommentQueryDto,
  ): Promise<CommentPage> {
    return this.comments.list(user, params.id, query);
  }

  /** Adds plain text or a reply on the same toast; rate limited per user. */
  @Post('toasts/:id/comments')
  @ZodResponse({ status: 201, type: CommentDto })
  create(
    @CurrentUser() user: AuthUser,
    @Param() params: ToastParamsDto,
    @Body() body: CreateCommentDto,
  ): Promise<Comment> {
    return this.comments.create(user, params.id, body);
  }

  /** Likes a live comment with 🍞; idempotent and only on a visible session. */
  @Post('comments/:id/like')
  @HttpCode(204)
  async like(@CurrentUser() user: AuthUser, @Param() params: CommentParamsDto): Promise<void> {
    await this.comments.like(user, params.id);
  }

  /** Takes the caller's like back; idempotent even when the comment is no longer visible. */
  @Delete('comments/:id/like')
  @HttpCode(204)
  async unlike(@CurrentUser() user: AuthUser, @Param() params: CommentParamsDto): Promise<void> {
    await this.comments.unlike(user.id, params.id);
  }

  /** Author/admin removal keeps an anonymous placeholder and all replies. */
  @Delete('comments/:id')
  @HttpCode(204)
  async delete(@CurrentUser() user: AuthUser, @Param() params: CommentParamsDto): Promise<void> {
    await this.comments.delete(user, params.id);
  }
}
