import { Module } from '@nestjs/common';
import { DatabaseHealthIndicator } from '../../prisma/database.health.js';
import { MediaModule } from '../media/media.module.js';
import { StorageHealthIndicator } from '../media/storage.health.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../media/storage/object-storage.js';
import { HEALTH_INDICATORS, type HealthIndicator } from './health-indicator.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

/** Dependencies that must be up. Storage is only checked when it's configured. */
export function healthIndicators(database: DatabaseHealthIndicator, storage: ObjectStorage): HealthIndicator[] {
  return [database, ...(storage.configured ? [new StorageHealthIndicator(storage)] : [])];
}

@Module({
  imports: [MediaModule],
  controllers: [HealthController],
  providers: [
    HealthService,
    // Add new dependencies here; HealthService itself doesn't change.
    { provide: HEALTH_INDICATORS, inject: [DatabaseHealthIndicator, OBJECT_STORAGE], useFactory: healthIndicators },
  ],
})
export class HealthModule {}
