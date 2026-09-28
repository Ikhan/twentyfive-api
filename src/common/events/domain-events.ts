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
