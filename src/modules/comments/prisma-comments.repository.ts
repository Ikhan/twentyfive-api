import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { notBlockedWith } from '../../prisma/block-filters.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CommentsRepository } from './comments.repository.js';
import type { CommentCursor, CommentOwnership, CommentRecord, NewComment } from './comments.types.js';

/** Replies are counted like they're listed: none from across a block with the viewer. */
const select = (viewerId: string) =>
  ({
    id: true,
    postId: true,
    parentId: true,
    body: true,
    createdAt: true,
    author: { select: { id: true, username: true, displayName: true, avatarUrl: true, isPrivate: true } },
    _count: { select: { replies: { where: { author: notBlockedWith(viewerId) } } } },
  }) as const satisfies Prisma.CommentSelect;

type Row = Prisma.CommentGetPayload<{ select: ReturnType<typeof select> }>;

const toRecord = ({ _count, ...row }: Row): CommentRecord => ({ ...row, replyCount: _count.replies });

@Injectable()
export class PrismaCommentsRepository implements CommentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: NewComment): Promise<CommentRecord> {
    return toRecord(await this.prisma.comment.create({ data: input, select: select(input.authorId) }));
  }

  async list(
    postId: string,
    viewerId: string,
    { after, take, parentId = null }: { after?: CommentCursor; take: number; parentId?: string | null },
  ): Promise<CommentRecord[]> {
    const t = after && new Date(after.t);
    const rows = await this.prisma.comment.findMany({
      where: {
        author: notBlockedWith(viewerId),
        postId,
        parentId,
        ...(after && { OR: [{ createdAt: { gt: t } }, { createdAt: t, id: { gt: after.id } }] }),
      },
      select: select(viewerId),
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take,
    });
    return rows.map(toRecord);
  }

  async findOwnership(commentId: string): Promise<CommentOwnership | null> {
    const row = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, postId: true, parentId: true, authorId: true, post: { select: { authorId: true } } },
    });
    return row
      ? {
          id: row.id,
          postId: row.postId,
          parentId: row.parentId,
          authorId: row.authorId,
          postAuthorId: row.post.authorId,
        }
      : null;
  }

  async delete(commentId: string): Promise<void> {
    // Replies go with it (ON DELETE CASCADE).
    await this.prisma.comment.deleteMany({ where: { id: commentId } });
  }
}
