import { EventEmitter2 } from '@nestjs/event-emitter';
import { FakeObjectStorage, InMemoryMediaRepository } from '../../../test/fakes/media-fakes.js';
import { InMemoryReportsRepository } from '../../../test/fakes/moderation-fakes.js';
import { InMemoryPostsRepository } from '../../../test/fakes/posts-fakes.js';
import { MediaService } from '../media/media.service.js';
import { PostsService } from '../posts/posts.service.js';
import { CannotReportSelfError, ReportTargetNotFoundError } from './moderation.errors.js';
import { ReportsService } from './reports.service.js';

async function setup() {
  const postsRepo = new InMemoryPostsRepository();
  const posts = new PostsService(
    postsRepo,
    new MediaService(new InMemoryMediaRepository(), new FakeObjectStorage()),
    new EventEmitter2(),
  );
  const repo = new InMemoryReportsRepository();
  const service = new ReportsService(repo, posts);
  const publicPost = await posts.create('u-kasun', { body: 'public', districtId: 'kandy' });
  const privatePost = await posts.create('u-sachini', { body: 'private', districtId: 'galle' });
  repo.comments.set('c-public', publicPost.id).set('c-private', privatePost.id);
  return { service, repo, posts, publicPost, privatePost };
}

const report = (targetType: 'POST' | 'COMMENT' | 'USER', targetId: string, details = '') => ({
  reporterId: 'u-arun',
  targetType,
  targetId,
  reason: 'SPAM' as const,
  details,
});

describe('ReportsService', () => {
  it('reports posts, comments and people you can see, once each', async () => {
    const { service, repo, publicPost } = await setup();
    await service.report(report('POST', publicPost.id, '  selling fake tickets  '));
    await service.report(report('POST', publicPost.id));
    await service.report(report('COMMENT', 'c-public'));
    await service.report(report('USER', 'u-sachini'));
    expect(repo.reports.map((r) => [r.targetType, r.targetId, r.details])).toEqual([
      ['POST', publicPost.id, 'selling fake tickets'],
      ['COMMENT', 'c-public', ''],
      ['USER', 'u-sachini', ''],
    ]);
  });

  it('cannot report what you cannot see or what does not exist', async () => {
    const { service, repo, privatePost } = await setup();
    await expect(service.report(report('POST', privatePost.id))).rejects.toThrow(ReportTargetNotFoundError);
    await expect(service.report(report('COMMENT', 'c-private'))).rejects.toThrow(ReportTargetNotFoundError);
    await expect(service.report(report('COMMENT', 'c-missing'))).rejects.toThrow(ReportTargetNotFoundError);
    await expect(service.report(report('USER', 'u-ghost'))).rejects.toThrow(ReportTargetNotFoundError);
    await expect(service.report(report('USER', 'u-arun'))).rejects.toThrow(CannotReportSelfError);
    expect(repo.reports).toEqual([]);
  });

  it('passes on unexpected errors', async () => {
    const { service, posts } = await setup();
    vi.spyOn(posts, 'get').mockRejectedValueOnce(new Error('db down'));
    await expect(service.report(report('POST', 'p1'))).rejects.toThrow('db down');
  });
});
