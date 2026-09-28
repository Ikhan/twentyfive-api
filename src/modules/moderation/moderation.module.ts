import { Module } from '@nestjs/common';
import { PostsModule } from '../posts/posts.module.js';
import { BLOCK_CHECKER } from './block-checker.js';
import { BLOCKS_REPOSITORY } from './blocks.repository.js';
import { BlocksService } from './blocks.service.js';
import { BlocksController, ReportsController } from './moderation.controller.js';
import { PrismaBlocksRepository } from './prisma-blocks.repository.js';
import { PrismaReportsRepository } from './prisma-reports.repository.js';
import { REPORTS_REPOSITORY } from './reports.repository.js';
import { ReportsService } from './reports.service.js';

@Module({
  imports: [PostsModule],
  controllers: [BlocksController, ReportsController],
  providers: [
    BlocksService,
    ReportsService,
    { provide: BLOCKS_REPOSITORY, useClass: PrismaBlocksRepository },
    { provide: REPORTS_REPOSITORY, useClass: PrismaReportsRepository },
    { provide: BLOCK_CHECKER, useExisting: BlocksService },
  ],
  exports: [BLOCK_CHECKER],
})
export class ModerationModule {}
