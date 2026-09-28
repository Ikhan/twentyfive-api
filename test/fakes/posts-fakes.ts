import { randomUUID } from 'node:crypto';
import type { AuthorAccess, PostsRepository } from '../../src/modules/posts/posts.repository.js';
import type { NewPost, PostCursor, PostScope, PostView } from '../../src/modules/posts/posts.types.js';

const AUTHORS: Record<string, AuthorAccess> = {
  'u-kasun': { id: 'u-kasun', username: 'kasun', isPrivate: false },
  'u-sachini': { id: 'u-sachini', username: 'sachini', isPrivate: true },
  'u-arun': { id: 'u-arun', username: 'arun', isPrivate: false },
};

/** Mirrors the SQL visibility rule in memory, for service unit tests. */
export class InMemoryPostsRepository implements PostsRepository {
  readonly posts: PostView[] = [];
  readonly approved = new Set<string>(); // `${follower}>${author}`
  private clock = Date.parse('2026-09-01T00:00:00Z');

  async create({ photos, ...post }: NewPost): Promise<PostView> {
    const author = AUTHORS[post.authorId]!;
    const view: PostView = {
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
      counts: { comments: 0, likes: 0, reposts: 0 },
      viewer: { liked: false, reposted: false },
    };
    this.posts.push(view);
    return view;
  }

  private visible(post: PostView, viewerId: string): boolean {
    return (
      post.author.id === viewerId ||
      (post.audience === 'EVERYONE' && !post.author.isPrivate) ||
      this.approved.has(`${viewerId}>${post.author.id}`)
    );
  }

  async findVisible(postId: string, viewerId: string): Promise<PostView | null> {
    const post = this.posts.find((p) => p.id === postId);
    return post && this.visible(post, viewerId) ? post : null;
  }

  async findAuthorId(postId: string): Promise<string | null> {
    return this.posts.find((p) => p.id === postId)?.author.id ?? null;
  }

  async list(viewerId: string, scope: PostScope, page: { after?: PostCursor; take: number }): Promise<PostView[]> {
    const inScope = (p: PostView) =>
      scope.kind === 'everything' ||
      (scope.kind === 'district' && p.district?.id === scope.districtId) ||
      (scope.kind === 'author' && p.author.id === scope.authorId) ||
      (scope.kind === 'following' && (p.author.id === viewerId || this.approved.has(`${viewerId}>${p.author.id}`)));
    const afterCursor = (p: PostView) =>
      !page.after ||
      p.createdAt < new Date(page.after.t) ||
      (p.createdAt.getTime() === Date.parse(page.after.t) && p.id < page.after.id);
    return [...this.posts]
      .filter((p) => this.visible(p, viewerId) && inScope(p) && afterCursor(p))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, page.take);
  }

  async delete(postId: string): Promise<void> {
    const i = this.posts.findIndex((p) => p.id === postId);
    if (i >= 0) this.posts.splice(i, 1);
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
}
