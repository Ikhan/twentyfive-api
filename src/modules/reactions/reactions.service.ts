import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DomainEvent, type PostRepostedEvent } from '../../common/events/domain-events.js';
import { PostsService } from '../posts/posts.service.js';
import type { PostView } from '../posts/posts.types.js';
import { CannotRepostError } from './reactions.errors.js';
import { REACTIONS_REPOSITORY, type ReactionsRepository } from './reactions.repository.js';
import type { Reaction } from './reactions.types.js';

/** Reposting shares a post with your followers, so it must already be visible to everyone. */
const isPublic = (post: PostView) => post.audience === 'EVERYONE' && !post.author.isPrivate;

@Injectable()
export class ReactionsService {
  constructor(
    @Inject(REACTIONS_REPOSITORY) private readonly reactions: ReactionsRepository,
    private readonly posts: PostsService,
    private readonly events: EventEmitter2,
  ) {}

  /** Idempotent: reacting twice is the same as once. Returns the post with fresh counts. */
  async add(userId: string, postId: string, kind: Reaction): Promise<PostView> {
    const post = await this.posts.get(postId, userId);
    if (kind === 'repost' && !isPublic(post)) throw new CannotRepostError();
    const added = await this.reactions.add(kind, userId, postId);
    if (added && kind === 'repost') {
      this.events.emit(DomainEvent.PostReposted, {
        postId,
        postAuthorId: post.author.id,
        reposterId: userId,
      } satisfies PostRepostedEvent);
    }
    return this.posts.get(postId, userId);
  }

  /** Idempotent. Returns the post with fresh counts. */
  async remove(userId: string, postId: string, kind: Reaction): Promise<PostView> {
    await this.reactions.remove(kind, userId, postId);
    return this.posts.get(postId, userId);
  }
}
