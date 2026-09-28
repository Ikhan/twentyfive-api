import type { NewReport } from './moderation.types.js';

export interface ReportsRepository {
  /** Records the report; reporting the same target again changes nothing. */
  create(report: NewReport): Promise<void>;
  /** The post a comment belongs to, or null if the comment doesn't exist. */
  commentPostId(commentId: string): Promise<string | null>;
  userExists(userId: string): Promise<boolean>;
}

export const REPORTS_REPOSITORY = Symbol('REPORTS_REPOSITORY');
