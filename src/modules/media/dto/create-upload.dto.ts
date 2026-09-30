import type { MediaPurpose } from '../media.types.js';
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsString, Max, Min } from 'class-validator';
import { ALLOWED_IMAGE_TYPES } from '../image-signature.js';
import { ALLOWED_VIDEO_TYPES } from '../video-signature.js';

export class CreateUploadDto {
  @ApiProperty({ enum: ['POST_PHOTO', 'AVATAR', 'HEADER', 'POST_VIDEO'] })
  @IsIn(['POST_PHOTO', 'AVATAR', 'HEADER', 'POST_VIDEO'])
  purpose!: MediaPurpose;

  @ApiProperty({ enum: [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES] })
  @IsString()
  contentType!: string;

  @ApiProperty({ description: 'File size in bytes (the upload is also limited by S3)' })
  @IsInt()
  @Min(1)
  @Max(512 * 1024 * 1024)
  sizeBytes!: number;
}
