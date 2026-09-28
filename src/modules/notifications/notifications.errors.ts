import { NotFoundError } from '../../common/errors/app-error.js';

export class NotificationNotFoundError extends NotFoundError {
  constructor() {
    super('Notification not found.');
  }
}
