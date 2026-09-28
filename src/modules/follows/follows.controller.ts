import { Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Paginated } from '../../common/api-response.js';
import type { AuthUser } from '../../common/auth-user.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { PageQueryDto } from '../../common/pagination/page-query.dto.js';
import type { UserSummary } from '../users/users.types.js';
import { FollowsService } from './follows.service.js';
import type { FollowStats, SuggestedUser } from './follows.types.js';
import { SuggestionsQueryDto } from './dto/suggestions-query.dto.js';

@ApiTags('follows')
@Controller('users/:username')
export class FollowsController {
  constructor(private readonly follows: FollowsService) {}

  @Put('follow')
  @ApiOperation({ summary: 'Follow (or request to follow a private account). Idempotent.' })
  follow(@CurrentUser() user: AuthUser, @Param('username') username: string): Promise<FollowStats> {
    return this.follows.follow(user.id, username);
  }

  @Delete('follow')
  @ApiOperation({ summary: 'Unfollow or cancel a request. Idempotent.' })
  unfollow(@CurrentUser() user: AuthUser, @Param('username') username: string): Promise<FollowStats> {
    return this.follows.unfollow(user.id, username);
  }

  @Get('follow-stats')
  @ApiOperation({ summary: 'Follower counts and your relationship with this user' })
  stats(@CurrentUser() user: AuthUser, @Param('username') username: string): Promise<FollowStats> {
    return this.follows.stats(user.id, username);
  }

  @Get('followers')
  @ApiOperation({ summary: 'Followers (private accounts: followers only)' })
  followers(
    @CurrentUser() user: AuthUser,
    @Param('username') username: string,
    @Query() page: PageQueryDto,
  ): Promise<Paginated<UserSummary>> {
    return this.follows.followers(user.id, username, page);
  }

  @Get('following')
  @ApiOperation({ summary: 'Who this user follows (private accounts: followers only)' })
  following(
    @CurrentUser() user: AuthUser,
    @Param('username') username: string,
    @Query() page: PageQueryDto,
  ): Promise<Paginated<UserSummary>> {
    return this.follows.following(user.id, username, page);
  }
}

@ApiTags('follows')
@Controller('suggestions')
export class SuggestionsController {
  constructor(private readonly follows: FollowsService) {}

  @Get('people')
  @ApiOperation({ summary: 'People to follow, best first, each with why (follows you, mutuals, hometown)' })
  people(@CurrentUser() user: AuthUser, @Query() query: SuggestionsQueryDto): Promise<SuggestedUser[]> {
    return this.follows.suggestions(user.id, query.limit);
  }
}

@ApiTags('follows')
@Controller('follow-requests')
export class FollowRequestsController {
  constructor(private readonly follows: FollowsService) {}

  @Get()
  @ApiOperation({ summary: 'People asking to follow you' })
  list(@CurrentUser() user: AuthUser, @Query() page: PageQueryDto): Promise<Paginated<UserSummary>> {
    return this.follows.requests(user.id, page);
  }

  @Post(':username/accept')
  @HttpCode(200)
  @ApiOperation({ summary: 'Approve a follow request' })
  async accept(@CurrentUser() user: AuthUser, @Param('username') username: string): Promise<null> {
    await this.follows.acceptRequest(user.id, username);
    return null;
  }

  @Post(':username/decline')
  @HttpCode(200)
  @ApiOperation({ summary: 'Decline a follow request' })
  async decline(@CurrentUser() user: AuthUser, @Param('username') username: string): Promise<null> {
    await this.follows.declineRequest(user.id, username);
    return null;
  }
}
