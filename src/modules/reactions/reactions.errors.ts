import { ForbiddenError } from '../../common/errors/app-error.js';

export class CannotRepostError extends ForbiddenError {
  constructor() {
    super('Only public posts can be reposted.');
  }
}
