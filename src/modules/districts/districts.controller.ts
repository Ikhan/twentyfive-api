import { Controller, Delete, Get, Param, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Paginated } from '../../common/api-response.js';
import type { AuthUser } from '../../common/auth-user.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { OptionalUser } from '../../common/decorators/optional-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { PageQueryDto } from '../../common/pagination/page-query.dto.js';
import type { UserSummary } from '../users/users.types.js';
import { DistrictsService } from './districts.service.js';
import type { DistrictDetail, DistrictListItem, FollowState, TrendingDistrict } from './districts.types.js';
import { DistrictListQueryDto, TrendingQueryDto } from './dto/district-query.dto.js';

@ApiTags('districts')
@Controller('districts')
export class DistrictsController {
  constructor(private readonly districts: DistrictsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'All 25 districts A–Z with follower counts (and whether you follow each, when signed in)' })
  list(@Query() query: DistrictListQueryDto, @OptionalUser() viewer?: AuthUser): Promise<DistrictListItem[]> {
    return this.districts.list(query.province, viewer?.id);
  }

  // Before ':id', so "trending" isn't taken for a district.
  @Public()
  @Get('trending')
  @ApiOperation({ summary: 'Trending cities: most active today, then this week, then most followed' })
  trending(@Query() query: TrendingQueryDto): Promise<TrendingDistrict[]> {
    return this.districts.trending(query.limit);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'A district with its follower count (and whether you follow it, when signed in)' })
  detail(@Param('id') id: string, @OptionalUser() viewer?: AuthUser): Promise<DistrictDetail> {
    return this.districts.detail(id, viewer?.id);
  }

  @Put(':id/follow')
  @ApiOperation({ summary: 'Follow a district (idempotent)' })
  follow(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<FollowState> {
    return this.districts.follow(user.id, id);
  }

  @Delete(':id/follow')
  @ApiOperation({ summary: 'Unfollow a district (idempotent)' })
  unfollow(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<FollowState> {
    return this.districts.unfollow(user.id, id);
  }

  @Put(':id/notifications')
  @ApiOperation({ summary: 'Turn on notifications for new posts in a district you follow (idempotent)' })
  notifyOn(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<FollowState> {
    return this.districts.setNotifications(user.id, id, true);
  }

  @Delete(':id/notifications')
  @ApiOperation({ summary: 'Turn off notifications for new posts in a district (idempotent)' })
  notifyOff(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<FollowState> {
    return this.districts.setNotifications(user.id, id, false);
  }

  @Public()
  @Get(':id/residents')
  @ApiOperation({ summary: 'People from this district (paginated)' })
  residents(@Param('id') id: string, @Query() page: PageQueryDto): Promise<Paginated<UserSummary>> {
    return this.districts.residents(id, page);
  }
}
