import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { Province } from '../../../generated/prisma/enums.js';

export class DistrictListQueryDto {
  @ApiPropertyOptional({ enum: Province })
  @IsOptional()
  @IsEnum(Province)
  province?: Province;
}
