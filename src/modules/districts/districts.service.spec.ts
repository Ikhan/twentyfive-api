import { InMemoryDistrictsRepository } from '../../../test/fakes/districts-fakes.js';
import { NotFoundError, ValidationError } from '../../common/errors/app-error.js';
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
    });
    expect((await setup().service.list(Province.CENTRAL)).map((d) => d.id)).toEqual(['kandy', 'matale']);
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
    await expect(service.follow('u1', 'kandy')).resolves.toEqual({ followerCount: 1, followedByMe: true });
    await expect(service.follow('u1', 'kandy')).resolves.toEqual({ followerCount: 1, followedByMe: true });
    await expect(service.unfollow('u1', 'kandy')).resolves.toEqual({ followerCount: 0, followedByMe: false });
    await expect(service.unfollow('u1', 'kandy')).resolves.toEqual({ followerCount: 0, followedByMe: false });
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

  it('rejects invalid cursors', async () => {
    await expect(setup().service.residents('kandy', { limit: 2, cursor: 'garbage' })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});
