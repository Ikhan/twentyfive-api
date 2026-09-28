import { Injectable } from '@nestjs/common';
import { MediaStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { MediaRepository } from './media.repository.js';
import type { MediaPurpose, MediaRecord } from './media.types.js';

const SELECT = {
  id: true,
  ownerId: true,
  purpose: true,
  status: true,
  key: true,
  contentType: true,
  sizeBytes: true,
} as const;

@Injectable()
export class PrismaMediaRepository implements MediaRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(media: Omit<MediaRecord, 'status' | 'sizeBytes'>): Promise<MediaRecord> {
    return this.prisma.media.create({ data: media, select: SELECT });
  }

  findById(id: string): Promise<MediaRecord | null> {
    return this.prisma.media.findUnique({ where: { id }, select: SELECT });
  }

  markReady(id: string, sizeBytes: number): Promise<MediaRecord> {
    return this.prisma.media.update({
      where: { id },
      data: { status: MediaStatus.READY, sizeBytes, readyAt: new Date() },
      select: SELECT,
    });
  }

  findReady(ownerId: string, ids: string[], purpose: MediaPurpose): Promise<MediaRecord[]> {
    return this.prisma.media.findMany({
      // A post photo can only belong to one post, so ones already attached aren't available.
      where: { id: { in: ids }, ownerId, purpose, status: MediaStatus.READY, postPhoto: { is: null } },
      select: SELECT,
    });
  }
}
