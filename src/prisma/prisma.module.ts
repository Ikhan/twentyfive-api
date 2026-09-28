import { Global, Module } from '@nestjs/common';
import { DatabaseHealthIndicator } from './database.health.js';
import { PrismaService } from './prisma.service.js';

@Global()
@Module({
  providers: [PrismaService, DatabaseHealthIndicator],
  exports: [PrismaService, DatabaseHealthIndicator],
})
export class PrismaModule {}
