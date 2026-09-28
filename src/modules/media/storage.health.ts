import type { HealthIndicator } from '../health/health-indicator.js';
import type { ObjectStorage } from './storage/object-storage.js';

export class StorageHealthIndicator implements HealthIndicator {
  readonly name = 'storage';

  constructor(private readonly storage: ObjectStorage) {}

  check(): Promise<boolean> {
    return this.storage.ping();
  }
}
