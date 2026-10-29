import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import {
  type ClanDetail,
  clanDetailSchema,
  type ClanFeedPage,
  clanFeedPageSchema,
  type ClanJoinRequestList,
  clanJoinRequestListSchema,
  type ClanJoinRequestResponse,
  clanJoinRequestResponseSchema,
  clanListQuerySchema,
  clanMemberParamsSchema,
  type ClanMembershipResponse,
  clanMembershipResponseSchema,
  type ClanPage,
  clanPageSchema,
  clanParamsSchema,
  clanRequestParamsSchema,
  type ClanResponse,
  clanResponseSchema,
  type ClanTransferResponse,
  clanTransferResponseSchema,
  createClanResponseSchema,
  createClanSchema,
  type CreateClanResponse,
  pageQuerySchema,
  transferClanSchema,
  updateClanMemberSchema,
  updateClanSchema,
} from '@toasthub/shared';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AuthUser } from '../auth/auth.config';
import { CurrentUser } from '../auth/auth.decorators';
import { ClanFeedService } from './clan-feed.service';
import { ClansService } from './clans.service';

class ClanPageDto extends createZodDto(clanPageSchema) {}
class ClanResponseDto extends createZodDto(clanResponseSchema) {}
class CreateClanResponseDto extends createZodDto(createClanResponseSchema) {}
class ClanDetailDto extends createZodDto(clanDetailSchema) {}
class ClanJoinRequestResponseDto extends createZodDto(clanJoinRequestResponseSchema) {}
class ClanJoinRequestListDto extends createZodDto(clanJoinRequestListSchema) {}
class ClanMembershipResponseDto extends createZodDto(clanMembershipResponseSchema) {}
class ClanListQueryDto extends createZodDto(clanListQuerySchema) {}
class ClanParamsDto extends createZodDto(clanParamsSchema) {}
class ClanRequestParamsDto extends createZodDto(clanRequestParamsSchema) {}
class CreateClanDto extends createZodDto(createClanSchema) {}
class UpdateClanDto extends createZodDto(updateClanSchema) {}
class ClanMemberParamsDto extends createZodDto(clanMemberParamsSchema) {}
class UpdateClanMemberDto extends createZodDto(updateClanMemberSchema) {}
class TransferClanDto extends createZodDto(transferClanSchema) {}
class ClanTransferResponseDto extends createZodDto(clanTransferResponseSchema) {}
class ClanFeedPageDto extends createZodDto(clanFeedPageSchema) {}
class PageQueryDto extends createZodDto(pageQuerySchema) {}

@ApiCookieAuth()
@ApiBearerAuth()
@Controller()
export class ClansController {
  constructor(
    private readonly clans: ClansService,
    private readonly feedService: ClanFeedService,
  ) {}

  /** Clans by name, A–Z; `search` matches part of the name. */
  @Get('clans')
  @ZodResponse({ status: 200, type: ClanPageDto })
  list(@Query() query: ClanListQueryDto): Promise<ClanPage> {
    return this.clans.list(query);
  }

  /** Creates a clan with the caller as its Owner. 409 when the caller is in a clan or the name is taken. */
  @Post('clans')
  @ZodResponse({ status: 201, type: CreateClanResponseDto })
  create(@CurrentUser() user: AuthUser, @Body() body: CreateClanDto): Promise<CreateClanResponse> {
    return this.clans.create(user.id, body);
  }

  /** The clan with its streak, its members and the caller's role and pending request. */
  @Get('clans/:id')
  @ZodResponse({ status: 200, type: ClanDetailDto })
  get(@CurrentUser() user: AuthUser, @Param() params: ClanParamsDto): Promise<ClanDetail> {
    return this.clans.get(user.id, params.id);
  }

  /** Renames the clan or changes its description. Owner only. */
  @Patch('clans/:id')
  @ZodResponse({ status: 200, type: ClanResponseDto })
  update(
    @CurrentUser() user: AuthUser,
    @Param() params: ClanParamsDto,
    @Body() body: UpdateClanDto,
  ): Promise<ClanResponse> {
    return this.clans.update(user.id, params.id, body);
  }

