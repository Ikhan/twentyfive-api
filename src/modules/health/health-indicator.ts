/**
 * A dependency the API needs in order to serve traffic (database, storage…).
 * Features register their own indicator under HEALTH_INDICATORS, so the health
 * check grows without HealthService changing (open/closed).
 */
export interface HealthIndicator {
  readonly name: string;
  /** Resolves when healthy; rejects (or resolves false) when not. */
  check(): Promise<boolean>;
}

export const HEALTH_INDICATORS = Symbol('HEALTH_INDICATORS');
