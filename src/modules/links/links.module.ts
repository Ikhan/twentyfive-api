import { Module } from '@nestjs/common';
import { LinkPreviewsService } from './link-previews.service.js';
import { LinksController } from './links.controller.js';
import { PAGE_FETCHER } from './page-fetcher.js';
import { SafePageFetcher } from './safe-page-fetcher.js';

@Module({
  controllers: [LinksController],
  providers: [LinkPreviewsService, { provide: PAGE_FETCHER, useClass: SafePageFetcher }],
  exports: [LinkPreviewsService],
})
export class LinksModule {}
