import { Inject, Injectable } from '@nestjs/common';
import { PostNotFoundError } from '../posts/posts.errors.js';
import { PostsService } from '../posts/posts.service.js';
import { CannotReportSelfError, ReportTargetNotFoundError } from './moderation.errors.js';
import type { NewReport } from './moderation.types.js';
import { REPORTS_REPOSITORY, type ReportsRepository } from './reports.repository.js';

export const MAX_REPORT_DETAILS = 500;

@Injectable()
export class ReportsService {
  constructor(
    @Inject(REPORTS_REPOSITORY) private readonly reports: ReportsRepository,
    private readonly posts: PostsService,
  ) {}

  /** You can only report what you can see. Reporting the same thing twice is fine. */
  async report(input: NewReport): Promise<void> {
    await this.assertReportable(input);
    await this.reports.create({ ...input, details: input.details.trim() });
  }

  private async assertReportable({ reporterId, targetType, targetId }: NewReport): Promise<void> {
    switch (targetType) {
      case 'POST':
        return this.assertPostVisible(targetId, reporterId);
      case 'COMMENT': {
        const postId = await this.reports.commentPostId(targetId);
        if (!postId) throw new ReportTargetNotFoundError();
        return this.assertPostVisible(postId, reporterId);
      }
      case 'USER':
        if (targetId === reporterId) throw new CannotReportSelfError();
        if (!(await this.reports.userExists(targetId))) throw new ReportTargetNotFoundError();
    }
  }

  private async assertPostVisible(postId: string, viewerId: string): Promise<void> {
    try {
      await this.posts.get(postId, viewerId);
    } catch (error) {
      if (error instanceof PostNotFoundError) throw new ReportTargetNotFoundError();
      throw error;
    }
  }
}
