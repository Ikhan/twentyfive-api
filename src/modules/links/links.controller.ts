import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { LinkPreviewQueryDto } from './dto/link-preview-query.dto.js';
import type { LinkPreview } from './link-preview.types.js';
import { LinkPreviewsService } from './link-previews.service.js';

@ApiTags('links')
@Controller('link-preview')
export class LinksController {
  constructor(private readonly links: LinkPreviewsService) {}

  // Each preview can mean an outgoing request, so this is limited more tightly than the default.
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get()
  @ApiOperation({ summary: 'The card for a link (title, description, image, site), or null' })
  preview(@Query() query: LinkPreviewQueryDto): Promise<LinkPreview | null> {
    return this.links.preview(query.url);
  }
}
