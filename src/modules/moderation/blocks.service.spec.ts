import { EventEmitter2 } from '@nestjs/event-emitter';
import { InMemoryBlocksRepository } from '../../../test/fakes/moderation-fakes.js';
import { ValidationError } from '../../common/errors/app-error.js';
import { DomainEvent } from '../../common/events/domain-events.js';
import { UserNotFoundError } from '../follows/follows.errors.js';
import { BlocksService } from './blocks.service.js';
import { CannotBlockSelfError } from './moderation.errors.js';

function setup() {
  const repo = new InMemoryBlocksRepository();
  const events = new EventEmitter2();
  const blocked: unknown[] = [];
  events.on(DomainEvent.UserBlocked, (e) => blocked.push(e));
  return { repo, blocked, service: new BlocksService(repo, events) };
}

describe('BlocksService', () => {
  it('blocks idempotently and announces the first block', async () => {
    const { service, blocked } = setup();
    await expect(service.block('u-kasun', 'Arun')).resolves.toEqual({ blocked: true });
    await service.block('u-kasun', 'arun');
    expect(blocked).toEqual([{ blockerId: 'u-kasun', blockedId: 'u-arun' }]);
    expect(await service.isBlockedBetween('u-arun', 'u-kasun')).toBe(true);
  });

  it('unblocks idempotently', async () => {
    const { service } = setup();
    await service.block('u-kasun', 'arun');
    await expect(service.unblock('u-kasun', 'arun')).resolves.toEqual({ blocked: false });
    await service.unblock('u-kasun', 'arun');
    expect(await service.isBlockedBetween('u-kasun', 'u-arun')).toBe(false);
  });

  it('refuses yourself and unknown people', async () => {
    const { service } = setup();
    await expect(service.block('u-kasun', 'kasun')).rejects.toThrow(CannotBlockSelfError);
    await expect(service.block('u-kasun', 'ghost')).rejects.toThrow(UserNotFoundError);
    await expect(service.unblock('u-kasun', 'ghost')).rejects.toThrow(UserNotFoundError);
  });

  it('lists who you blocked by username, a page at a time', async () => {
    const { service } = setup();
    await service.block('u-kasun', 'dilan');
    await service.block('u-kasun', 'arun');
    const first = await service.blocked('u-kasun', { limit: 1 });
    expect(first.items.map((u) => u.username)).toEqual(['arun']);
    const second = await service.blocked('u-kasun', { limit: 1, cursor: first.meta.nextCursor! });
    expect(second.items.map((u) => u.username)).toEqual(['dilan']);
    expect(second.meta.nextCursor).toBeNull();
    await expect(service.blocked('u-kasun', { limit: 1, cursor: 'e30' })).rejects.toThrow(ValidationError);
  });
});
