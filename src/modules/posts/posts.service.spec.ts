import { EventEmitter2 } from '@nestjs/event-emitter';
import { FakeObjectStorage, InMemoryMediaRepository, JPEG } from '../../../test/fakes/media-fakes.js';
import { FakeLinkPreviews, InMemoryPostsRepository } from '../../../test/fakes/posts-fakes.js';
import { NotFoundError, ValidationError } from '../../common/errors/app-error.js';
import { DomainEvent } from '../../common/events/domain-events.js';
import { InvalidUploadError } from '../media/media.errors.js';
import { MediaService } from '../media/media.service.js';
import {
  CannotQuoteError,
  EmptyPostError,
  NotYourPostError,
  PostNotFoundError,
  PrivateAccountError,
} from './posts.errors.js';
import { PostsService } from './posts.service.js';

function setup() {
  const repo = new InMemoryPostsRepository();
  const storage = new FakeObjectStorage();
  const media = new MediaService(new InMemoryMediaRepository(), storage);
  const events = new EventEmitter2();
  const quoted: unknown[] = [];
  events.on(DomainEvent.PostQuoted, (e) => quoted.push(e));
  const links = new FakeLinkPreviews({
    'https://www.nytimes.com/international/': {
      url: 'https://www.nytimes.com/international/',
      title: 'International News',
      description: 'World news',
      image: 'https://static01.nyt.com/card.jpg',
      siteName: 'The New York Times',
    },
  });
  const mentioned: unknown[] = [];
  events.on(DomainEvent.UsersMentioned, (e) => mentioned.push(e));
  return { repo, storage, media, quoted, mentioned, links, service: new PostsService(repo, media, events, links) };
}

async function readyPhoto(ctx: ReturnType<typeof setup>, owner = 'u-kasun') {
  const ticket = await ctx.media.createUpload(owner, {
    purpose: 'POST_PHOTO',
    contentType: 'image/jpeg',
    sizeBytes: 100,
  });
  ctx.storage.put(ctx.storage.presigned.at(-1)!.key, JPEG, 100);
  await ctx.media.complete(owner, ticket.mediaId);
  return ticket.mediaId;
}

