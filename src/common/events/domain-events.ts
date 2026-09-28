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
  /** Someone blocked another user (first time only). */
  UserBlocked: 'user.blocked',
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
