import { randomUUID } from 'node:crypto';
import type { CommentsRepository } from '../../src/modules/comments/comments.repository.js';
import type {
  CommentCursor,
  CommentOwnership,
  CommentRecord,
  NewComment,
} from '../../src/modules/comments/comments.types.js';

type Stored = Omit<CommentRecord, 'replyCount'> & { postAuthorId: string };

export class InMemoryCommentsRepository implements CommentsRepository {
  readonly comments: Stored[] = [];
  private clock = Date.parse('2026-09-01T00:00:00Z');

  /** Post authors, so ownership checks work without a posts store. */
  constructor(private readonly postAuthorOf: (postId: string) => string = () => 'u-kasun') {}

  async create({
    postId,
    authorId,
    body,
    parentId = null,
    photos = [],
    video = null,
  }: NewComment): Promise<CommentRecord> {
    const stored: Stored = {
      id: randomUUID(),
      postId,
      parentId,
      body,
      createdAt: new Date((this.clock += 60_000)),
      author: { id: authorId, username: authorId, displayName: authorId, avatarUrl: null, isPrivate: false },
      postAuthorId: this.postAuthorOf(postId),
      photos: photos.map((p) => ({
        id: p.mediaId,
        url: p.url,
        width: null,
        height: null,
        placeholder: null,
        sizeBytes: null,
      })),
      video: video && {
        id: video.mediaId,
        url: video.url,
        durationSeconds: video.durationSeconds,
        width: video.width,
        height: video.height,
      },
    };
    this.comments.push(stored);
    return this.record(stored);
  }

  async list(
    postId: string,
    _viewerId: string,
    { after, take, parentId = null }: { after?: CommentCursor; take: number; parentId?: string | null },
  ): Promise<CommentRecord[]> {
    const key = (c: Stored) => `${c.createdAt.toISOString()}|${c.id}`;
    return this.comments
      .filter((c) => c.postId === postId && c.parentId === parentId && (!after || key(c) > `${after.t}|${after.id}`))
      .toSorted((a, b) => key(a).localeCompare(key(b)))
      .slice(0, take)
      .map((c) => this.record(c));
  }

  async findOwnership(commentId: string): Promise<CommentOwnership | null> {
    const c = this.comments.find((x) => x.id === commentId);
    return c
      ? { id: c.id, postId: c.postId, parentId: c.parentId, authorId: c.author.id, postAuthorId: c.postAuthorId }
      : null;
  }

  async delete(commentId: string): Promise<void> {
    // Like ON DELETE CASCADE: its replies go too.
    for (let i = this.comments.length - 1; i >= 0; i--) {
      const c = this.comments[i]!;
      if (c.id === commentId || c.parentId === commentId) this.comments.splice(i, 1);
    }
  }

  private record({ postAuthorId: _p, ...c }: Stored): CommentRecord {
    return { ...c, replyCount: this.comments.filter((r) => r.parentId === c.id).length };
  }
}
