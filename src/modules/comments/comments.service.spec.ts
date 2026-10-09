import { EventEmitter2 } from '@nestjs/event-emitter';
import { InMemoryCommentsRepository } from '../../../test/fakes/comments-fakes.js';
import {
  FakeObjectStorage,
  FakePhotoPreviewer,
  FakeVideoProbe,
  InMemoryMediaRepository,
  JPEG,
} from '../../../test/fakes/media-fakes.js';
import { FakeLinkPreviews, InMemoryPostsRepository } from '../../../test/fakes/posts-fakes.js';
import { ValidationError } from '../../common/errors/app-error.js';
import { DomainEvent } from '../../common/events/domain-events.js';
import { MediaService } from '../media/media.service.js';
import { PostNotFoundError } from '../posts/posts.errors.js';
import { PostsService } from '../posts/posts.service.js';
import { CannotDeleteCommentError, CommentNotFoundError } from './comments.errors.js';
import { CommentsService, MAX_COMMENT_LENGTH } from './comments.service.js';

async function setup() {
  const posts = new InMemoryPostsRepository();
  const storage = new FakeObjectStorage();
  const videos = new FakeVideoProbe();
  const media = new MediaService(new InMemoryMediaRepository(), storage, videos, new FakePhotoPreviewer());
  const postsService = new PostsService(posts, media, new EventEmitter2(), new FakeLinkPreviews());
  const repo = new InMemoryCommentsRepository((id) => posts.posts.find((p) => p.id === id)!.author.id);
  const events = new EventEmitter2();
  const emitted: unknown[] = [];
  events.on(DomainEvent.CommentCreated, (e) => emitted.push(e));
  const service = new CommentsService(repo, postsService, events, media);
  const publicPost = await postsService.create('u-kasun', { body: 'Perahera tonight', districtId: 'kandy' });
  const privatePost = await postsService.create('u-sachini', { body: 'Secret', districtId: 'galle' });
  return { service, repo, emitted, publicPost, privatePost, media, storage, videos };
}

