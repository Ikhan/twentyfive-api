import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Paginated } from '../../common/api-response.js';
import { NotFoundError, ValidationError } from '../../common/errors/app-error.js';
import { DomainEvent, type PostQuotedEvent } from '../../common/events/domain-events.js';
import { decodeCursor, toPage } from '../../common/pagination/cursor.js';
import { MediaService } from '../media/media.service.js';
import {
  CannotQuoteError,
  EmptyPostError,
  NotYourPostError,
  PostNotFoundError,
  PrivateAccountError,
} from './posts.errors.js';
import { POSTS_REPOSITORY, type PostsRepository } from './posts.repository.js';
import type { PostAudience, PostCursor, PostScope, PostView } from './posts.types.js';

export const MAX_POST_LENGTH = 1000;
export const MAX_POST_PHOTOS = 4;
const QUOTE_EXCERPT_LENGTH = 120;

const isCursor = (v: unknown): v is PostCursor =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as PostCursor).t === 'string' &&
  typeof (v as PostCursor).id === 'string' &&
  !Number.isNaN(Date.parse((v as PostCursor).t));

type PageInput = { cursor?: string; limit: number };

@Injectable()
export class PostsService {
  constructor(
    @Inject(POSTS_REPOSITORY) private readonly posts: PostsRepository,
    private readonly media: MediaService,
    private readonly events: EventEmitter2,
  ) {}

  async create(
    authorId: string,
    /** Leave out `districtId` to post to all districts (shown in feeds, on no district page). */
    input: { body?: string; districtId?: string; audience?: PostAudience; mediaIds?: string[]; quotedPostId?: string },
  ): Promise<PostView> {
    const body = input.body?.trim() ?? '';
    const mediaIds = input.mediaIds ?? [];
    if (!body && mediaIds.length === 0) throw new EmptyPostError();
    if (body.length > MAX_POST_LENGTH)
      throw new ValidationError(`Posts can be up to ${MAX_POST_LENGTH} characters.`, { field: 'body' });
    if (new Set(mediaIds).size > MAX_POST_PHOTOS)
      throw new ValidationError(`You can add up to ${MAX_POST_PHOTOS} photos.`, { field: 'mediaIds' });
    if (input.districtId !== undefined && !(await this.posts.districtExists(input.districtId))) {
      throw new ValidationError(`“${input.districtId}” isn’t one of Sri Lanka’s 25 districts.`, {
        field: 'districtId',
      });
    }
    const quoted = input.quotedPostId ? await this.quotable(input.quotedPostId, authorId) : null;
    const photos = mediaIds.length ? await this.media.claim(authorId, mediaIds, 'POST_PHOTO') : [];
    const post = await this.posts.create({
      authorId,
      districtId: input.districtId ?? null,
      body,
      audience: input.audience ?? 'EVERYONE',
      photos: photos.map((p) => ({ mediaId: p.id, url: p.url })),
      quotedPostId: quoted?.id ?? null,
    });
    if (quoted) {
      this.events.emit(DomainEvent.PostQuoted, {
        postId: post.id,
        quotedPostId: quoted.id,
        quotedAuthorId: quoted.author.id,
        quoterId: authorId,
        excerpt: body.slice(0, QUOTE_EXCERPT_LENGTH),
      } satisfies PostQuotedEvent);
    }
    return post;
  }

  /** A post you can quote: one you can see, and public (like reposts: quoting shares it further). */
  private async quotable(postId: string, quoterId: string): Promise<PostView> {
    const post = await this.posts.findVisible(postId, quoterId);
    if (!post) throw new PostNotFoundError();
    if (post.audience !== 'EVERYONE' || post.author.isPrivate) throw new CannotQuoteError();
    return post;
  }

  async get(postId: string, viewerId: string): Promise<PostView> {
    const post = await this.posts.findVisible(postId, viewerId);
    if (!post) throw new PostNotFoundError();
    return post;
  }

  async delete(postId: string, userId: string): Promise<void> {
    const authorId = await this.posts.findAuthorId(postId);
    if (!authorId) throw new PostNotFoundError();
    if (authorId !== userId) throw new NotYourPostError();
    await this.posts.delete(postId);
  }

  feed(viewerId: string, tab: 'for-you' | 'following', page: PageInput): Promise<Paginated<PostView>> {
    return this.list(viewerId, tab === 'following' ? { kind: 'following' } : { kind: 'everything' }, page);
  }

  async byDistrict(viewerId: string, districtId: string, page: PageInput): Promise<Paginated<PostView>> {
    if (!(await this.posts.districtExists(districtId)))
      throw new NotFoundError(`“${districtId}” isn’t one of Sri Lanka’s 25 districts.`);
    return this.list(viewerId, { kind: 'district', districtId }, page);
  }

  /** A profile's posts. Private accounts: followers only (a clear 403 rather than an empty list). */
  async byAuthor(viewerId: string, username: string, page: PageInput): Promise<Paginated<PostView>> {
    const author = await this.posts.findAuthor(username.toLowerCase());
    if (!author) throw new NotFoundError(`@${username} doesn’t exist.`);
    if (author.isPrivate && author.id !== viewerId && !(await this.posts.isApprovedFollower(viewerId, author.id))) {
      throw new PrivateAccountError(author.username);
    }
    return this.list(viewerId, { kind: 'author', authorId: author.id }, page);
  }

  private async list(viewerId: string, scope: PostScope, page: PageInput): Promise<Paginated<PostView>> {
    const after = decodeCursor(page.cursor, isCursor);
    const rows = await this.posts.list(viewerId, scope, { after, take: page.limit + 1 });
    return toPage(
      rows,
      page.limit,
      (p) => p,
      (p): PostCursor => ({ t: p.createdAt.toISOString(), id: p.id }),
    );
  }
}
