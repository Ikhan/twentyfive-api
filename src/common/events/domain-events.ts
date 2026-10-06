/**
 * Events modules publish when something happens that other modules may care about.
 * Publishers don't know who listens (e.g. follows and notifications), which keeps
 * modules decoupled: add a listener without touching the publisher.
 */
export const DomainEvent = {
  /** A user switched between private and public. */
  UserPrivacyChanged: 'user.privacy-changed',
  /** Someone followed (or requested to follow) a user. */
  FollowCreated: 'follow.created',
  /** A private account approved a follow request. */
  FollowAccepted: 'follow.accepted',
  /** Someone commented on a post. */
  CommentCreated: 'comment.created',
  /** Someone reposted a post (first time only; repeats are no-ops). */
  PostReposted: 'post.reposted',
  /** Someone quoted a post. */
  PostQuoted: 'post.quoted',
  /** A new post or comment @mentioned people who can see it. */
  UsersMentioned: 'users.mentioned',
  /** Someone blocked another user (first time only). */
  UserBlocked: 'user.blocked',
  /** A public post was made in a district (for followers who turned its bell on). */
  DistrictPostCreated: 'district-post.created',
} as const;

export interface UserPrivacyChangedEvent {
  userId: string;
  isPrivate: boolean;
}

export interface FollowCreatedEvent {
  followerId: string;
  followeeId: string;
  status: 'PENDING' | 'ACCEPTED';
}

export interface FollowAcceptedEvent {
  followerId: string;
  followeeId: string;
}

export interface CommentCreatedEvent {
  commentId: string;
  postId: string;
  postAuthorId: string;
  commenterId: string;
  /** First part of the comment, for notification previews. */
  excerpt: string;
  /** Set for replies: the comment answered (a top-level comment or a reply), and who wrote it. */
  repliedTo?: { commentId: string; authorId: string };
}

export interface PostRepostedEvent {
  postId: string;
  postAuthorId: string;
  reposterId: string;
}

export interface UserBlockedEvent {
  blockerId: string;
  blockedId: string;
}

export interface PostQuotedEvent {
  /** The new quote post. */
  postId: string;
  quotedPostId: string;
  quotedAuthorId: string;
  quoterId: string;
  excerpt: string;
}

export interface DistrictPostCreatedEvent {
  postId: string;
  authorId: string;
  districtId: string;
  excerpt: string;
}

export interface UsersMentionedEvent {
  mentionerId: string;
  /** Who to tell: real accounts that can see the post, minus anyone told another way. */
  recipientIds: string[];
  postId: string;
  /** Set when the mention is in a comment on `postId`. */
  commentId?: string;
  excerpt: string;
}
