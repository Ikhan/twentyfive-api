import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
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
  private readonly logger = new Logger(HealthService.name);

  constructor(@Optional() @Inject(HEALTH_INDICATORS) private readonly indicators: HealthIndicator[] = []) {}

  /** Runs every indicator; throws ServiceUnavailableError (503) listing the ones that are down. */
  async check(): Promise<HealthReport> {
    const results = await Promise.all(
      this.indicators.map(async (indicator): Promise<[string, CheckStatus]> => {
        // Logged, since the response only says up/down: the reason is what explains a failing load balancer.
        try {
          if (await indicator.check()) return [indicator.name, 'up'];
          this.logger.warn(`Health check "${indicator.name}" is down`);
        } catch (error) {
          this.logger.warn(
            `Health check "${indicator.name}" failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        return [indicator.name, 'down'];
      }),
    );
    const checks = Object.fromEntries(results);
    if (results.some(([, status]) => status === 'down')) {
      throw new ServiceUnavailableError('Some dependencies are unavailable.', checks);
    }
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()), checks };
  }
}
