import { EventEmitter2 } from '@nestjs/event-emitter';
import { InMemoryFollowsRepository } from '../../../test/fakes/follows-fakes.js';
import { FakeBlockChecker } from '../../../test/fakes/moderation-fakes.js';
import { DomainEvent } from '../../common/events/domain-events.js';
import {
  BlockedFollowError,
  CannotFollowSelfError,
  NoFollowRequestError,
  PrivateConnectionsError,
  UserNotFoundError,
} from './follows.errors.js';
import { FollowsListener } from './follows.listener.js';
import { FollowsService } from './follows.service.js';
import type { SuggestionRow } from './follows.types.js';

function setup() {
  const repo = new InMemoryFollowsRepository();
  const events = new EventEmitter2();
  const created: unknown[] = [];
  const accepted: unknown[] = [];
  events.on(DomainEvent.FollowCreated, (e) => created.push(e));
  events.on(DomainEvent.FollowAccepted, (e) => accepted.push(e));
  const blocks = new FakeBlockChecker();
  return { repo, events, created, accepted, blocks, service: new FollowsService(repo, events, blocks) };
}

describe('FollowsService', () => {
  it('follows public accounts immediately, idempotently, announcing it once', async () => {
    const { service, created } = setup();
    await expect(service.follow('u-kasun', 'Tharushi')).resolves.toEqual({
      followers: 1,
      following: 0,
      relationship: 'following',
      followsYou: false,
    });
    await service.follow('u-kasun', 'tharushi');
    expect(created).toEqual([{ followerId: 'u-kasun', followeeId: 'u-tharushi', status: 'ACCEPTED' }]);
  });

  it('sends a request to private accounts', async () => {
    const { service, created } = setup();
    await expect(service.follow('u-kasun', 'sachini')).resolves.toMatchObject({
      followers: 0,
      relationship: 'requested',
    });
    expect(created).toEqual([{ followerId: 'u-kasun', followeeId: 'u-sachini', status: 'PENDING' }]);
  });

  it('refuses self-follows and unknown users', async () => {
    const { service } = setup();
    await expect(service.follow('u-kasun', 'kasun')).rejects.toBeInstanceOf(CannotFollowSelfError);
    await expect(service.follow('u-kasun', 'nobody')).rejects.toBeInstanceOf(UserNotFoundError);
  });

  it('unfollows and cancels requests idempotently', async () => {
    const { service } = setup();
    await service.follow('u-kasun', 'tharushi');
    await service.follow('u-kasun', 'sachini');
    await expect(service.unfollow('u-kasun', 'tharushi')).resolves.toMatchObject({
      followers: 0,
      relationship: 'none',
    });
    await expect(service.unfollow('u-kasun', 'sachini')).resolves.toMatchObject({ relationship: 'none' });
    await expect(service.unfollow('u-kasun', 'sachini')).resolves.toMatchObject({ relationship: 'none' });
  });

  it('reports stats: self, followsYou and counts', async () => {
    const { service } = setup();
    await service.follow('u-tharushi', 'kasun');
    await service.follow('u-kasun', 'tharushi');
    await expect(service.stats('u-kasun', 'kasun')).resolves.toEqual({
      followers: 1,
      following: 1,
      relationship: 'self',
      followsYou: false,
    });
    await expect(service.stats('u-kasun', 'tharushi')).resolves.toEqual({
      followers: 1,
      following: 1,
      relationship: 'following',
      followsYou: true,
    });
  });

  it('pages followers and following of public accounts', async () => {
    const { service } = setup();
    await service.follow('u-kasun', 'tharushi');
    await service.follow('u-dilan', 'tharushi');
    const first = await service.followers('u-kasun', 'tharushi', { limit: 1 });
    expect(first.items.map((u) => u.username)).toEqual(['dilan']);
    const second = await service.followers('u-kasun', 'tharushi', { limit: 1, cursor: first.meta.nextCursor! });
    expect(second.items.map((u) => u.username)).toEqual(['kasun']);
    expect(second.meta.nextCursor).toBeNull();
    expect((await service.following('u-tharushi', 'kasun', { limit: 10 })).items.map((u) => u.username)).toEqual([
      'tharushi',
    ]);
  });

  it('hides a private account’s connections from non-followers only', async () => {
    const { service } = setup();
    await expect(service.followers('u-kasun', 'sachini', { limit: 10 })).rejects.toBeInstanceOf(
      PrivateConnectionsError,
    );
    await expect(service.following('u-sachini', 'sachini', { limit: 10 })).resolves.toMatchObject({ items: [] });
    await service.follow('u-kasun', 'sachini');
    await expect(service.followers('u-kasun', 'sachini', { limit: 10 })).rejects.toBeInstanceOf(
      PrivateConnectionsError,
    );
    await service.acceptRequest('u-sachini', 'kasun');
    await expect(service.followers('u-kasun', 'sachini', { limit: 10 })).resolves.toMatchObject({
      items: [{ username: 'kasun' }],
    });
  });

  it('accepts and declines requests, announcing acceptances', async () => {
    const { service, accepted } = setup();
    await service.follow('u-kasun', 'sachini');
    await service.follow('u-dilan', 'sachini');
    expect((await service.requests('u-sachini', { limit: 10 })).items.map((u) => u.username)).toEqual([
      'dilan',
      'kasun',
    ]);

    await service.acceptRequest('u-sachini', 'kasun');
    expect(accepted).toEqual([{ followerId: 'u-kasun', followeeId: 'u-sachini' }]);
    await service.declineRequest('u-sachini', 'dilan');
    expect((await service.requests('u-sachini', { limit: 10 })).items).toEqual([]);
    await expect(service.stats('u-kasun', 'sachini')).resolves.toMatchObject({
      relationship: 'following',
      followers: 1,
    });

    await expect(service.acceptRequest('u-sachini', 'dilan')).rejects.toBeInstanceOf(NoFollowRequestError);
    await expect(service.declineRequest('u-sachini', 'kasun')).rejects.toBeInstanceOf(NoFollowRequestError);
  });

  it('approves every pending request when the account goes public (via the listener)', async () => {
    const { service, accepted } = setup();
    await service.follow('u-kasun', 'sachini');
    await service.follow('u-dilan', 'sachini');
    const listener = new FollowsListener(service);
    await listener.onPrivacyChanged({ userId: 'u-sachini', isPrivate: true });
    expect(accepted).toEqual([]);
    await listener.onPrivacyChanged({ userId: 'u-sachini', isPrivate: false });
    expect(accepted).toHaveLength(2);
    await expect(service.stats('u-kasun', 'sachini')).resolves.toMatchObject({ followers: 2 });
  });

  describe('blocks', () => {
    it('refuses to follow across a block, either way', async () => {
      const { service, blocks, created } = setup();
      blocks.pairs.add('u-tharushi>u-kasun');
      await expect(service.follow('u-kasun', 'tharushi')).rejects.toThrow(BlockedFollowError);
      blocks.pairs.clear();
      blocks.pairs.add('u-kasun>u-tharushi');
      await expect(service.follow('u-kasun', 'tharushi')).rejects.toThrow(BlockedFollowError);
      expect(created).toEqual([]);
    });

    it('removes follows and requests both ways when someone blocks', async () => {
      const { service, repo } = setup();
      await service.follow('u-kasun', 'sachini');
      await service.follow('u-sachini', 'kasun');
      expect(repo.edges.size).toBe(2);
      await new FollowsListener(service).onUserBlocked({ blockerId: 'u-sachini', blockedId: 'u-kasun' });
      expect(repo.edges.size).toBe(0);
    });
  });

  describe('suggestions', () => {
    const row = (username: string, signals: Partial<SuggestionRow> = {}): SuggestionRow => ({
      id: `u-${username}`,
      username,
      displayName: username,
      avatarUrl: null,
      isPrivate: false,
      followsYou: false,
      mutualCount: 0,
      mutualUsernames: [],
      hometown: { id: 'kandy', name: 'Kandy' },
      sameHometown: false,
      fromFollowedDistrict: false,
      ...signals,
    });

    it('keeps the ranking and gives each person the most convincing reason', async () => {
      const { service, repo } = setup();
      repo.suggestionRows.push(
        row('a', { followsYou: true, mutualCount: 2, sameHometown: true }),
        row('b', { mutualCount: 3, mutualUsernames: ['dilan', 'tharushi'], sameHometown: true }),
        row('c', { sameHometown: true, fromFollowedDistrict: true }),
        row('d', { fromFollowedDistrict: true }),
        row('e', { hometown: null }),
      );
      const people = await service.suggestions('u-kasun', 10);
      expect(people.map((p) => [p.username, p.reason])).toEqual([
        ['a', { kind: 'follows-you' }],
        ['b', { kind: 'followed-by', usernames: ['dilan', 'tharushi'], count: 3 }],
        ['c', { kind: 'hometown', district: { id: 'kandy', name: 'Kandy' } }],
        ['d', { kind: 'followed-district', district: { id: 'kandy', name: 'Kandy' } }],
        ['e', null],
      ]);
      // Only the summary and the reason leave the service, not the raw signals.
      expect(Object.keys(people[0]!).sort()).toEqual([
        'avatarUrl',
        'displayName',
        'id',
        'isPrivate',
        'reason',
        'username',
      ]);
      expect(await service.suggestions('u-kasun', 2)).toHaveLength(2);
    });
  });
});
