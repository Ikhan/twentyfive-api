import { NotFoundError, ValidationError } from '../../common/errors/app-error.js';

export class MediaNotFoundError extends NotFoundError {
  constructor() {
    super('Photo not found.');
  }
}

export class InvalidUploadError extends ValidationError {}
