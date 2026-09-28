import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { NewReport } from './moderation.types.js';
import type { ReportsRepository } from './reports.repository.js';

@Injectable()
export class PrismaReportsRepository implements ReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(report: NewReport): Promise<void> {
    await this.prisma.report.createMany({ data: [report], skipDuplicates: true });
  }

  async commentPostId(commentId: string): Promise<string | null> {
    return (
      (await this.prisma.comment.findUnique({ where: { id: commentId }, select: { postId: true } }))?.postId ?? null
    );
  }

  async userExists(userId: string): Promise<boolean> {
    return (await this.prisma.user.count({ where: { id: userId } })) > 0;
  }
}
