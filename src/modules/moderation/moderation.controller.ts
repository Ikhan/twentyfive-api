import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Paginated } from '../../common/api-response.js';
import type { AuthUser } from '../../common/auth-user.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { PageQueryDto } from '../../common/pagination/page-query.dto.js';
import type { UserSummary } from '../users/users.types.js';
import { BlocksService } from './blocks.service.js';
import { CreateReportDto } from './dto/create-report.dto.js';
import { ReportsService } from './reports.service.js';

@ApiTags('moderation')
@Controller('users')
export class BlocksController {
  constructor(private readonly blocks: BlocksService) {}

  @Get('me/blocks')
  @ApiOperation({ summary: 'People you blocked' })
  list(@CurrentUser() user: AuthUser, @Query() page: PageQueryDto): Promise<Paginated<UserSummary>> {
    return this.blocks.blocked(user.id, page);
  }

  @Put(':username/block')
  @ApiOperation({ summary: 'Block someone (also removes follows both ways). Idempotent.' })
  block(@CurrentUser() user: AuthUser, @Param('username') username: string): Promise<{ blocked: true }> {
    return this.blocks.block(user.id, username);
  }

  @Delete(':username/block')
  @ApiOperation({ summary: 'Unblock someone. Idempotent.' })
  unblock(@CurrentUser() user: AuthUser, @Param('username') username: string): Promise<{ blocked: false }> {
    return this.blocks.unblock(user.id, username);
  }
}

@ApiTags('moderation')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  @ApiOperation({ summary: 'Report a post, comment or profile for review' })
  async report(@CurrentUser() user: AuthUser, @Body() dto: CreateReportDto): Promise<null> {
    await this.reports.report({ reporterId: user.id, ...dto, details: dto.details ?? '' });
    return null;
  }
}
