import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Paginated } from '../../common/api-response.js';
import { NotFoundError, ValidationError } from '../../common/errors/app-error.js';
import {
  DomainEvent,
  type DistrictPostCreatedEvent,
  type PostQuotedEvent,
  type UsersMentionedEvent,
} from '../../common/events/domain-events.js';
import { decodeCursor, toPage } from '../../common/pagination/cursor.js';
import { firstLink } from '../../common/text/links.js';
import { mentionedUsernames } from '../../common/text/mentions.js';
import { LinkPreviewsService } from '../links/link-previews.service.js';
import { MediaService } from '../media/media.service.js';
import {
  CannotQuoteError,
  EmptyPostError,
  NotYourPostError,
  PostNotFoundError,
  PrivateAccountError,
} from './posts.errors.js';
import { POSTS_REPOSITORY, type PostsRepository } from './posts.repository.js';
import type { PostAudience, PostCursor, PostRecord, PostScope, PostView } from './posts.types.js';

export const MAX_POST_LENGTH = 1000;
export const MAX_POST_PHOTOS = 4;
const QUOTE_EXCERPT_LENGTH = 120;
/** At most this many people are notified per post or comment, so a mention list can't spam. */
export const MAX_MENTION_NOTIFICATIONS = 10;

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
    @Inject(LinkPreviewsService) private readonly links: Pick<LinkPreviewsService, 'preview'>,
  ) {}

  async create(
    authorId: string,
    /** Leave out `districtId` to post to all districts (shown in feeds, on no district page). */
    input: {
      body?: string;
      districtId?: string;
      audience?: PostAudience;
      mediaIds?: string[];
      /** One POST_VIDEO upload, instead of photos. */
      videoId?: string;
      quotedPostId?: string;
    },
  ): Promise<PostView> {
    const body = input.body?.trim() ?? '';
    const mediaIds = input.mediaIds ?? [];
    if (!body && mediaIds.length === 0 && !input.videoId) throw new EmptyPostError();
    if (input.videoId && mediaIds.length > 0)
      throw new ValidationError('A post can have photos or a video, not both.', { field: 'videoId' });
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
    const [video] = input.videoId ? await this.media.claim(authorId, [input.videoId], 'POST_VIDEO') : [];
    // A card for the first link, like Twitter; photos or a video take its place. Usually cached from the composer.
    const url = photos.length === 0 && !video ? firstLink(body) : null;
    const link = url ? await this.links.preview(url) : null;
    const post = await this.posts.create({
      authorId,
      districtId: input.districtId ?? null,
      body,
      audience: input.audience ?? 'EVERYONE',
      photos: photos.map((p) => ({ mediaId: p.id, url: p.url })),
      video: video?.video ? { mediaId: video.id, url: video.url, ...video.video } : null,
      quotedPostId: quoted?.id ?? null,
      link,
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
    // Only public posts: everyone following the district can see them.
    if (post.district && post.audience === 'EVERYONE' && !post.author.isPrivate) {
      this.events.emit(DomainEvent.DistrictPostCreated, {
        postId: post.id,
        authorId,
        districtId: post.district.id,
        excerpt: body.slice(0, QUOTE_EXCERPT_LENGTH),
      } satisfies DistrictPostCreatedEvent);
    }
    // The quoted author already hears about it as a quote.
    await this.announceMentions(authorId, post.id, body, { skip: quoted ? [quoted.author.id] : [] });
    return this.withMentions(post);
  }

  /**
   * Tells people @mentioned in a new post or comment: real accounts that can see the post, up to
   * MAX_MENTION_NOTIFICATIONS, except the author and anyone in `skip`.
   */
  async announceMentions(
    mentionerId: string,
    postId: string,
    text: string,
    { skip = [], commentId }: { skip?: string[]; commentId?: string } = {},
  ): Promise<void> {
    const usernames = mentionedUsernames(text).slice(0, MAX_MENTION_NOTIFICATIONS);
    if (usernames.length === 0) return;
    const people = (await this.posts.findUsersByUsernames(usernames))
      .filter((u) => u.id !== mentionerId && !skip.includes(u.id))
      .sort((a, b) => usernames.indexOf(a.username) - usernames.indexOf(b.username));
    const canSee = await Promise.all(people.map(async (u) => (await this.posts.findVisible(postId, u.id)) !== null));
    const recipientIds = people.filter((_, i) => canSee[i]).map((u) => u.id);
    if (recipientIds.length === 0) return;
    this.events.emit(DomainEvent.UsersMentioned, {
      mentionerId,
      recipientIds,
      postId,
      commentId,
      excerpt: text.slice(0, QUOTE_EXCERPT_LENGTH),
    } satisfies UsersMentionedEvent);
  }

  /** The @handles in these texts that belong to real accounts (for links). */
  async existingMentions(texts: string[]): Promise<Set<string>> {
    const usernames = [...new Set(texts.flatMap(mentionedUsernames))];
    if (usernames.length === 0) return new Set();
    return new Set((await this.posts.findUsersByUsernames(usernames)).map((u) => u.username));
  }

  private async withMentions(post: PostRecord): Promise<PostView> {
    return (await this.withMentionsAll([post]))[0]!;
  }

  /** One lookup for a whole page of posts. */
  private async withMentionsAll(posts: PostRecord[]): Promise<PostView[]> {
    const texts = (p: PostRecord) => [p.body, p.quoted?.available ? p.quoted.body : ''];
    const known = await this.existingMentions(posts.flatMap(texts));
    return posts.map((p) => ({
      ...p,
      mentions: [...new Set(texts(p).flatMap(mentionedUsernames))].filter((u) => known.has(u)),
    }));
  }

  /** A post you can quote: one you can see, and public (like reposts: quoting shares it further). */
  private async quotable(postId: string, quoterId: string): Promise<PostRecord> {
    const post = await this.posts.findVisible(postId, quoterId);
    if (!post) throw new PostNotFoundError();
    if (post.audience !== 'EVERYONE' || post.author.isPrivate) throw new CannotQuoteError();
    return post;
  }

  async get(postId: string, viewerId: string): Promise<PostView> {
    const post = await this.posts.findVisible(postId, viewerId);
    if (!post) throw new PostNotFoundError();
    return this.withMentions(post);
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

  /** Your Likes tab: posts you liked that you can still see. Only ever your own (Twitter keeps likes private). */
  myLikes(viewerId: string, page: PageInput): Promise<Paginated<PostView>> {
    return this.list(viewerId, { kind: 'liked' }, page);
  }

  /** Your Media tab: your own posts with photos or a video. */
  myMedia(viewerId: string, page: PageInput): Promise<Paginated<PostView>> {
    return this.list(viewerId, { kind: 'media' }, page);
  }

  private async list(viewerId: string, scope: PostScope, page: PageInput): Promise<Paginated<PostView>> {
    const after = decodeCursor(page.cursor, isCursor);
    const rows = await this.withMentionsAll(await this.posts.list(viewerId, scope, { after, take: page.limit + 1 }));
    return toPage(
      rows,
      page.limit,
      (p) => p,
      (p): PostCursor => ({ t: p.createdAt.toISOString(), id: p.id }),
    );
  }
}
