import { HttpStatus } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error.js';

export class ServiceUnavailableError extends AppError {
  readonly status = HttpStatus.SERVICE_UNAVAILABLE;
  readonly code = 'SERVICE_UNAVAILABLE';
}
