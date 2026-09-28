import { Logger } from '@nestjs/common';
import { NotificationsListener } from './notifications.listener.js';
import type { NotificationsService } from './notifications.service.js';

function setup() {
  const service = {
    notify: vi.fn().mockResolvedValue(undefined),
    clearFollowRequest: vi.fn().mockResolvedValue(undefined),
  };
  return { service, listener: new NotificationsListener(service as unknown as NotificationsService) };
}

describe('NotificationsListener', () => {
  it('turns follows into follow or follow-request notifications', async () => {
    const { service, listener } = setup();
    await listener.onFollowCreated({ followerId: 'arun', followeeId: 'kasun', status: 'ACCEPTED' });
    await listener.onFollowCreated({ followerId: 'arun', followeeId: 'sachini', status: 'PENDING' });
    expect(service.notify.mock.calls).toEqual([
      [{ recipientId: 'kasun', actorId: 'arun', type: 'FOLLOW' }],
      [{ recipientId: 'sachini', actorId: 'arun', type: 'FOLLOW_REQUEST' }],
    ]);
  });

  it('tells the requester when accepted and clears the request', async () => {
    const { service, listener } = setup();
    await listener.onFollowAccepted({ followerId: 'arun', followeeId: 'sachini' });
    expect(service.clearFollowRequest).toHaveBeenCalledWith('sachini', 'arun');
    expect(service.notify).toHaveBeenCalledWith({ recipientId: 'arun', actorId: 'sachini', type: 'FOLLOW_ACCEPTED' });
  });

  it('notifies post authors about comments and reposts', async () => {
    const { service, listener } = setup();
    await listener.onCommentCreated({
      commentId: 'c1',
      postId: 'p1',
      postAuthorId: 'kasun',
      commenterId: 'arun',
      excerpt: 'Nice',
    });
    await listener.onPostReposted({ postId: 'p1', postAuthorId: 'kasun', reposterId: 'arun' });
    expect(service.notify.mock.calls).toEqual([
      [{ recipientId: 'kasun', actorId: 'arun', type: 'COMMENT', postId: 'p1', commentId: 'c1', excerpt: 'Nice' }],
      [{ recipientId: 'kasun', actorId: 'arun', type: 'REPOST', postId: 'p1' }],
    ]);
  });

  it('logs failures instead of throwing', async () => {
    const { service, listener } = setup();
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    service.notify.mockRejectedValueOnce(new Error('db down')).mockRejectedValueOnce('odd');
    await expect(
      listener.onPostReposted({ postId: 'p1', postAuthorId: 'k', reposterId: 'a' }),
    ).resolves.toBeUndefined();
    await expect(
      listener.onPostReposted({ postId: 'p1', postAuthorId: 'k', reposterId: 'a' }),
    ).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledTimes(2);
    expect(log.mock.calls[0]![0]).toContain('post.reposted');
    log.mockRestore();
  });
});
