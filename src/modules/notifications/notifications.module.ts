import { Module } from '@nestjs/common';
import { ModerationModule } from '../moderation/moderation.module.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsListener } from './notifications.listener.js';
import { NOTIFICATIONS_REPOSITORY } from './notifications.repository.js';
import { NotificationsService } from './notifications.service.js';
import { PrismaNotificationsRepository } from './prisma-notifications.repository.js';

@Module({
  imports: [ModerationModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsListener,
    { provide: NOTIFICATIONS_REPOSITORY, useClass: PrismaNotificationsRepository },
  ],
})
export class NotificationsModule {}
