import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DomainEvent, type UserBlockedEvent, type UserPrivacyChangedEvent } from '../../common/events/domain-events.js';
import { FollowsService } from './follows.service.js';

@Injectable()
export class FollowsListener {
  constructor(private readonly follows: FollowsService) {}

  /** "Switching to public approves all pending requests." (Settings) */
  @OnEvent(DomainEvent.UserPrivacyChanged, { promisify: true })
  async onPrivacyChanged(event: UserPrivacyChangedEvent): Promise<void> {
    if (!event.isPrivate) await this.follows.approveAllRequests(event.userId);
  }

  /** Blocking removes follows (and pending requests) in both directions. */
  @OnEvent(DomainEvent.UserBlocked, { promisify: true })
  async onUserBlocked(event: UserBlockedEvent): Promise<void> {
    await this.follows.severBetween(event.blockerId, event.blockedId);
  }
}
