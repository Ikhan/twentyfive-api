import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsListener } from './notifications.listener.js';
import { NOTIFICATIONS_REPOSITORY } from './notifications.repository.js';
import { NotificationsService } from './notifications.service.js';
import { PrismaNotificationsRepository } from './prisma-notifications.repository.js';

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsListener,
    { provide: NOTIFICATIONS_REPOSITORY, useClass: PrismaNotificationsRepository },
  ],
})
export class NotificationsModule {}