  /** Deletes the clan, its memberships and pending requests. Owner only. */
  @Delete('clans/:id')
  @HttpCode(204)
  async delete(@CurrentUser() user: AuthUser, @Param() params: ClanParamsDto): Promise<void> {
    await this.clans.delete(user.id, params.id);
  }

  /** Asks to join; an Officer or the Owner decides. 409 when in a clan, already asking, or it is full. */
  @Post('clans/:id/join')
  @ZodResponse({ status: 202, type: ClanJoinRequestResponseDto })
  join(
    @CurrentUser() user: AuthUser,
    @Param() params: ClanParamsDto,
  ): Promise<ClanJoinRequestResponse> {
    return this.clans.join(user.id, params.id);
  }

  /** Leaves the clan. 409 for the Owner, who must transfer ownership or delete the clan. */
  @Post('clans/:id/leave')
  @HttpCode(204)
  async leave(@CurrentUser() user: AuthUser, @Param() params: ClanParamsDto): Promise<void> {
    await this.clans.leave(user.id, params.id);
  }

  /** Pending join requests, oldest first. Officers and the Owner only. */
  @Get('clans/:id/requests')
  @ZodResponse({ status: 200, type: ClanJoinRequestListDto })
  listRequests(
    @CurrentUser() user: AuthUser,
    @Param() params: ClanParamsDto,
  ): Promise<ClanJoinRequestList> {
    return this.clans.listRequests(user.id, params.id);
  }

  /** Makes the requester a Member. 409 when the clan is full. Officers and the Owner only. */
  @Post('clans/:id/requests/:rid/approve')
  @ZodResponse({ status: 200, type: ClanMembershipResponseDto })
  approve(
    @CurrentUser() user: AuthUser,
    @Param() params: ClanRequestParamsDto,
  ): Promise<ClanMembershipResponse> {
    return this.clans.approve(user.id, params.id, params.rid);
  }

  /** Officers and the Owner only. */
  @Post('clans/:id/requests/:rid/reject')
  @HttpCode(204)
  async reject(
    @CurrentUser() user: AuthUser,
    @Param() params: ClanRequestParamsDto,
  ): Promise<void> {
    await this.clans.reject(user.id, params.id, params.rid);
  }

  /** Promotes a Member to Officer or demotes an Officer. Owner only. */
  @Patch('clans/:id/members/:userId')
  @ZodResponse({ status: 200, type: ClanMembershipResponseDto })
  updateMember(
    @CurrentUser() user: AuthUser,
    @Param() params: ClanMemberParamsDto,
    @Body() body: UpdateClanMemberDto,
  ): Promise<ClanMembershipResponse> {
    return this.clans.updateMember(user.id, params.id, params.userId, body.role);
  }

  /** Kicks a member. The Owner may kick Officers and Members, Officers only Members. */
  @Delete('clans/:id/members/:userId')
  @HttpCode(204)
  async kick(@CurrentUser() user: AuthUser, @Param() params: ClanMemberParamsDto): Promise<void> {
    await this.clans.kick(user.id, params.id, params.userId);
  }

  /** Makes another member the Owner; the caller stays as an Officer. Owner only. */
  @Post('clans/:id/transfer')
  @HttpCode(200)
  @ZodResponse({ status: 200, type: ClanTransferResponseDto })
  transfer(
    @CurrentUser() user: AuthUser,
    @Param() params: ClanParamsDto,
    @Body() body: TransferClanDto,
  ): Promise<ClanTransferResponse> {
    return this.clans.transfer(user.id, params.id, body.userId);
  }

  /** Toast sessions of the current members, newest first. Members only. */
  @Get('clans/:id/feed')
  @ZodResponse({ status: 200, type: ClanFeedPageDto })
  feed(
    @CurrentUser() user: AuthUser,
    @Param() params: ClanParamsDto,
    @Query() query: PageQueryDto,
  ): Promise<ClanFeedPage> {
    return this.feedService.list(user.id, params.id, query);
  }

  /** Cancels the caller's pending join request; a no-op without one. */
  @Delete('me/clan-request')
  @HttpCode(204)
  async cancelMyRequest(@CurrentUser() user: AuthUser): Promise<void> {
    await this.clans.cancelMyRequest(user.id);
  }
}
