import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { MAX_COMMENT_LENGTH, MAX_COMMENT_PHOTOS } from '../comments.service.js';

export class CreateCommentDto {
  @ApiPropertyOptional({ maxLength: MAX_COMMENT_LENGTH, description: 'Optional with photos or a video' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_COMMENT_LENGTH)
  body?: string;

  @ApiPropertyOptional({ description: 'Reply to this comment on the same post (replies stay one level deep)' })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional({ type: [String], description: `Up to ${MAX_COMMENT_PHOTOS} completed POST_PHOTO uploads` })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_COMMENT_PHOTOS)
  @IsUUID('all', { each: true })
  mediaIds?: string[];

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'A completed POST_VIDEO upload (up to 10 minutes), instead of photos',
  })
  @IsOptional()
  @IsUUID()
  videoId?: string;
}
