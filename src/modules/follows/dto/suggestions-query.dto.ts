import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_SUGGESTIONS = 4;
export const MAX_SUGGESTIONS = 20;

/** `?limit=…` for People to follow. */
export class SuggestionsQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: MAX_SUGGESTIONS, default: DEFAULT_SUGGESTIONS })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_SUGGESTIONS)
  limit: number = DEFAULT_SUGGESTIONS;
}
