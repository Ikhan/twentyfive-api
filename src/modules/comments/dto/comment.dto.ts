import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { MAX_COMMENT_LENGTH } from '../comments.service.js';

export class CreateCommentDto {
  @ApiProperty({ maxLength: MAX_COMMENT_LENGTH })
  @IsString()
  @MaxLength(MAX_COMMENT_LENGTH)
  body!: string;

  @ApiPropertyOptional({ description: 'Reply to this comment on the same post (replies stay one level deep)' })
  @IsOptional()
  @IsUUID()
  parentId?: string;
}
