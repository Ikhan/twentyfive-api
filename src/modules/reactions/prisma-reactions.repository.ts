import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PostNotFoundError } from '../posts/posts.errors.js';
import type { ReactionsRepository } from './reactions.repository.js';
import type { Reaction } from './reactions.types.js';

@Injectable()
export class PrismaReactionsRepository implements ReactionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async add(kind: Reaction, userId: string, postId: string): Promise<boolean> {
    const data = [{ userId, postId }];
    try {
      const { count } =
        kind === 'like'
          ? await this.prisma.postLike.createMany({ data, skipDuplicates: true })
          : await this.prisma.repost.createMany({ data, skipDuplicates: true });
      return count > 0;
    } catch (error) {
      // The post was deleted between the visibility check and the insert.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003')
        throw new PostNotFoundError();
      throw error;
    }
  }

  async remove(kind: Reaction, userId: string, postId: string): Promise<void> {
    const where = { userId, postId };
    if (kind === 'like') await this.prisma.postLike.deleteMany({ where });
    else await this.prisma.repost.deleteMany({ where });
  }
}
