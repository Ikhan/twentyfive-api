import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { FollowStatus, PostAudience } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PhotoAlreadyUsedError } from './posts.errors.js';
import type { AuthorAccess, PostsRepository } from './posts.repository.js';
import type { NewPost, PostCursor, PostScope, PostView } from './posts.types.js';

/** Post fields, plus whether `viewerId` liked or reposted it. */
function selectFor(viewerId: string) {
  const mine = { where: { userId: viewerId }, select: { userId: true }, take: 1 } as const;
  return {
    id: true,
    body: true,
    audience: true,
    createdAt: true,
    author: { select: { id: true, username: true, displayName: true, avatarUrl: true, isPrivate: true } },
    district: { select: { id: true, name: true, colorFrom: true, colorTo: true } },
    photos: { select: { id: true, url: true }, orderBy: { position: 'asc' } },
    _count: { select: { comments: true, likes: true, reposts: true } },
    likes: mine,
    reposts: mine,
  } as const satisfies Prisma.PostSelect;
}

type Row = Prisma.PostGetPayload<{ select: ReturnType<typeof selectFor> }>;

function toView({ district: { colorFrom, colorTo, ...district }, _count, likes, reposts, ...row }: Row): PostView {
  return {
    ...row,
    district: { ...district, colors: [colorFrom, colorTo] },
    counts: _count,
    viewer: { liked: likes.length > 0, reposted: reposts.length > 0 },
  };
}

/**
 * Who may see a post: its author; anyone, for EVERYONE posts by public accounts;
 * approved followers, for everything else (followers-only posts and private accounts).
 */
export function visibleTo(viewerId: string): Prisma.PostWhereInput {
  return {
    OR: [
      { authorId: viewerId },
      { audience: PostAudience.EVERYONE, author: { isPrivate: false } },
      { author: { followers: { some: { followerId: viewerId, status: FollowStatus.ACCEPTED } } } },
    ],
  };
}

function scopeWhere(viewerId: string, scope: PostScope): Prisma.PostWhereInput {
  switch (scope.kind) {
    case 'everything':
      return {};
    case 'district':
      return { districtId: scope.districtId };
    case 'author':
      return { authorId: scope.authorId };
    case 'following':
      // People you follow, districts you follow, and your own posts.
      return {
        OR: [
          { authorId: viewerId },
          { author: { followers: { some: { followerId: viewerId, status: FollowStatus.ACCEPTED } } } },
          { district: { followers: { some: { userId: viewerId } } } },
        ],
      };
  }
}

/** Keyset pagination on (createdAt desc, id desc): stable even when new posts arrive. */
function after(cursor?: PostCursor): Prisma.PostWhereInput {
  if (!cursor) return {};
  const t = new Date(cursor.t);
  return { OR: [{ createdAt: { lt: t } }, { createdAt: t, id: { lt: cursor.id } }] };
}

@Injectable()
export class PrismaPostsRepository implements PostsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create({ photos, ...post }: NewPost): Promise<PostView> {
    try {
      const row = await this.prisma.post.create({
        data: { ...post, photos: { create: photos.map((p, position) => ({ ...p, position })) } },
        select: selectFor(post.authorId),
      });
      return toView(row);
    } catch (error) {
      // Two posts raced for the same photo; the unique index on media_id decided.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new PhotoAlreadyUsedError();
      throw error;
    }
  }

  async findVisible(postId: string, viewerId: string): Promise<PostView | null> {
    const row = await this.prisma.post.findFirst({
      where: { AND: [{ id: postId }, visibleTo(viewerId)] },
      select: selectFor(viewerId),
    });
    return row ? toView(row) : null;
  }

  async findAuthorId(postId: string): Promise<string | null> {
    return (await this.prisma.post.findUnique({ where: { id: postId }, select: { authorId: true } }))?.authorId ?? null;
  }

  async list(viewerId: string, scope: PostScope, page: { after?: PostCursor; take: number }): Promise<PostView[]> {
    const rows = await this.prisma.post.findMany({
      where: { AND: [visibleTo(viewerId), scopeWhere(viewerId, scope), after(page.after)] },
      select: selectFor(viewerId),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: page.take,
    });
    return rows.map(toView);
  }

  async delete(postId: string): Promise<void> {
    await this.prisma.post.deleteMany({ where: { id: postId } });
  }

  async districtExists(districtId: string): Promise<boolean> {
    return (await this.prisma.district.count({ where: { id: districtId } })) > 0;
  }

  findAuthor(username: string): Promise<AuthorAccess | null> {
    return this.prisma.user.findUnique({ where: { username }, select: { id: true, username: true, isPrivate: true } });
  }

  async isApprovedFollower(followerId: string, authorId: string): Promise<boolean> {
    const count = await this.prisma.follow.count({
      where: { followerId, followeeId: authorId, status: FollowStatus.ACCEPTED },
    });
    return count > 0;
  }
}
