import { Injectable, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Paginated } from '../../common/api-response.js';
import { ValidationError } from '../../common/errors/app-error.js';
import { DomainEvent, type CommentCreatedEvent } from '../../common/events/domain-events.js';
import { decodeCursor, toPage } from '../../common/pagination/cursor.js';
import { mentionedUsernames } from '../../common/text/mentions.js';
import { PostsService } from '../posts/posts.service.js';
import { CannotDeleteCommentError, CommentNotFoundError } from './comments.errors.js';
import { COMMENTS_REPOSITORY, type CommentsRepository } from './comments.repository.js';
import type { CommentCursor, CommentOwnership, CommentRecord, CommentView } from './comments.types.js';

export const MAX_COMMENT_LENGTH = 500;
const EXCERPT_LENGTH = 120;

const isCursor = (v: unknown): v is CommentCursor =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as CommentCursor).t === 'string' &&
  typeof (v as CommentCursor).id === 'string' &&
  !Number.isNaN(Date.parse((v as CommentCursor).t));

@Injectable()
export class CommentsService {
  constructor(
    @Inject(COMMENTS_REPOSITORY) private readonly comments: CommentsRepository,
    private readonly posts: PostsService,
    private readonly events: EventEmitter2,
  ) {}

  /** Top-level comments on a post you can see (PostNotFoundError otherwise), each with its reply count. */
  async list(
    viewerId: string,
    postId: string,
    page: { cursor?: string; limit: number },
  ): Promise<Paginated<CommentView>> {
    await this.posts.get(postId, viewerId);
    const after = decodeCursor(page.cursor, isCursor);
    const rows = await this.withMentions(await this.comments.list(postId, viewerId, { after, take: page.limit + 1 }));
    return toPage(
      rows,
      page.limit,
      (c) => c,
      (c): CommentCursor => ({ t: c.createdAt.toISOString(), id: c.id }),
    );
  }

  /** A comment's replies, oldest first, if you can see its post. */
  async replies(
    viewerId: string,
    commentId: string,
    page: { cursor?: string; limit: number },
  ): Promise<Paginated<CommentView>> {
    const comment = await this.comments.findOwnership(commentId);
    if (!comment) throw new CommentNotFoundError();
    await this.posts.get(comment.postId, viewerId);
    const after = decodeCursor(page.cursor, isCursor);
    const rows = await this.withMentions(
      await this.comments.list(comment.postId, viewerId, { after, take: page.limit + 1, parentId: commentId }),
    );
    return toPage(
      rows,
      page.limit,
      (c) => c,
      (c): CommentCursor => ({ t: c.createdAt.toISOString(), id: c.id }),
    );
  }

  /**
   * Comments on a post, or with `replyToId` replies to a comment on it. Replies stay one level deep:
   * answering a reply joins its top-level comment's thread, but its author is the one told.
   */
  async add(authorId: string, postId: string, rawBody: string, replyToId?: string): Promise<CommentView> {
    const body = rawBody.trim();
    if (!body) throw new ValidationError('Write a comment first.', { field: 'body' });
    if (body.length > MAX_COMMENT_LENGTH)
      throw new ValidationError(`Comments can be up to ${MAX_COMMENT_LENGTH} characters.`, { field: 'body' });
    const post = await this.posts.get(postId, authorId);
    const repliedTo = replyToId ? await this.onPost(postId, replyToId) : null;
    const comment = await this.comments.create({
      postId,
      authorId,
      body,
      parentId: repliedTo ? (repliedTo.parentId ?? repliedTo.id) : null,
    });
    this.events.emit(DomainEvent.CommentCreated, {
      commentId: comment.id,
      postId,
      postAuthorId: post.author.id,
      commenterId: authorId,
      excerpt: body.slice(0, EXCERPT_LENGTH),
      repliedTo: repliedTo ? { commentId: repliedTo.id, authorId: repliedTo.authorId } : undefined,
    } satisfies CommentCreatedEvent);
    // The post's author (and whoever was replied to) already hear about it as a comment or reply.
    await this.posts.announceMentions(authorId, postId, body, {
      skip: [post.author.id, ...(repliedTo ? [repliedTo.authorId] : [])],
      commentId: comment.id,
    });
    return (await this.withMentions([comment]))[0]!;
  }

  private async onPost(postId: string, commentId: string): Promise<CommentOwnership> {
    const comment = await this.comments.findOwnership(commentId);
    if (!comment || comment.postId !== postId) throw new CommentNotFoundError();
    return comment;
  }

  private async withMentions(comments: CommentRecord[]): Promise<CommentView[]> {
    const known = await this.posts.existingMentions(comments.map((c) => c.body));
    return comments.map((c) => ({ ...c, mentions: mentionedUsernames(c.body).filter((u) => known.has(u)) }));
  }

  /** The comment's author or the post's author may delete. Its replies go with it. */
  async remove(userId: string, commentId: string): Promise<void> {
    const comment = await this.comments.findOwnership(commentId);
    if (!comment) throw new CommentNotFoundError();
    if (userId !== comment.authorId && userId !== comment.postAuthorId) throw new CannotDeleteCommentError();
    await this.comments.delete(commentId);
  }
}
