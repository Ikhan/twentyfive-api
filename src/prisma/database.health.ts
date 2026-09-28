import { Injectable } from '@nestjs/common';
import type { HealthIndicator } from '../modules/health/health-indicator.js';
import { PrismaService } from './prisma.service.js';

@Injectable()
export class DatabaseHealthIndicator implements HealthIndicator {
  readonly name = 'database';

  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<boolean> {
    await this.prisma.$queryRaw`SELECT 1`;
    return true;
  }
}