describe('PostsService', () => {
  describe('create', () => {
    it('creates a trimmed text post about a district, public by default', async () => {
      const post = await setup().service.create('u-kasun', {
        body: '  Esala Perahera tonight!  ',
        districtId: 'kandy',
      });
      expect(post).toMatchObject({
        body: 'Esala Perahera tonight!',
        audience: 'EVERYONE',
        district: { id: 'kandy' },
        photos: [],
      });
    });

    it('creates a post about no particular district (all districts)', async () => {
      const post = await setup().service.create('u-kasun', { body: 'Power cut again?' });
      expect(post).toMatchObject({ body: 'Power cut again?', district: null });
    });

    it('attaches verified photos in order', async () => {
      const ctx = setup();
      const a = await readyPhoto(ctx);
      const b = await readyPhoto(ctx);
      const post = await ctx.service.create('u-kasun', {
        districtId: 'badulla',
        mediaIds: [b, a],
        audience: 'FOLLOWERS',
      });
      expect(post.photos.map((p) => p.id)).toEqual([b, a]);
      expect(post.audience).toBe('FOLLOWERS');
    });

    it('needs text or a photo, within limits', async () => {
      const { service } = setup();
      await expect(service.create('u-kasun', { body: '   ', districtId: 'kandy' })).rejects.toBeInstanceOf(
        EmptyPostError,
      );
      await expect(service.create('u-kasun', { body: 'x'.repeat(1001), districtId: 'kandy' })).rejects.toBeInstanceOf(
        ValidationError,
      );
      const five = ['1', '2', '3', '4', '5'].map((n) => `00000000-0000-4000-8000-00000000000${n}`);
      await expect(service.create('u-kasun', { body: 'hi', districtId: 'kandy', mediaIds: five })).rejects.toThrow(
        'up to 4 photos',
      );
    });

    it('rejects unknown districts and photos that aren’t yours or aren’t ready', async () => {
      const ctx = setup();
      await expect(ctx.service.create('u-kasun', { body: 'hi', districtId: 'atlantis' })).rejects.toThrow(
        'isn’t one of',
      );
      const arunsPhoto = await readyPhoto(ctx, 'u-arun');
      await expect(
        ctx.service.create('u-kasun', { districtId: 'kandy', mediaIds: [arunsPhoto] }),
      ).rejects.toBeInstanceOf(InvalidUploadError);
    });
  });

  describe('visibility', () => {
    it('shows public posts to everyone, followers-only and private posts to approved followers only', async () => {
      const { service, repo } = setup();
      const open = await service.create('u-kasun', { body: 'public', districtId: 'kandy' });
      const friends = await service.create('u-kasun', { body: 'friends', districtId: 'kandy', audience: 'FOLLOWERS' });
      const privateAccount = await service.create('u-sachini', { body: 'mist', districtId: 'kandy' });

      await expect(service.get(open.id, 'u-arun')).resolves.toMatchObject({ body: 'public' });
      await expect(service.get(friends.id, 'u-arun')).rejects.toBeInstanceOf(PostNotFoundError);
      await expect(service.get(privateAccount.id, 'u-arun')).rejects.toBeInstanceOf(PostNotFoundError);
      await expect(service.get(friends.id, 'u-kasun')).resolves.toBeDefined();

      repo.approved.add('u-arun>u-kasun');
      repo.approved.add('u-arun>u-sachini');
      await expect(service.get(friends.id, 'u-arun')).resolves.toBeDefined();
      await expect(service.get(privateAccount.id, 'u-arun')).resolves.toBeDefined();
    });
  });

  describe('lists', () => {
    it('pages the feed newest first with a stable cursor', async () => {
      const { service } = setup();
      for (const n of [1, 2, 3]) await service.create('u-kasun', { body: `post ${n}`, districtId: 'kandy' });
      const first = await service.feed('u-arun', 'for-you', { limit: 2 });
      expect(first.items.map((p) => p.body)).toEqual(['post 3', 'post 2']);
      const second = await service.feed('u-arun', 'for-you', { limit: 2, cursor: first.meta.nextCursor! });
      expect(second.items.map((p) => p.body)).toEqual(['post 1']);
      expect(second.meta.nextCursor).toBeNull();
    });

    it('Following shows people you follow and yourself', async () => {
      const { service, repo } = setup();
      await service.create('u-kasun', { body: 'kasun', districtId: 'kandy' });
      await service.create('u-arun', { body: 'arun', districtId: 'galle' });
      expect((await service.feed('u-arun', 'following', { limit: 10 })).items.map((p) => p.body)).toEqual(['arun']);
      repo.approved.add('u-arun>u-kasun');
      expect((await service.feed('u-arun', 'following', { limit: 10 })).items.map((p) => p.body)).toEqual([
        'arun',
        'kasun',
      ]);
    });

    it('lists a district’s posts, 404 for unknown districts', async () => {
      const { service } = setup();
      await service.create('u-kasun', { body: 'kandy', districtId: 'kandy' });
      await service.create('u-kasun', { body: 'galle', districtId: 'galle' });
      expect((await service.byDistrict('u-arun', 'galle', { limit: 10 })).items.map((p) => p.body)).toEqual(['galle']);
      await expect(service.byDistrict('u-arun', 'atlantis', { limit: 10 })).rejects.toBeInstanceOf(NotFoundError);
    });

    it('lists a profile’s posts; private profiles need an approved follow', async () => {
      const { service, repo } = setup();
      await service.create('u-sachini', { body: 'mist', districtId: 'kandy' });
      await expect(service.byAuthor('u-arun', 'Sachini', { limit: 10 })).rejects.toBeInstanceOf(PrivateAccountError);
      await expect(service.byAuthor('u-sachini', 'sachini', { limit: 10 })).resolves.toMatchObject({
        items: [{ body: 'mist' }],
      });
      repo.approved.add('u-arun>u-sachini');
      await expect(service.byAuthor('u-arun', 'sachini', { limit: 10 })).resolves.toMatchObject({
        items: [{ body: 'mist' }],
      });
      await expect(service.byAuthor('u-arun', 'nobody', { limit: 10 })).rejects.toBeInstanceOf(NotFoundError);
    });

    it('rejects tampered cursors', async () => {
      const bad = Buffer.from(JSON.stringify({ t: 'not-a-date', id: 'x' })).toString('base64url');
      await expect(setup().service.feed('u-arun', 'for-you', { limit: 2, cursor: bad })).rejects.toBeInstanceOf(
        ValidationError,
      );
    });
  });

  describe('delete', () => {
    it('lets only the author delete, and 404s for missing posts', async () => {
      const { service } = setup();
      const post = await service.create('u-kasun', { body: 'hi', districtId: 'kandy' });
      await expect(service.delete(post.id, 'u-arun')).rejects.toBeInstanceOf(NotYourPostError);
      await service.delete(post.id, 'u-kasun');
      await expect(service.get(post.id, 'u-kasun')).rejects.toBeInstanceOf(PostNotFoundError);
      await expect(service.delete(post.id, 'u-kasun')).rejects.toBeInstanceOf(PostNotFoundError);
    });
  });

  describe('quotes', () => {
    it('quotes a public post, embedding it and announcing it', async () => {
      const { service, quoted } = setup();
      const original = await service.create('u-kasun', { body: 'Perahera tonight', districtId: 'kandy' });
      const quote = await service.create('u-arun', { body: 'Wish I was there', quotedPostId: original.id });
      expect(quote.quoted).toMatchObject({
        available: true,
        id: original.id,
        body: 'Perahera tonight',
        author: { id: 'u-kasun' },
      });
      expect(quoted).toEqual([
        {
          postId: quote.id,
          quotedPostId: original.id,
          quotedAuthorId: 'u-kasun',
          quoterId: 'u-arun',
          excerpt: 'Wish I was there',
        },
      ]);
      expect((await service.get(original.id, 'u-arun')).counts.quotes).toBe(1);
    });

    it('only quotes public posts', async () => {
      const { service, repo } = setup();
      const fansOnly = await service.create('u-kasun', { body: 'fans', districtId: 'kandy', audience: 'FOLLOWERS' });
      const privateAccount = await service.create('u-sachini', { body: 'secret', districtId: 'galle' });
      repo.approved.add('u-arun>u-kasun').add('u-arun>u-sachini');
      await expect(service.create('u-arun', { body: 'hm', quotedPostId: fansOnly.id })).rejects.toBeInstanceOf(
        CannotQuoteError,
      );
      await expect(service.create('u-arun', { body: 'hm', quotedPostId: privateAccount.id })).rejects.toBeInstanceOf(
        CannotQuoteError,
      );
    });

    it('refuses to quote posts you can’t see or that don’t exist', async () => {
      const { service } = setup();
      const hidden = await service.create('u-sachini', { body: 'secret', districtId: 'galle' });
      await expect(service.create('u-arun', { body: 'hm', quotedPostId: hidden.id })).rejects.toBeInstanceOf(
        PostNotFoundError,
      );
      await expect(service.create('u-arun', { body: 'hm', quotedPostId: 'nope' })).rejects.toBeInstanceOf(
        PostNotFoundError,
      );
    });

    it('needs something to say (an empty quote is a repost, made by the app)', async () => {
      const { service } = setup();
      const original = await service.create('u-kasun', { body: 'Perahera tonight', districtId: 'kandy' });
      await expect(service.create('u-arun', { body: '  ', quotedPostId: original.id })).rejects.toBeInstanceOf(
        EmptyPostError,
      );
    });
  });

  describe('mentions', () => {
    it('tells people mentioned in a post who can see it, and lists real handles for links', async () => {
      const { service, mentioned } = setup();
      const post = await service.create('u-kasun', { body: 'Perahera with @Arun, @sachini, @kasun and @nobody' });
      expect(post.mentions).toEqual(['arun', 'sachini', 'kasun']); // real accounts only
      expect(mentioned).toEqual([
        {
          mentionerId: 'u-kasun',
          recipientIds: ['u-arun', 'u-sachini'], // not yourself
          postId: post.id,
          commentId: undefined,
          excerpt: 'Perahera with @Arun, @sachini, @kasun and @nobody',
        },
      ]);
      await expect(service.get(post.id, 'u-arun')).resolves.toMatchObject({ mentions: ['arun', 'sachini', 'kasun'] });
      const feed = await service.feed('u-arun', 'for-you', { limit: 5 });
      expect(feed.items[0]!.mentions).toEqual(['arun', 'sachini', 'kasun']);
    });

    it('doesn’t tell people who can’t see the post, and stays quiet with no real mentions', async () => {
      const { service, repo, mentioned } = setup();
      await service.create('u-kasun', { body: 'Just for followers @arun @sachini', audience: 'FOLLOWERS' });
      expect(mentioned).toEqual([]);
      repo.approved.add('u-arun>u-kasun');
      await service.create('u-kasun', { body: 'Again @arun @sachini', audience: 'FOLLOWERS' });
      expect(mentioned).toEqual([expect.objectContaining({ recipientIds: ['u-arun'] })]);
      await service.create('u-kasun', { body: 'Nobody here @ghost, me@arun.lk' });
      expect(mentioned).toHaveLength(1);
    });

    it('doesn’t also send a mention to the author being quoted', async () => {
      const { service, mentioned, quoted } = setup();
      const original = await service.create('u-arun', { body: 'Jaffna crab curry' });
      await service.create('u-kasun', { body: 'Yes @arun!', quotedPostId: original.id });
      expect(quoted).toHaveLength(1);
      expect(mentioned).toEqual([]);
    });

    it('links handles in the quoted post too', async () => {
      const { service } = setup();
      const original = await service.create('u-arun', { body: 'Thanks @sachini' });
      const quote = await service.create('u-kasun', { body: 'Agreed', quotedPostId: original.id });
      expect(quote.mentions).toEqual(['sachini']);
    });
  });

  describe('link cards', () => {
    it('adds the card for the first link, and keeps it with the post', async () => {
      const { service, links } = setup();
      const post = await service.create('u-kasun', { body: 'Worth a read: https://www.nytimes.com/international/.' });
      expect(links.asked).toEqual(['https://www.nytimes.com/international/']);
      expect(post.link).toMatchObject({ title: 'International News', siteName: 'The New York Times' });
      await expect(service.get(post.id, 'u-arun')).resolves.toMatchObject({ link: { title: 'International News' } });
    });

    it('has no card without a link, when the page has none, or when the post has photos', async () => {
      const ctx = setup();
      await expect(ctx.service.create('u-kasun', { body: 'Just words' })).resolves.toMatchObject({ link: null });
      await expect(ctx.service.create('u-kasun', { body: 'https://nothing.lk/' })).resolves.toMatchObject({
        link: null,
      });
      const photo = await readyPhoto(ctx);
      const withPhoto = await ctx.service.create('u-kasun', {
        body: 'https://www.nytimes.com/international/',
        mediaIds: [photo],
      });
      expect(withPhoto.link).toBeNull();
      expect(ctx.links.asked).toEqual(['https://nothing.lk/']);
    });
  });
});
