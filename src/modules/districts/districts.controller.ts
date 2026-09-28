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
import type { DistrictDetail, DistrictSummary, FollowState } from './districts.types.js';
import { DistrictListQueryDto } from './dto/district-query.dto.js';

@ApiTags('districts')
@Controller('districts')
export class DistrictsController {
  constructor(private readonly districts: DistrictsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'All 25 districts A–Z (Explore)' })
  list(@Query() query: DistrictListQueryDto): Promise<DistrictSummary[]> {
    return this.districts.list(query.province);
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

  @Public()
  @Get(':id/residents')
  @ApiOperation({ summary: 'People from this district (paginated)' })
  residents(@Param('id') id: string, @Query() page: PageQueryDto): Promise<Paginated<UserSummary>> {
    return this.districts.residents(id, page);
  }
}
