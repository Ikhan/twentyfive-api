import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import { MAX_COMMENT_LENGTH } from '../comments.service.js';

export class CreateCommentDto {
  @ApiProperty({ maxLength: MAX_COMMENT_LENGTH })
  @IsString()
  @MaxLength(MAX_COMMENT_LENGTH)
  body!: string;
}
