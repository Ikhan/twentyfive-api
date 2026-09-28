import { EventEmitter2 } from '@nestjs/event-emitter';
import { FakeObjectStorage, InMemoryMediaRepository } from '../../../test/fakes/media-fakes.js';
import { InMemoryPostsRepository } from '../../../test/fakes/posts-fakes.js';
import { InMemoryReactionsRepository } from '../../../test/fakes/reactions-fakes.js';
import { DomainEvent } from '../../common/events/domain-events.js';
import { MediaService } from '../media/media.service.js';
import { PostNotFoundError } from '../posts/posts.errors.js';
import { PostsService } from '../posts/posts.service.js';
import { CannotRepostError } from './reactions.errors.js';
import { ReactionsService } from './reactions.service.js';

async function setup() {
  const postsRepo = new InMemoryPostsRepository();
  const posts = new PostsService(postsRepo, new MediaService(new InMemoryMediaRepository(), new FakeObjectStorage()));
  const repo = new InMemoryReactionsRepository();
  const events = new EventEmitter2();
  const reposted: unknown[] = [];
  events.on(DomainEvent.PostReposted, (e) => reposted.push(e));
  const service = new ReactionsService(repo, posts, events);
  const publicPost = await posts.create('u-kasun', { body: 'public', districtId: 'kandy' });
  const followersPost = await posts.create('u-kasun', { body: 'fans', districtId: 'kandy', audience: 'FOLLOWERS' });
  const privatePost = await posts.create('u-sachini', { body: 'private', districtId: 'galle' });
  return { service, repo, postsRepo, reposted, publicPost, followersPost, privatePost };
}

describe('ReactionsService', () => {
  it('likes and unlikes idempotently, returning the post', async () => {
    const { service, repo, publicPost } = await setup();
    await expect(service.add('u-arun', publicPost.id, 'like')).resolves.toMatchObject({ id: publicPost.id });
    await service.add('u-arun', publicPost.id, 'like');
    expect([...repo.reactions]).toEqual([`like:u-arun>${publicPost.id}`]);
    await service.remove('u-arun', publicPost.id, 'like');
    await service.remove('u-arun', publicPost.id, 'like');
    expect(repo.reactions.size).toBe(0);
  });

  it('can like any post you can see, including followers-only ones', async () => {
    const { service, postsRepo, followersPost, privatePost } = await setup();
    await expect(service.add('u-arun', privatePost.id, 'like')).rejects.toThrow(PostNotFoundError);
    postsRepo.approved.add('u-arun>u-kasun');
    await expect(service.add('u-arun', followersPost.id, 'like')).resolves.toBeDefined();
  });

  it('reposts public posts and announces the first repost only', async () => {
    const { service, reposted, publicPost } = await setup();
    await service.add('u-arun', publicPost.id, 'repost');
    await service.add('u-arun', publicPost.id, 'repost');
    expect(reposted).toEqual([{ postId: publicPost.id, postAuthorId: 'u-kasun', reposterId: 'u-arun' }]);
    await service.remove('u-arun', publicPost.id, 'repost');
  });

  it('refuses to repost followers-only posts or private accounts', async () => {
    const { service, postsRepo, reposted, followersPost, privatePost } = await setup();
    postsRepo.approved.add('u-arun>u-kasun').add('u-arun>u-sachini');
    await expect(service.add('u-arun', followersPost.id, 'repost')).rejects.toThrow(CannotRepostError);
    await expect(service.add('u-arun', privatePost.id, 'repost')).rejects.toThrow(CannotRepostError);
    await expect(service.add('u-kasun', followersPost.id, 'repost')).rejects.toThrow(CannotRepostError);
    expect(reposted).toEqual([]);
  });
});
