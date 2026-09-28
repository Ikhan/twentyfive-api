import { Injectable, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Paginated } from '../../common/api-response.js';
import { ValidationError } from '../../common/errors/app-error.js';
import { DomainEvent, type CommentCreatedEvent } from '../../common/events/domain-events.js';
import { decodeCursor, toPage } from '../../common/pagination/cursor.js';
import { PostsService } from '../posts/posts.service.js';
import { CannotDeleteCommentError, CommentNotFoundError } from './comments.errors.js';
import { COMMENTS_REPOSITORY, type CommentsRepository } from './comments.repository.js';
import type { CommentCursor, CommentView } from './comments.types.js';

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

  /** Comments on a post you can see (PostNotFoundError otherwise). */
  async list(
    viewerId: string,
    postId: string,
    page: { cursor?: string; limit: number },
  ): Promise<Paginated<CommentView>> {
    await this.posts.get(postId, viewerId);
    const after = decodeCursor(page.cursor, isCursor);
    const rows = await this.comments.list(postId, viewerId, { after, take: page.limit + 1 });
    return toPage(
      rows,
      page.limit,
      (c) => c,
      (c): CommentCursor => ({ t: c.createdAt.toISOString(), id: c.id }),
    );
  }

  async add(authorId: string, postId: string, rawBody: string): Promise<CommentView> {
    const body = rawBody.trim();
    if (!body) throw new ValidationError('Write a comment first.', { field: 'body' });
    if (body.length > MAX_COMMENT_LENGTH)
      throw new ValidationError(`Comments can be up to ${MAX_COMMENT_LENGTH} characters.`, { field: 'body' });
    const post = await this.posts.get(postId, authorId);
    const comment = await this.comments.create({ postId, authorId, body });
    this.events.emit(DomainEvent.CommentCreated, {
      commentId: comment.id,
      postId,
      postAuthorId: post.author.id,
      commenterId: authorId,
      excerpt: body.slice(0, EXCERPT_LENGTH),
    } satisfies CommentCreatedEvent);
    return comment;
  }

  /** The comment's author or the post's author may delete. */
  async remove(userId: string, commentId: string): Promise<void> {
    const comment = await this.comments.findOwnership(commentId);
    if (!comment) throw new CommentNotFoundError();
    if (userId !== comment.authorId && userId !== comment.postAuthorId) throw new CannotDeleteCommentError();
    await this.comments.delete(commentId);
  }
}
