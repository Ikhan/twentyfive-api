import { EventEmitter2 } from '@nestjs/event-emitter';
import { InMemoryCommentsRepository } from '../../../test/fakes/comments-fakes.js';
import { FakeObjectStorage, InMemoryMediaRepository } from '../../../test/fakes/media-fakes.js';
import { InMemoryPostsRepository } from '../../../test/fakes/posts-fakes.js';
import { ValidationError } from '../../common/errors/app-error.js';
import { DomainEvent } from '../../common/events/domain-events.js';
import { MediaService } from '../media/media.service.js';
import { PostNotFoundError } from '../posts/posts.errors.js';
import { PostsService } from '../posts/posts.service.js';
import { CannotDeleteCommentError, CommentNotFoundError } from './comments.errors.js';
import { CommentsService, MAX_COMMENT_LENGTH } from './comments.service.js';

async function setup() {
  const posts = new InMemoryPostsRepository();
  const postsService = new PostsService(
    posts,
    new MediaService(new InMemoryMediaRepository(), new FakeObjectStorage()),
    new EventEmitter2(),
  );
  const repo = new InMemoryCommentsRepository((id) => posts.posts.find((p) => p.id === id)!.author.id);
  const events = new EventEmitter2();
  const emitted: unknown[] = [];
  events.on(DomainEvent.CommentCreated, (e) => emitted.push(e));
  const service = new CommentsService(repo, postsService, events);
  const publicPost = await postsService.create('u-kasun', { body: 'Perahera tonight', districtId: 'kandy' });
  const privatePost = await postsService.create('u-sachini', { body: 'Secret', districtId: 'galle' });
  return { service, repo, emitted, publicPost, privatePost };
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
});
