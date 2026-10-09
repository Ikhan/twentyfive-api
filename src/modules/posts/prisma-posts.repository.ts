import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { FollowStatus, PostAudience } from '../../generated/prisma/enums.js';
import { notBlockedWith } from '../../prisma/block-filters.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PHOTOS, toPhotoViews } from './photo-select.js';
import { PhotoAlreadyUsedError } from './posts.errors.js';
import type { AuthorAccess, PostsRepository } from './posts.repository.js';
import type { NewPost, PostCursor, PostScope, PostRecord, QuotedPost } from './posts.types.js';
import type { LinkPreview } from '../links/link-preview.types.js';

const AUTHOR = { id: true, username: true, displayName: true, avatarUrl: true, isPrivate: true } as const;
const DISTRICT = { select: { id: true, name: true, colorFrom: true, colorTo: true } } as const;
const VIDEO = { select: { mediaId: true, url: true, durationSeconds: true, width: true, height: true } } as const;

/** Post fields, plus whether `viewerId` liked or reposted it, and a quoted post with what's needed to check it's visible to them. */
function selectFor(viewerId: string) {
  const mine = { where: { userId: viewerId }, select: { userId: true }, take: 1 } as const;
  return {
    id: true,
    body: true,
    audience: true,
    createdAt: true,
    author: { select: AUTHOR },
    district: DISTRICT,
    photos: PHOTOS,
    video: VIDEO,
    _count: { select: { comments: true, likes: true, reposts: true, quotedBy: true } },
    likes: mine,
    reposts: mine,
    isQuote: true,
    linkPreview: true,
    quotedPost: {
      select: {
        id: true,
        body: true,
        audience: true,
        createdAt: true,
        district: DISTRICT,
        photos: PHOTOS,
        author: {
          select: {
            ...AUTHOR,
            followers: {
              where: { followerId: viewerId, status: FollowStatus.ACCEPTED },
              select: { followerId: true },
              take: 1,
            },
            blocking: { where: { blockedId: viewerId }, select: { blockedId: true }, take: 1 },
            blockedBy: { where: { blockerId: viewerId }, select: { blockerId: true }, take: 1 },
          },
        },
      },
    },
  } as const satisfies Prisma.PostSelect;
}

type Row = Prisma.PostGetPayload<{ select: ReturnType<typeof selectFor> }>;
type DistrictRow = { id: string; name: string; colorFrom: string; colorTo: string } | null;

const toDistrict = (d: DistrictRow) =>
  d && { id: d.id, name: d.name, colors: [d.colorFrom, d.colorTo] as [string, string] };

/** The quoted post, if `viewerId` may see it (the same rule as `visibleTo`), else unavailable. */
function toQuoted(row: Row, viewerId: string): QuotedPost | null {
  if (!row.isQuote) return null;
  const q = row.quotedPost;
  if (!q) return { available: false };
  const { followers, blocking, blockedBy, ...author } = q.author;
  const blocked = blocking.length > 0 || blockedBy.length > 0;
  const visible =
    author.id === viewerId ||
    (!blocked && ((q.audience === PostAudience.EVERYONE && !author.isPrivate) || followers.length > 0));
  if (!visible) return { available: false };
  return {
    available: true,
    id: q.id,
    body: q.body,
    createdAt: q.createdAt,
    author,
    district: toDistrict(q.district),
    photos: toPhotoViews(q.photos),
  };
}

function toView(row: Row, viewerId: string): PostRecord {
  const {
    district,
    _count,
    likes,
    reposts,
    isQuote: _isQuote,
    quotedPost: _quotedPost,
    linkPreview,
    video,
    photos,
    ...post
  } = row;
  return {
    ...post,
    photos: toPhotoViews(photos),
    video: video && {
      id: video.mediaId,
      url: video.url,
      durationSeconds: video.durationSeconds,
      width: video.width,
      height: video.height,
    },
    link: (linkPreview as LinkPreview | null) ?? null,
    district: toDistrict(district),
    counts: { comments: _count.comments, likes: _count.likes, reposts: _count.reposts, quotes: _count.quotedBy },
    viewer: { liked: likes.length > 0, reposted: reposts.length > 0 },
    quoted: toQuoted(row, viewerId),
  };
}

/**
 * Who may see a post: its author; anyone, for EVERYONE posts by public accounts;
 * approved followers, for everything else (followers-only posts and private accounts).
 * Never across a block, in either direction.
 */
export function visibleTo(viewerId: string): Prisma.PostWhereInput {
  return {
    OR: [
      { authorId: viewerId },
      { audience: PostAudience.EVERYONE, author: { isPrivate: false } },
      { author: { followers: { some: { followerId: viewerId, status: FollowStatus.ACCEPTED } } } },
    ],
    author: notBlockedWith(viewerId),
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
    case 'liked':
      return { likes: { some: { userId: viewerId } } };
    case 'media':
      return { authorId: viewerId, OR: [{ photos: { some: {} } }, { video: { isNot: null } }] };
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

  async create({ photos, video, quotedPostId, link, ...post }: NewPost): Promise<PostRecord> {
    try {
      const row = await this.prisma.post.create({
        data: {
          ...post,
          ...(link && { linkPreview: { ...link } }),
          ...(quotedPostId && { isQuote: true, quotedPostId }),
          photos: { create: photos.map((p, position) => ({ ...p, position })) },
          ...(video && { video: { create: video } }),
        },
        select: selectFor(post.authorId),
      });
      return toView(row, post.authorId);
    } catch (error) {
      // Two posts raced for the same photo; the unique index on media_id decided.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new PhotoAlreadyUsedError();
      throw error;
    }
  }

  async findVisible(postId: string, viewerId: string): Promise<PostRecord | null> {
    const row = await this.prisma.post.findFirst({
      where: { AND: [{ id: postId }, visibleTo(viewerId)] },
      select: selectFor(viewerId),
    });
    return row ? toView(row, viewerId) : null;
  }

  async findAuthorId(postId: string): Promise<string | null> {
    return (await this.prisma.post.findUnique({ where: { id: postId }, select: { authorId: true } }))?.authorId ?? null;
  }

  async list(viewerId: string, scope: PostScope, page: { after?: PostCursor; take: number }): Promise<PostRecord[]> {
    const rows = await this.prisma.post.findMany({
      where: { AND: [visibleTo(viewerId), scopeWhere(viewerId, scope), after(page.after)] },
      select: selectFor(viewerId),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: page.take,
    });
    return rows.map((row) => toView(row, viewerId));
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

  findUsersByUsernames(usernames: string[]): Promise<{ id: string; username: string }[]> {
    return this.prisma.user.findMany({
      where: { username: { in: usernames }, onboardedAt: { not: null } },
      select: { id: true, username: true },
    });
  }
}
