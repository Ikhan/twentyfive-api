import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth-user.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { CreateUploadDto } from './dto/create-upload.dto.js';
import { MediaService } from './media.service.js';
import type { MediaView, UploadTicket } from './media.types.js';

@ApiTags('media')
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('uploads')
  @ApiOperation({ summary: 'Get a presigned form to upload a photo directly to storage' })
  createUpload(@CurrentUser() user: AuthUser, @Body() dto: CreateUploadDto): Promise<UploadTicket> {
    return this.media.createUpload(user.id, dto);
  }

  @Post(':id/complete')
  @HttpCode(200)
  @ApiOperation({ summary: 'Confirm an upload finished; verifies size and image type' })
  complete(@CurrentUser() user: AuthUser, @Param('id', new ParseUUIDPipe()) id: string): Promise<MediaView> {
    return this.media.complete(user.id, id);
  }
}
