import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsString, Max, Min } from 'class-validator';
import { ALLOWED_IMAGE_TYPES } from '../image-signature.js';

export class CreateUploadDto {
  @ApiProperty({ enum: ['POST_PHOTO', 'AVATAR'] })
  @IsIn(['POST_PHOTO', 'AVATAR'])
  purpose!: 'POST_PHOTO' | 'AVATAR';

  @ApiProperty({ enum: ALLOWED_IMAGE_TYPES })
  @IsString()
  contentType!: string;

  @ApiProperty({ description: 'File size in bytes (the upload is also limited by S3)' })
  @IsInt()
  @Min(1)
  @Max(50 * 1024 * 1024)
  sizeBytes!: number;
}
