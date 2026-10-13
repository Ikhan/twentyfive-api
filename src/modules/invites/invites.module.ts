import { Module } from '@nestjs/common';
import { AdminService } from './admin.service.js';
import { AdminController, InvitesController, WaitlistController } from './invites.controller.js';
import { ADMIN_REPOSITORY, INVITES_REPOSITORY } from './invites.repository.js';
import { InvitesService } from './invites.service.js';
import { PrismaAdminRepository } from './prisma-admin.repository.js';
import { PrismaInvitesRepository } from './prisma-invites.repository.js';

@Module({
  controllers: [InvitesController, WaitlistController, AdminController],
  providers: [
    InvitesService,
    AdminService,
    { provide: INVITES_REPOSITORY, useClass: PrismaInvitesRepository },
    { provide: ADMIN_REPOSITORY, useClass: PrismaAdminRepository },
  ],
})
export class InvitesModule {}
