import { NotFoundError, ValidationError } from '../../common/errors/app-error.js';

export class CannotBlockSelfError extends ValidationError {
  constructor() {
    super('You can’t block yourself.');
  }
}

export class CannotReportSelfError extends ValidationError {
  constructor() {
    super('You can’t report yourself.');
  }
}

export class ReportTargetNotFoundError extends NotFoundError {
  constructor() {
    super('We couldn’t find what you’re reporting.');
  }
}
