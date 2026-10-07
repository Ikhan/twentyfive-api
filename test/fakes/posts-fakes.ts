import { randomUUID } from 'node:crypto';
import type { AuthorAccess, PostsRepository } from '../../src/modules/posts/posts.repository.js';
import type { LinkPreview } from '../../src/modules/links/link-preview.types.js';
import type { NewPost, PostCursor, PostScope, PostRecord } from '../../src/modules/posts/posts.types.js';

const AUTHORS: Record<string, AuthorAccess> = {
  'u-kasun': { id: 'u-kasun', username: 'kasun', isPrivate: false },
  'u-sachini': { id: 'u-sachini', username: 'sachini', isPrivate: true },
  'u-arun': { id: 'u-arun', username: 'arun', isPrivate: false },
};

/** Mirrors the SQL visibility rule in memory, for service unit tests. */
export class InMemoryPostsRepository implements PostsRepository {
  readonly posts: PostRecord[] = [];
  /** quote post id → quoted post id (null once the quoted post is deleted) */
  readonly quotes = new Map<string, string | null>();
  readonly approved = new Set<string>(); // `${follower}>${author}`
  readonly likes = new Set<string>(); // `${user}>${post id}`
  private clock = Date.parse('2026-09-01T00:00:00Z');

  async create({ photos, video = null, quotedPostId, link = null, ...post }: NewPost): Promise<PostRecord> {
    const author = AUTHORS[post.authorId]!;
    const view: PostRecord = {
      id: randomUUID(),
      body: post.body,
      audience: post.audience,
      createdAt: new Date((this.clock += 60_000)),
      author: {
        id: author.id,
        username: author.username,
        displayName: author.username,
        avatarUrl: null,
        isPrivate: author.isPrivate,
      },
      district: post.districtId ? { id: post.districtId, name: post.districtId, colors: ['#000', '#fff'] } : null,
      photos: photos.map((p) => ({ id: p.mediaId, url: p.url })),
      video: video && {
        id: video.mediaId,
        url: video.url,
        durationSeconds: video.durationSeconds,
        width: video.width,
        height: video.height,
      },
      counts: { comments: 0, likes: 0, reposts: 0, quotes: 0 },
      viewer: { liked: false, reposted: false },
      quoted: null,
      link,
    };
    this.posts.push(view);
    if (quotedPostId) this.quotes.set(view.id, quotedPostId);
    return this.viewFor(view, post.authorId);
  }

  /** The post as `viewerId` sees it: quote counts and the quoted post (if they may see it). */
  private viewFor(post: PostRecord, viewerId: string): PostRecord {
    const quotes = [...this.quotes.values()].filter((id) => id === post.id).length;
    let quoted: PostRecord['quoted'] = null;
    if (this.quotes.has(post.id)) {
      const original = this.posts.find((p) => p.id === this.quotes.get(post.id));
      quoted =
        original && this.visible(original, viewerId)
          ? {
              available: true,
              id: original.id,
              body: original.body,
              createdAt: original.createdAt,
              author: original.author,
              district: original.district,
              photos: original.photos,
            }
          : { available: false };
    }
    return { ...post, counts: { ...post.counts, quotes }, quoted };
  }

  private visible(post: PostRecord, viewerId: string): boolean {
    return (
      post.author.id === viewerId ||
      (post.audience === 'EVERYONE' && !post.author.isPrivate) ||
      this.approved.has(`${viewerId}>${post.author.id}`)
    );
  }

  async findVisible(postId: string, viewerId: string): Promise<PostRecord | null> {
    const post = this.posts.find((p) => p.id === postId);
    return post && this.visible(post, viewerId) ? this.viewFor(post, viewerId) : null;
  }

  async findAuthorId(postId: string): Promise<string | null> {
    return this.posts.find((p) => p.id === postId)?.author.id ?? null;
  }

  async list(viewerId: string, scope: PostScope, page: { after?: PostCursor; take: number }): Promise<PostRecord[]> {
    const inScope = (p: PostRecord) =>
      scope.kind === 'everything' ||
      (scope.kind === 'district' && p.district?.id === scope.districtId) ||
      (scope.kind === 'author' && p.author.id === scope.authorId) ||
      (scope.kind === 'following' && (p.author.id === viewerId || this.approved.has(`${viewerId}>${p.author.id}`))) ||
      (scope.kind === 'liked' && this.likes.has(`${viewerId}>${p.id}`)) ||
      (scope.kind === 'media' && p.author.id === viewerId && (p.photos.length > 0 || p.video !== null));
    const afterCursor = (p: PostRecord) =>
      !page.after ||
      p.createdAt < new Date(page.after.t) ||
      (p.createdAt.getTime() === Date.parse(page.after.t) && p.id < page.after.id);
    return [...this.posts]
      .filter((p) => this.visible(p, viewerId) && inScope(p) && afterCursor(p))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, page.take)
      .map((p) => this.viewFor(p, viewerId));
  }

  async delete(postId: string): Promise<void> {
    const i = this.posts.findIndex((p) => p.id === postId);
    if (i >= 0) this.posts.splice(i, 1);
    // Like the database: quotes of a deleted post keep saying they're quotes.
    for (const [quote, quoted] of this.quotes) if (quoted === postId) this.quotes.set(quote, null);
  }

  async districtExists(districtId: string): Promise<boolean> {
    return ['kandy', 'galle', 'badulla'].includes(districtId);
  }

  async findAuthor(username: string): Promise<AuthorAccess | null> {
    return Object.values(AUTHORS).find((a) => a.username === username) ?? null;
  }

  async isApprovedFollower(followerId: string, authorId: string): Promise<boolean> {
    return this.approved.has(`${followerId}>${authorId}`);
  }

  async findUsersByUsernames(usernames: string[]): Promise<{ id: string; username: string }[]> {
    return Object.values(AUTHORS)
      .filter((a) => usernames.includes(a.username))
      .map(({ id, username }) => ({ id, username }));
  }
}

/** Link cards for service tests: known pages, or none. */
export class FakeLinkPreviews {
  readonly asked: string[] = [];
  constructor(private readonly cards: Record<string, LinkPreview> = {}) {}

  async preview(url: string): Promise<LinkPreview | null> {
    this.asked.push(url);
    return this.cards[url] ?? null;
  }
}
