import { Module } from '@nestjs/common';
import { DatabaseHealthIndicator } from '../../prisma/database.health.js';
import { HEALTH_INDICATORS, type HealthIndicator } from './health-indicator.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

@Module({
  controllers: [HealthController],
  providers: [
    HealthService,
    {
      // Add new dependencies (e.g. storage) here; HealthService itself doesn't change.
      provide: HEALTH_INDICATORS,
      inject: [DatabaseHealthIndicator],
      useFactory: (...indicators: HealthIndicator[]) => indicators,
    },
  ],
})
export class HealthModule {}
