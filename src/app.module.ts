import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppConfigModule } from './config/config.module.js';
import { AppConfigService } from './config/app-config.service.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CommentsModule } from './modules/comments/comments.module.js';
import { DistrictsModule } from './modules/districts/districts.module.js';
import { FollowsModule } from './modules/follows/follows.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { MediaModule } from './modules/media/media.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { PostsModule } from './modules/posts/posts.module.js';
import { ReactionsModule } from './modules/reactions/reactions.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => [
        { ttl: config.get('RATE_LIMIT_TTL_SECONDS') * 1000, limit: config.get('RATE_LIMIT_MAX') },
      ],
    }),
    HealthModule,
    AuthModule,
    UsersModule,
    DistrictsModule,
    FollowsModule,
    MediaModule,
    PostsModule,
    CommentsModule,
    ReactionsModule,
    NotificationsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
