import { InMemoryDistrictsRepository } from '../../../test/fakes/districts-fakes.js';
import { ConflictError, NotFoundError, ValidationError } from '../../common/errors/app-error.js';
import { Province } from '../../generated/prisma/enums.js';
import { DistrictsService } from './districts.service.js';

function setup() {
  const repo = new InMemoryDistrictsRepository();
  return { repo, service: new DistrictsService(repo) };
}

const person = (username: string, hometownId = 'kandy') => ({
  id: username,
  username,
  displayName: username,
  avatarUrl: null,
  isPrivate: false,
  hometownId,
});

describe('DistrictsService', () => {
  it('lists districts as summaries with province names and colours', async () => {
    const all = await setup().service.list();
    expect(all.map((d) => d.id)).toEqual(['ampara', 'kandy', 'matale']);
    expect(all[1]).toEqual({
      id: 'kandy',
      name: 'Kandy',
      nameSi: 'Kandy-si',
      nameTa: 'Kandy-ta',
      province: { id: 'CENTRAL', name: 'Central' },
      tagline: 'Kandy tagline',
      colors: ['#000000', '#ffffff'],
      followerCount: 0,
      followedByMe: false,
      notifying: false,
    });
    expect((await setup().service.list(Province.CENTRAL)).map((d) => d.id)).toEqual(['kandy', 'matale']);
  });

  it('lists each district’s follower count, and which ones the viewer follows', async () => {
    const { service, repo } = setup();
    await repo.follow('u1', 'kandy');
    await repo.follow('u2', 'kandy');
    await repo.follow('u2', 'ampara');
    const list = await service.list(undefined, 'u1');
    expect(list.map((d) => [d.id, d.followerCount, d.followedByMe])).toEqual([
      ['ampara', 1, false],
      ['kandy', 2, true],
      ['matale', 0, false],
    ]);
    // Signed out: counts, but nothing followed.
    expect((await service.list()).every((d) => !d.followedByMe)).toBe(true);
  });

  it('returns detail with follower count and the viewer’s follow state', async () => {
    const { service, repo } = setup();
    await repo.follow('u1', 'kandy');
    await repo.follow('u2', 'kandy');
    await expect(service.detail('kandy', 'u1')).resolves.toMatchObject({
      description: 'Kandy description',
      famousFor: ['Something'],
      followerCount: 2,
      followedByMe: true,
    });
    await expect(service.detail('kandy', 'u3')).resolves.toMatchObject({ followerCount: 2, followedByMe: false });
    await expect(service.detail('kandy')).resolves.toMatchObject({ followedByMe: false });
  });

  it('404s for unknown districts on every operation', async () => {
    const { service } = setup();
    await expect(service.detail('atlantis')).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.follow('u1', 'atlantis')).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.unfollow('u1', 'atlantis')).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.residents('atlantis', { limit: 20 })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('follows and unfollows idempotently, returning the new state', async () => {
    const { service } = setup();
    const following = { followerCount: 1, followedByMe: true, notifying: false };
    const notFollowing = { followerCount: 0, followedByMe: false, notifying: false };
    await expect(service.follow('u1', 'kandy')).resolves.toEqual(following);
    await expect(service.follow('u1', 'kandy')).resolves.toEqual(following);
    await expect(service.unfollow('u1', 'kandy')).resolves.toEqual(notFollowing);
    await expect(service.unfollow('u1', 'kandy')).resolves.toEqual(notFollowing);
  });

  describe('post notifications (the bell)', () => {
    it('are off when you follow, and turn on and off idempotently', async () => {
      const { service } = setup();
      await service.follow('u1', 'kandy');
      await expect(service.detail('kandy', 'u1')).resolves.toMatchObject({ notifying: false });
      await expect(service.setNotifications('u1', 'kandy', true)).resolves.toEqual({
        followerCount: 1,
        followedByMe: true,
        notifying: true,
      });
      await expect(service.setNotifications('u1', 'kandy', true)).resolves.toMatchObject({ notifying: true });
      await expect(service.detail('kandy', 'u1')).resolves.toMatchObject({ notifying: true });
      await expect(service.detail('kandy', 'u2')).resolves.toMatchObject({ notifying: false });
      await expect(service.setNotifications('u1', 'kandy', false)).resolves.toMatchObject({ notifying: false });
    });

    it('need you to follow the district first', async () => {
      const { service } = setup();
      await expect(service.setNotifications('u1', 'kandy', true)).rejects.toBeInstanceOf(ConflictError);
      await expect(service.setNotifications('u1', 'atlantis', true)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('go off when you unfollow, and stay off if you follow again', async () => {
      const { service } = setup();
      await service.follow('u1', 'kandy');
      await service.setNotifications('u1', 'kandy', true);
      await service.unfollow('u1', 'kandy');
      await expect(service.follow('u1', 'kandy')).resolves.toMatchObject({ notifying: false });
    });

    it('show in the Explore list for districts you have the bell on for', async () => {
      const { service } = setup();
      await service.follow('u1', 'kandy');
      await service.follow('u1', 'ampara');
      await service.setNotifications('u1', 'kandy', true);
      const list = await service.list(undefined, 'u1');
      expect(list.map((d) => [d.id, d.notifying])).toEqual([
        ['ampara', false],
        ['kandy', true],
        ['matale', false],
      ]);
    });
  });

  it('pages through residents in username order', async () => {
    const { service, repo } = setup();
    repo.people.push(person('chamari'), person('arun'), person('dilan'), person('bala'), person('elsewhere', 'galle'));
    const first = await service.residents('kandy', { limit: 2 });
    expect(first.items.map((u) => u.username)).toEqual(['arun', 'bala']);
    const second = await service.residents('kandy', { limit: 2, cursor: first.meta.nextCursor! });
    expect(second.items.map((u) => u.username)).toEqual(['chamari', 'dilan']);
    expect(second.meta.nextCursor).toBeNull();
  });

  describe('trending', () => {
    const HOUR = 3_600_000;
    const ago = (hours: number) => new Date(Date.now() - hours * HOUR);
    const post = (districtId: string, hoursAgo = 1) => ({ districtId, weight: 3, at: ago(hoursAgo), post: true });
    const like = (districtId: string, hoursAgo = 1) => ({ districtId, weight: 1, at: ago(hoursAgo), post: false });

    afterEach(() => vi.useRealTimers());

    it('ranks districts by today’s weighted activity, with how many posts they had', async () => {
      const { service, repo } = setup();
      repo.events.push(post('kandy'), post('ampara'), post('ampara'), like('kandy'));
      const trending = await service.trending(5);
      expect(trending.slice(0, 2).map((d) => [d.id, d.postCount, d.window])).toEqual([
        ['ampara', 2, 'day'],
        ['kandy', 1, 'day'],
      ]);
      expect(trending[0]).toMatchObject({ name: 'Ampara', colors: ['#000000', '#ffffff'], followerCount: 0 });
    });

    it('prefers recent activity: a fresh post beats an older one', async () => {
      const { service, repo } = setup();
      repo.events.push(post('kandy', 20), like('kandy', 20), post('ampara', 0.5));
      expect((await service.trending(2)).map((d) => d.id)).toEqual(['ampara', 'kandy']);
    });

    it('ignores districts below the activity threshold, then falls back to this week, then followers', async () => {
      const { service, repo } = setup();
      repo.events.push(like('ampara'), post('kandy', 48), post('kandy', 50));
      await repo.follow('u1', 'matale');
      const trending = await service.trending(3);
      expect(trending.map((d) => [d.id, d.window, d.postCount])).toEqual([
        ['kandy', 'week', 2],
        ['matale', null, 0], // 1 follower
        ['ampara', null, 0], // a single like isn’t trending
      ]);
      expect(trending[1]!.followerCount).toBe(1);
    });

    it('always fills the list, even with no activity at all', async () => {
      expect((await setup().service.trending(5)).map((d) => d.id)).toEqual(['ampara', 'kandy', 'matale']);
    });

    it('caches the ranking for a few minutes', async () => {
      vi.useFakeTimers();
      const { service, repo } = setup();
      repo.events.push(post('kandy'), post('kandy'));
      expect((await service.trending(1))[0]!.id).toBe('kandy');
      repo.events.push(post('ampara'), post('ampara'), post('ampara'));
      expect((await service.trending(1))[0]!.id).toBe('kandy');
      vi.advanceTimersByTime(6 * 60_000);
      expect((await service.trending(1))[0]!.id).toBe('ampara');
    });
  });

  it('rejects invalid cursors', async () => {
    await expect(setup().service.residents('kandy', { limit: 2, cursor: 'garbage' })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});
