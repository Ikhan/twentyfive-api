import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { REPORT_REASONS, type ReportReason, type ReportTarget } from '../moderation.types.js';
import { MAX_REPORT_DETAILS } from '../reports.service.js';

const TARGETS: ReportTarget[] = ['POST', 'COMMENT', 'USER'];

export class CreateReportDto {
  @ApiProperty({ enum: TARGETS })
  @IsIn(TARGETS)
  targetType!: ReportTarget;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  targetId!: string;

  @ApiProperty({ enum: REPORT_REASONS })
  @IsIn(REPORT_REASONS)
  reason!: ReportReason;

  @ApiPropertyOptional({ maxLength: MAX_REPORT_DETAILS })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_REPORT_DETAILS)
  details?: string;
}
