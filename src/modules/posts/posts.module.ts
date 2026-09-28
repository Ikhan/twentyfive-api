import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module.js';
import { PostsController } from './posts.controller.js';
import { POSTS_REPOSITORY } from './posts.repository.js';
import { PostsService } from './posts.service.js';
import { PrismaPostsRepository } from './prisma-posts.repository.js';

@Module({
  imports: [MediaModule],
  controllers: [PostsController],
  providers: [PostsService, { provide: POSTS_REPOSITORY, useClass: PrismaPostsRepository }],
  exports: [PostsService, POSTS_REPOSITORY],
})
export class PostsModule {}
