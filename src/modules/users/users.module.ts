import { Module } from '@nestjs/common';
import { PrismaUsersRepository } from './prisma-users.repository.js';
import { UsersController } from './users.controller.js';
import { USERS_REPOSITORY } from './users.repository.js';
import { UsersService } from './users.service.js';

@Module({
  controllers: [UsersController],
  providers: [UsersService, { provide: USERS_REPOSITORY, useClass: PrismaUsersRepository }],
  exports: [UsersService],
})
export class UsersModule {}
