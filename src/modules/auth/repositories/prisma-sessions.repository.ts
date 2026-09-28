import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { NewSession, SessionRecord, SessionsRepository } from './sessions.repository.js';

const SELECT = { id: true, userId: true, familyId: true, expiresAt: true, revokedAt: true } as const;

@Injectable()
export class PrismaSessionsRepository implements SessionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(session: NewSession): Promise<SessionRecord> {
    return this.prisma.session.create({ data: session, select: SELECT });
  }

  findByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    return this.prisma.session.findUnique({ where: { tokenHash }, select: SELECT });
  }

  async rotate(oldId: string, next: NewSession): Promise<SessionRecord> {
    const [, created] = await this.prisma.$transaction([
      this.prisma.session.update({ where: { id: oldId }, data: { revokedAt: new Date() } }),
      this.prisma.session.create({ data: next, select: SELECT }),
    ]);
    return created;
  }

  async revoke(id: string): Promise<void> {
    await this.prisma.session.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.session.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
}
