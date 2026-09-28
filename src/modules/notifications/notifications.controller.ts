import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Paginated } from '../../common/api-response.js';
import type { AuthUser } from '../../common/auth-user.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { PageQueryDto } from '../../common/pagination/page-query.dto.js';
import { NotificationsService } from './notifications.service.js';
import type { NotificationView } from './notifications.types.js';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Your notifications, newest first' })
  list(@CurrentUser() user: AuthUser, @Query() page: PageQueryDto): Promise<Paginated<NotificationView>> {
    return this.notifications.list(user.id, page);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'How many notifications you haven’t read' })
  unreadCount(@CurrentUser() user: AuthUser): Promise<{ count: number }> {
    return this.notifications.unreadCount(user.id);
  }

  @Post('read-all')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark all notifications as read' })
  async markAllRead(@CurrentUser() user: AuthUser): Promise<null> {
    await this.notifications.markAllRead(user.id);
    return null;
  }

  @Post(':id/read')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark one notification as read' })
  async markRead(@CurrentUser() user: AuthUser, @Param('id', new ParseUUIDPipe()) id: string): Promise<null> {
    await this.notifications.markRead(user.id, id);
    return null;
  }
}
