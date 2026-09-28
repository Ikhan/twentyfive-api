import type { NewPost, PostCursor, PostScope, PostView } from './posts.types.js';

export interface AuthorAccess {
  id: string;
  username: string;
  isPrivate: boolean;
}

export interface PostsRepository {
  create(post: NewPost): Promise<PostView>;
  /** The post if `viewerId` is allowed to see it, else null. */
  findVisible(postId: string, viewerId: string): Promise<PostView | null>;
  findAuthorId(postId: string): Promise<string | null>;
  /** Newest first, only posts `viewerId` may see, after `cursor`. */
  list(viewerId: string, scope: PostScope, page: { after?: PostCursor; take: number }): Promise<PostView[]>;
  delete(postId: string): Promise<void>;
  districtExists(districtId: string): Promise<boolean>;
  findAuthor(username: string): Promise<AuthorAccess | null>;
  isApprovedFollower(followerId: string, authorId: string): Promise<boolean>;
}

export const POSTS_REPOSITORY = Symbol('POSTS_REPOSITORY');