describe('CommentsService', () => {
  it('adds a trimmed comment and announces it', async () => {
    const { service, emitted, publicPost } = await setup();
    const comment = await service.add('u-arun', publicPost.id, '  So good!  ');
    expect(comment).toMatchObject({ body: 'So good!', postId: publicPost.id, author: { id: 'u-arun' } });
    expect(emitted).toEqual([
      {
        commentId: comment.id,
        postId: publicPost.id,
        postAuthorId: 'u-kasun',
        commenterId: 'u-arun',
        excerpt: 'So good!',
      },
    ]);
  });

  it('shortens the excerpt for long comments', async () => {
    const { service, emitted, publicPost } = await setup();
    await service.add('u-arun', publicPost.id, 'a'.repeat(300));
    expect((emitted[0] as { excerpt: string }).excerpt).toHaveLength(120);
  });

  it('rejects empty and overlong comments', async () => {
    const { service, publicPost } = await setup();
    await expect(service.add('u-arun', publicPost.id, '   ')).rejects.toThrow(ValidationError);
    await expect(service.add('u-arun', publicPost.id, 'x'.repeat(MAX_COMMENT_LENGTH + 1))).rejects.toThrow(
      ValidationError,
    );
  });

  it('follows the post’s visibility', async () => {
    const { service, emitted, privatePost } = await setup();
    await expect(service.add('u-arun', privatePost.id, 'hi')).rejects.toThrow(PostNotFoundError);
    await expect(service.list('u-arun', privatePost.id, { limit: 10 })).rejects.toThrow(PostNotFoundError);
    expect(emitted).toEqual([]);
  });

  it('lists oldest first, one page at a time', async () => {
    const { service, publicPost } = await setup();
    for (const body of ['one', 'two', 'three']) await service.add('u-arun', publicPost.id, body);
    const first = await service.list('u-kasun', publicPost.id, { limit: 2 });
    expect(first.items.map((c) => c.body)).toEqual(['one', 'two']);
    const second = await service.list('u-kasun', publicPost.id, { limit: 2, cursor: first.meta.nextCursor! });
    expect(second.items.map((c) => c.body)).toEqual(['three']);
    expect(second.meta.nextCursor).toBeNull();
  });

  it('rejects a tampered cursor', async () => {
    const { service, publicPost } = await setup();
    const bad = Buffer.from(JSON.stringify({ t: 'nope', id: 'x' })).toString('base64url');
    await expect(service.list('u-kasun', publicPost.id, { limit: 2, cursor: bad })).rejects.toThrow(ValidationError);
  });

  it('lets the comment’s author or the post’s author delete it, nobody else', async () => {
    const { service, repo, publicPost } = await setup();
    const a = await service.add('u-arun', publicPost.id, 'mine');
    const b = await service.add('u-arun', publicPost.id, 'on your post');
    await expect(service.remove('u-sachini', a.id)).rejects.toThrow(CannotDeleteCommentError);
    await service.remove('u-arun', a.id);
    await service.remove('u-kasun', b.id);
    expect(repo.comments).toEqual([]);
    await expect(service.remove('u-arun', a.id)).rejects.toThrow(CommentNotFoundError);
  });

  it('tells people mentioned in a comment, except the post’s author (who gets the comment)', async () => {
    const posts = new InMemoryPostsRepository();
    const events = new EventEmitter2();
    const mentioned: unknown[] = [];
    events.on(DomainEvent.UsersMentioned, (e) => mentioned.push(e));
    const media = new MediaService(
      new InMemoryMediaRepository(),
      new FakeObjectStorage(),
      new FakeVideoProbe(),
      new FakePhotoPreviewer(),
    );
    const postsService = new PostsService(posts, media, events, new FakeLinkPreviews());
    const repo = new InMemoryCommentsRepository((id) => posts.posts.find((p) => p.id === id)!.author.id);
    const service = new CommentsService(repo, postsService, events, media);
    const post = await postsService.create('u-kasun', { body: 'Perahera tonight' });
    const comment = await service.add('u-arun', post.id, '@kasun @sachini see you there, @nobody');
    expect(comment.mentions).toEqual(['kasun', 'sachini']);
    expect(mentioned).toEqual([
      {
        mentionerId: 'u-arun',
        recipientIds: ['u-sachini'],
        postId: post.id,
        commentId: comment.id,
        excerpt: '@kasun @sachini see you there, @nobody',
      },
    ]);
    const listed = await service.list('u-kasun', post.id, { limit: 5 });
    expect(listed.items[0]!.mentions).toEqual(['kasun', 'sachini']);
  });

  describe('replies', () => {
    it('replies under a comment, one level deep, telling whoever was answered', async () => {
      const { service, emitted, publicPost } = await setup();
      const top = await service.add('u-arun', publicPost.id, 'Who is going?');
      const reply = await service.add('u-sachini', publicPost.id, 'Me!', top.id);
      expect(reply).toMatchObject({ parentId: top.id, replyCount: 0 });
      // Answering a reply joins the same thread, but tells the reply's author.
      const answer = await service.add('u-kasun', publicPost.id, '@sachini see you', reply.id);
      expect(answer.parentId).toBe(top.id);
      expect(emitted.slice(1).map((e) => (e as { repliedTo?: unknown }).repliedTo)).toEqual([
        { commentId: top.id, authorId: 'u-arun' },
        { commentId: reply.id, authorId: 'u-sachini' },
      ]);
      const listed = await service.list('u-kasun', publicPost.id, { limit: 10 });
      expect(listed.items.map((c) => [c.body, c.replyCount])).toEqual([['Who is going?', 2]]);
      const replies = await service.replies('u-kasun', top.id, { limit: 1 });
      expect(replies.items.map((c) => c.body)).toEqual(['Me!']);
      const more = await service.replies('u-kasun', top.id, { limit: 1, cursor: replies.meta.nextCursor! });
      expect(more.items.map((c) => [c.body, c.mentions])).toEqual([['@sachini see you', ['sachini']]]);
    });

    it('only replies to comments on the same post, and follows the post’s visibility', async () => {
      const { service, publicPost, privatePost } = await setup();
      const top = await service.add('u-arun', publicPost.id, 'Hello');
      await expect(service.add('u-arun', publicPost.id, 'hi', '00000000-0000-0000-0000-000000000000')).rejects.toThrow(
        CommentNotFoundError,
      );
      const hidden = await service.add('u-sachini', privatePost.id, 'secret');
      await expect(service.add('u-arun', publicPost.id, 'hi', hidden.id)).rejects.toThrow(CommentNotFoundError);
      await expect(service.replies('u-arun', hidden.id, { limit: 5 })).rejects.toThrow(PostNotFoundError);
      await expect(service.replies('u-arun', 'nope', { limit: 5 })).rejects.toThrow(CommentNotFoundError);
      expect((await service.replies('u-kasun', top.id, { limit: 5 })).items).toEqual([]);
    });

    it('deletes a comment’s replies with it', async () => {
      const { service, repo, publicPost } = await setup();
      const top = await service.add('u-arun', publicPost.id, 'Hello');
      await service.add('u-kasun', publicPost.id, 'Hi back', top.id);
      await service.remove('u-kasun', top.id); // the post's author
      expect(repo.comments).toEqual([]);
    });
  });

  describe('photos and videos', () => {
    type Ctx = Awaited<ReturnType<typeof setup>>;
    async function readyPhoto(ctx: Ctx, owner = 'u-arun') {
      const ticket = await ctx.media.createUpload(owner, {
        purpose: 'POST_PHOTO',
        contentType: 'image/jpeg',
        sizeBytes: 100,
      });
      ctx.storage.put(ctx.storage.presigned.at(-1)!.key, JPEG, 100);
      await ctx.media.complete(owner, ticket.mediaId);
      return ticket.mediaId;
    }
    async function readyVideo(ctx: Ctx, owner = 'u-arun') {
      const size = 5000 + ctx.storage.presigned.length;
      ctx.videos.details.set(size, { durationSeconds: 45, width: 720, height: 1280 });
      const ticket = await ctx.media.createUpload(owner, {
        purpose: 'POST_VIDEO',
        contentType: 'video/mp4',
        sizeBytes: size,
      });
      ctx.storage.put(ctx.storage.presigned.at(-1)!.key, new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]), size);
      await ctx.media.complete(owner, ticket.mediaId);
      return ticket.mediaId;
    }

    it('comments and replies with photos (even without text), in order', async () => {
      const ctx = await setup();
      const [a, b] = [await readyPhoto(ctx), await readyPhoto(ctx)];
      const comment = await ctx.service.add('u-arun', ctx.publicPost.id, undefined, undefined, { mediaIds: [b, a] });
      expect(comment.body).toBe('');
      expect(comment.photos.map((p) => p.id)).toEqual([b, a]);
      expect(comment.video).toBeNull();
      const reply = await ctx.service.add('u-kasun', ctx.publicPost.id, 'Lovely', comment.id, {
        mediaIds: [await readyPhoto(ctx, 'u-kasun')],
      });
      expect(reply).toMatchObject({
        parentId: comment.id,
        photos: [expect.objectContaining({ url: expect.stringContaining('post_photo') })],
      });
    });

    it('comments with one video', async () => {
      const ctx = await setup();
      const videoId = await readyVideo(ctx);
      const comment = await ctx.service.add('u-arun', ctx.publicPost.id, 'Watch', undefined, { videoId });
      expect(comment.video).toMatchObject({ id: videoId, durationSeconds: 45, width: 720, height: 1280 });
      const listed = await ctx.service.list('u-kasun', ctx.publicPost.id, { limit: 5 });
      expect(listed.items[0]!.video).toMatchObject({ id: videoId });
    });

    it('refuses empty comments, photos with a video, too many photos, and other people’s uploads', async () => {
      const ctx = await setup();
      await expect(ctx.service.add('u-arun', ctx.publicPost.id, '  ')).rejects.toThrow(
        'Write a comment or add a photo or video.',
      );
      const photo = await readyPhoto(ctx);
      const videoId = await readyVideo(ctx);
      await expect(
        ctx.service.add('u-arun', ctx.publicPost.id, 'x', undefined, { mediaIds: [photo], videoId }),
      ).rejects.toThrow('A comment can have photos or a video, not both.');
      const five: string[] = [];
      for (let i = 0; i < 5; i++) five.push(await readyPhoto(ctx));
      await expect(ctx.service.add('u-arun', ctx.publicPost.id, 'x', undefined, { mediaIds: five })).rejects.toThrow(
        'You can add up to 4 photos.',
      );
      await expect(ctx.service.add('u-kasun', ctx.publicPost.id, 'x', undefined, { videoId })).rejects.toThrow(
        'That video is missing or still uploading.',
      );
    });
  });
});
