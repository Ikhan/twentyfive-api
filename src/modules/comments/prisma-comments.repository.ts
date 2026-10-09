import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { notBlockedWith } from '../../prisma/block-filters.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PHOTOS, toPhotoViews } from '../posts/photo-select.js';
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
    photos: PHOTOS,
    video: { select: { mediaId: true, url: true, durationSeconds: true, width: true, height: true } },
    _count: { select: { replies: { where: { author: notBlockedWith(viewerId) } }, likes: true } },
    likes: { where: { userId: viewerId }, select: { userId: true }, take: 1 },
  }) as const satisfies Prisma.CommentSelect;

type Row = Prisma.CommentGetPayload<{ select: ReturnType<typeof select> }>;

const toRecord = ({ _count, video, photos, likes, ...row }: Row): CommentRecord => ({
  ...row,
  photos: toPhotoViews(photos),
  replyCount: _count.replies,
  likeCount: _count.likes,
  viewer: { liked: likes.length > 0 },
  video: video && {
    id: video.mediaId,
    url: video.url,
    durationSeconds: video.durationSeconds,
    width: video.width,
    height: video.height,
  },
});

@Injectable()
export class PrismaCommentsRepository implements CommentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create({ photos = [], video, ...input }: NewComment): Promise<CommentRecord> {
    const row = await this.prisma.comment.create({
      data: {
        ...input,
        photos: { create: photos.map((p, position) => ({ ...p, position })) },
        ...(video && { video: { create: video } }),
      },
      select: select(input.authorId),
    });
    return toRecord(row);
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

  async find(commentId: string, viewerId: string): Promise<CommentRecord | null> {
    const row = await this.prisma.comment.findFirst({
      where: { id: commentId, author: notBlockedWith(viewerId) },
      select: select(viewerId),
    });
    return row && toRecord(row);
  }

  async setLike(commentId: string, userId: string, on: boolean): Promise<void> {
    if (on) await this.prisma.commentLike.createMany({ data: [{ commentId, userId }], skipDuplicates: true });
    else await this.prisma.commentLike.deleteMany({ where: { commentId, userId } });
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
