import { randomUUID } from 'node:crypto';
import type { CommentsRepository } from '../../src/modules/comments/comments.repository.js';
import type { CommentCursor, CommentOwnership, CommentView } from '../../src/modules/comments/comments.types.js';

export class InMemoryCommentsRepository implements CommentsRepository {
  readonly comments: (CommentView & { postAuthorId: string })[] = [];
  private clock = Date.parse('2026-09-01T00:00:00Z');

  /** Post authors, so ownership checks work without a posts store. */
  constructor(private readonly postAuthorOf: (postId: string) => string = () => 'u-kasun') {}

  async create({ postId, authorId, body }: { postId: string; authorId: string; body: string }): Promise<CommentView> {
    const view: CommentView = {
      id: randomUUID(),
      postId,
      body,
      createdAt: new Date((this.clock += 60_000)),
      author: { id: authorId, username: authorId, displayName: authorId, avatarUrl: null, isPrivate: false },
    };
    this.comments.push({ ...view, postAuthorId: this.postAuthorOf(postId) });
    return view;
  }

  async list(postId: string, { after, take }: { after?: CommentCursor; take: number }): Promise<CommentView[]> {
    const key = (c: CommentView) => `${c.createdAt.toISOString()}|${c.id}`;
    return this.comments
      .filter((c) => c.postId === postId && (!after || key(c) > `${after.t}|${after.id}`))
      .toSorted((a, b) => key(a).localeCompare(key(b)))
      .slice(0, take)
      .map(({ postAuthorId: _, ...c }) => c);
  }

  async findOwnership(commentId: string): Promise<CommentOwnership | null> {
    const c = this.comments.find((x) => x.id === commentId);
    return c ? { id: c.id, postId: c.postId, authorId: c.author.id, postAuthorId: c.postAuthorId } : null;
  }

  async delete(commentId: string): Promise<void> {
    const i = this.comments.findIndex((c) => c.id === commentId);
    if (i >= 0) this.comments.splice(i, 1);
  }
}
