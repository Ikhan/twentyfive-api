import { Module } from '@nestjs/common';
import { ModerationModule } from '../moderation/moderation.module.js';
import { FollowRequestsController, FollowsController } from './follows.controller.js';
import { FollowsListener } from './follows.listener.js';
import { FOLLOWS_REPOSITORY } from './follows.repository.js';
import { FollowsService } from './follows.service.js';
import { PrismaFollowsRepository } from './prisma-follows.repository.js';

@Module({
  imports: [ModerationModule],
  controllers: [FollowsController, FollowRequestsController],
  providers: [FollowsService, FollowsListener, { provide: FOLLOWS_REPOSITORY, useClass: PrismaFollowsRepository }],
  exports: [FollowsService],
})
export class FollowsModule {}
