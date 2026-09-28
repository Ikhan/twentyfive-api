import { InMemoryNotificationsRepository } from '../../../test/fakes/notifications-fakes.js';
import { ValidationError } from '../../common/errors/app-error.js';
import { NotificationNotFoundError } from './notifications.errors.js';
import { NotificationsService } from './notifications.service.js';

function setup() {
  const repo = new InMemoryNotificationsRepository();
  return { repo, service: new NotificationsService(repo) };
}

describe('NotificationsService', () => {
  it('never notifies people about their own actions', async () => {
    const { repo, service } = setup();
    await service.notify({ recipientId: 'kasun', actorId: 'kasun', type: 'REPOST', postId: 'p1' });
    expect(repo.stored).toEqual([]);
  });

  it('does not repeat an unread follow or repost, but does once it has been read', async () => {
    const { repo, service } = setup();
    const follow = { recipientId: 'kasun', actorId: 'arun', type: 'FOLLOW' } as const;
    await service.notify(follow);
    await service.notify(follow);
    expect(repo.stored).toHaveLength(1);
    await service.markAllRead('kasun');
    await service.notify(follow);
    expect(repo.stored).toHaveLength(2);
  });

  it('keeps every comment', async () => {
    const { repo, service } = setup();
    const comment = { recipientId: 'kasun', actorId: 'arun', type: 'COMMENT', postId: 'p1' } as const;
    await service.notify({ ...comment, commentId: 'c1', excerpt: 'one' });
    await service.notify({ ...comment, commentId: 'c2', excerpt: 'two' });
    expect(repo.stored).toHaveLength(2);
  });

  it('clears an answered follow request', async () => {
    const { repo, service } = setup();
    await service.notify({ recipientId: 'sachini', actorId: 'arun', type: 'FOLLOW_REQUEST' });
    await service.notify({ recipientId: 'sachini', actorId: 'kasun', type: 'FOLLOW_REQUEST' });
    await service.clearFollowRequest('sachini', 'arun');
    expect(repo.stored.map((n) => n.actorId)).toEqual(['kasun']);
  });

  it('lists newest first with paging, counts unread and marks read', async () => {
    const { service } = setup();
    for (const actorId of ['a', 'b', 'c']) await service.notify({ recipientId: 'kasun', actorId, type: 'FOLLOW' });
    await service.notify({ recipientId: 'arun', actorId: 'a', type: 'FOLLOW' });

    const first = await service.list('kasun', { limit: 2 });
    expect(first.items.map((n) => n.actor.id)).toEqual(['c', 'b']);
    const second = await service.list('kasun', { limit: 2, cursor: first.meta.nextCursor! });
    expect(second.items.map((n) => n.actor.id)).toEqual(['a']);
    expect(second.meta.nextCursor).toBeNull();

    expect(await service.unreadCount('kasun')).toEqual({ count: 3 });
    await service.markRead('kasun', first.items[0]!.id);
    expect(await service.unreadCount('kasun')).toEqual({ count: 2 });
    await expect(service.markRead('arun', first.items[1]!.id)).rejects.toThrow(NotificationNotFoundError);
    await service.markAllRead('kasun');
    expect(await service.unreadCount('kasun')).toEqual({ count: 0 });
    expect(await service.unreadCount('arun')).toEqual({ count: 1 });
  });

  it('rejects a tampered cursor', async () => {
    const bad = Buffer.from('{"t":"x","id":1}').toString('base64url');
    await expect(setup().service.list('kasun', { limit: 2, cursor: bad })).rejects.toThrow(ValidationError);
  });
});
