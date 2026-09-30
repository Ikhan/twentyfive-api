import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  DomainEvent,
  type CommentCreatedEvent,
  type FollowAcceptedEvent,
  type FollowCreatedEvent,
  type PostQuotedEvent,
  type PostRepostedEvent,
  type UserBlockedEvent,
  type UsersMentionedEvent,
} from '../../common/events/domain-events.js';
import { NotificationsService } from './notifications.service.js';

/**
 * Turns domain events into notifications. Notifications are best-effort: a failure here is
 * logged and never fails the action that caused it (the follow, comment or repost still happened).
 */
@Injectable()
export class NotificationsListener {
  private readonly logger = new Logger(NotificationsListener.name);

  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent(DomainEvent.FollowCreated, { promisify: true })
  onFollowCreated(e: FollowCreatedEvent): Promise<void> {
    return this.safely(DomainEvent.FollowCreated, () =>
      this.notifications.notify({
        recipientId: e.followeeId,
        actorId: e.followerId,
        type: e.status === 'PENDING' ? 'FOLLOW_REQUEST' : 'FOLLOW',
      }),
    );
  }

  @OnEvent(DomainEvent.FollowAccepted, { promisify: true })
  onFollowAccepted(e: FollowAcceptedEvent): Promise<void> {
    return this.safely(DomainEvent.FollowAccepted, async () => {
      await this.notifications.clearFollowRequest(e.followeeId, e.followerId);
      await this.notifications.notify({ recipientId: e.followerId, actorId: e.followeeId, type: 'FOLLOW_ACCEPTED' });
    });
  }

  @OnEvent(DomainEvent.CommentCreated, { promisify: true })
  onCommentCreated(e: CommentCreatedEvent): Promise<void> {
    return this.safely(DomainEvent.CommentCreated, () =>
      this.notifications.notify({
        recipientId: e.postAuthorId,
        actorId: e.commenterId,
        type: 'COMMENT',
        postId: e.postId,
        commentId: e.commentId,
        excerpt: e.excerpt,
      }),
    );
  }

  @OnEvent(DomainEvent.PostReposted, { promisify: true })
  onPostReposted(e: PostRepostedEvent): Promise<void> {
    return this.safely(DomainEvent.PostReposted, () =>
      this.notifications.notify({
        recipientId: e.postAuthorId,
        actorId: e.reposterId,
        type: 'REPOST',
        postId: e.postId,
      }),
    );
  }

  /** "Kasun quoted your post": links to the quote, previewing what they said. */
  @OnEvent(DomainEvent.PostQuoted, { promisify: true })
  onPostQuoted(e: PostQuotedEvent): Promise<void> {
    return this.safely(DomainEvent.PostQuoted, () =>
      this.notifications.notify({
        recipientId: e.quotedAuthorId,
        actorId: e.quoterId,
        type: 'QUOTE',
        postId: e.postId,
        excerpt: e.excerpt,
      }),
    );
  }

  /** "Kasun mentioned you": links to the post, previewing the post or comment text. */
  @OnEvent(DomainEvent.UsersMentioned, { promisify: true })
  onUsersMentioned(e: UsersMentionedEvent): Promise<void> {
    return this.safely(DomainEvent.UsersMentioned, async () => {
      for (const recipientId of e.recipientIds) {
        await this.notifications.notify({
          recipientId,
          actorId: e.mentionerId,
          type: 'MENTION',
          postId: e.postId,
          commentId: e.commentId,
          excerpt: e.excerpt,
        });
      }
    });
  }

  @OnEvent(DomainEvent.UserBlocked, { promisify: true })
  onUserBlocked(e: UserBlockedEvent): Promise<void> {
    return this.safely(DomainEvent.UserBlocked, () => this.notifications.clearBetween(e.blockerId, e.blockedId));
  }

  private async safely(event: string, work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (error) {
      this.logger.error(`Could not record notification for ${event}`, error instanceof Error ? error.stack : error);
    }
  }
}
