import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Province } from '../../../generated/prisma/enums.js';

export class DistrictListQueryDto {
  @ApiPropertyOptional({ enum: Province })
  @IsOptional()
  @IsEnum(Province)
  province?: Province;
}

export const DEFAULT_TRENDING = 5;

/** `?limit=…` for Trending cities (up to all 25). */
export class TrendingQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 25, default: DEFAULT_TRENDING })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(25)
  limit: number = DEFAULT_TRENDING;
}
