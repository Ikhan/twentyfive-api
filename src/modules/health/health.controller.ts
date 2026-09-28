import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthService, type HealthReport } from './health.service.js';

@ApiTags('health')
@SkipThrottle() // load balancers poll this constantly
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Liveness and dependency check' })
  check(): Promise<HealthReport> {
    return this.health.check();
  }
}
