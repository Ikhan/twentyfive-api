import { Logger } from '@nestjs/common';
import { NotificationsListener } from './notifications.listener.js';
import type { NotificationsService } from './notifications.service.js';

function setup() {
  const service = {
    notify: vi.fn().mockResolvedValue(undefined),
    clearFollowRequest: vi.fn().mockResolvedValue(undefined),
    clearBetween: vi.fn().mockResolvedValue(undefined),
    notifyDistrictFollowers: vi.fn().mockResolvedValue(undefined),
  };
  return { service, listener: new NotificationsListener(service as unknown as NotificationsService) };
}

describe('NotificationsListener', () => {
  it('tells district followers with the bell on about new posts there', async () => {
    const { service, listener } = setup();
    const e = { postId: 'p1', authorId: 'kasun', districtId: 'kandy', excerpt: 'Perahera tonight' };
    await listener.onDistrictPostCreated(e);
    expect(service.notifyDistrictFollowers).toHaveBeenCalledWith(e);
  });

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

  it('tells whoever was replied to, and the post’s author once', async () => {
    const { service, listener } = setup();
    const reply = { commentId: 'c2', postId: 'p1', postAuthorId: 'kasun', commenterId: 'arun', excerpt: 'Yes' };
    await listener.onCommentCreated({ ...reply, repliedTo: { commentId: 'c1', authorId: 'sachini' } });
    const about = { actorId: 'arun', postId: 'p1', commentId: 'c2', excerpt: 'Yes' };
    expect(service.notify.mock.calls).toEqual([
      [{ ...about, recipientId: 'sachini', type: 'REPLY' }],
      [{ ...about, recipientId: 'kasun', type: 'COMMENT' }],
    ]);
    service.notify.mockClear();
    // Replying to the post's author: just the reply.
    await listener.onCommentCreated({ ...reply, repliedTo: { commentId: 'c1', authorId: 'kasun' } });
    expect(service.notify.mock.calls).toEqual([[{ ...about, recipientId: 'kasun', type: 'REPLY' }]]);
  });

  it('clears notifications between people after a block', async () => {
    const { service, listener } = setup();
    await listener.onUserBlocked({ blockerId: 'kasun', blockedId: 'arun' });
    expect(service.clearBetween).toHaveBeenCalledWith('kasun', 'arun');
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

  it('notifies each person mentioned, pointing at the post (and comment)', async () => {
    const { service, listener } = setup();
    await listener.onUsersMentioned({
      mentionerId: 'arun',
      recipientIds: ['kasun', 'sachini'],
      postId: 'p1',
      commentId: 'c1',
      excerpt: '@kasun @sachini hi',
    });
    const mention = { actorId: 'arun', type: 'MENTION', postId: 'p1', commentId: 'c1', excerpt: '@kasun @sachini hi' };
    expect(service.notify.mock.calls).toEqual([
      [{ ...mention, recipientId: 'kasun' }],
      [{ ...mention, recipientId: 'sachini' }],
    ]);
  });
});
