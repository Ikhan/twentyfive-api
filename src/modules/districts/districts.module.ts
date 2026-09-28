import { Module } from '@nestjs/common';
import { DISTRICTS_REPOSITORY } from './districts.repository.js';
import { DistrictsController } from './districts.controller.js';
import { DistrictsService } from './districts.service.js';
import { PrismaDistrictsRepository } from './prisma-districts.repository.js';

@Module({
  controllers: [DistrictsController],
  providers: [DistrictsService, { provide: DISTRICTS_REPOSITORY, useClass: PrismaDistrictsRepository }],
  exports: [DistrictsService],
})
export class DistrictsModule {}
