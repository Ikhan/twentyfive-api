import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module.js';
import { PostsModule } from '../posts/posts.module.js';
import { CommentsController } from './comments.controller.js';
import { COMMENTS_REPOSITORY } from './comments.repository.js';
import { CommentsService } from './comments.service.js';
import { PrismaCommentsRepository } from './prisma-comments.repository.js';

@Module({
  imports: [PostsModule, MediaModule],
  controllers: [CommentsController],
  providers: [CommentsService, { provide: COMMENTS_REPOSITORY, useClass: PrismaCommentsRepository }],
})
export class CommentsModule {}
