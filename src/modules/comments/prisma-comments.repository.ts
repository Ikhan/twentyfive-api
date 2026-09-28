import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CommentsRepository } from './comments.repository.js';
import type { CommentCursor, CommentOwnership, CommentView } from './comments.types.js';

const SELECT = {
  id: true,
  postId: true,
  body: true,
  createdAt: true,
  author: { select: { id: true, username: true, displayName: true, avatarUrl: true, isPrivate: true } },
} as const satisfies Prisma.CommentSelect;

@Injectable()
export class PrismaCommentsRepository implements CommentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: { postId: string; authorId: string; body: string }): Promise<CommentView> {
    return this.prisma.comment.create({ data: input, select: SELECT });
  }

  list(postId: string, { after, take }: { after?: CommentCursor; take: number }): Promise<CommentView[]> {
    const t = after && new Date(after.t);
    return this.prisma.comment.findMany({
      where: { postId, ...(after && { OR: [{ createdAt: { gt: t } }, { createdAt: t, id: { gt: after.id } }] }) },
      select: SELECT,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take,
    });
  }

  async findOwnership(commentId: string): Promise<CommentOwnership | null> {
    const row = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, postId: true, authorId: true, post: { select: { authorId: true } } },
    });
    return row ? { id: row.id, postId: row.postId, authorId: row.authorId, postAuthorId: row.post.authorId } : null;
  }

  async delete(commentId: string): Promise<void> {
    await this.prisma.comment.deleteMany({ where: { id: commentId } });
  }
}
