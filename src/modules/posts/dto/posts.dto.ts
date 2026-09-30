import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PageQueryDto } from '../../../common/pagination/page-query.dto.js';
import { MAX_POST_LENGTH, MAX_POST_PHOTOS } from '../posts.service.js';

export class CreatePostDto {
  @ApiPropertyOptional({ maxLength: MAX_POST_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_POST_LENGTH)
  body?: string;

  @ApiPropertyOptional({
    example: 'kandy',
    description: 'The district this post is about. Leave out to post to all districts.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  districtId?: string;

  @ApiPropertyOptional({ enum: ['EVERYONE', 'FOLLOWERS'], default: 'EVERYONE' })
  @IsOptional()
  @IsIn(['EVERYONE', 'FOLLOWERS'])
  audience?: 'EVERYONE' | 'FOLLOWERS';

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Quote this post (it must be public). The quote still needs text or a photo.',
  })
  @IsOptional()
  @IsUUID()
  quotedPostId?: string;

  @ApiPropertyOptional({ type: [String], description: `Up to ${MAX_POST_PHOTOS} completed POST_PHOTO uploads` })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_POST_PHOTOS)
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

export class FeedQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: ['for-you', 'following'], default: 'for-you' })
  @IsOptional()
  @IsIn(['for-you', 'following'])
  tab: 'for-you' | 'following' = 'for-you';
}
