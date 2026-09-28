import { Module } from '@nestjs/common';
import { PostsModule } from '../posts/posts.module.js';
import { PrismaReactionsRepository } from './prisma-reactions.repository.js';
import { ReactionsController } from './reactions.controller.js';
import { REACTIONS_REPOSITORY } from './reactions.repository.js';
import { ReactionsService } from './reactions.service.js';

@Module({
  imports: [PostsModule],
  controllers: [ReactionsController],
  providers: [ReactionsService, { provide: REACTIONS_REPOSITORY, useClass: PrismaReactionsRepository }],
})
export class ReactionsModule {}
