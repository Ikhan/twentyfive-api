import { Inject, Injectable, Optional } from '@nestjs/common';
import { ServiceUnavailableError } from './health.errors.js';
import { HEALTH_INDICATORS, type HealthIndicator } from './health-indicator.js';

export type CheckStatus = 'up' | 'down';

export interface HealthReport {
  status: 'ok';
  uptimeSeconds: number;
  checks: Record<string, CheckStatus>;
}

@Injectable()
export class HealthService {
  constructor(@Optional() @Inject(HEALTH_INDICATORS) private readonly indicators: HealthIndicator[] = []) {}

  /** Runs every indicator; throws ServiceUnavailableError (503) listing the ones that are down. */
  async check(): Promise<HealthReport> {
    const results = await Promise.all(
      this.indicators.map(async (indicator): Promise<[string, CheckStatus]> => {
        try {
          return [indicator.name, (await indicator.check()) ? 'up' : 'down'];
        } catch {
          return [indicator.name, 'down'];
        }
      }),
    );
    const checks = Object.fromEntries(results);
    if (results.some(([, status]) => status === 'down')) {
      throw new ServiceUnavailableError('Some dependencies are unavailable.', checks);
    }
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()), checks };
  }
}
