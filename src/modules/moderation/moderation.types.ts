export type ReportTarget = 'POST' | 'COMMENT' | 'USER';

export const REPORT_REASONS = ['SPAM', 'HARASSMENT', 'HATE', 'VIOLENCE', 'NUDITY', 'MISINFORMATION', 'OTHER'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export interface NewReport {
  reporterId: string;
  targetType: ReportTarget;
  targetId: string;
  reason: ReportReason;
  details: string;
}

export interface BlockTarget {
  id: string;
  username: string;
}
