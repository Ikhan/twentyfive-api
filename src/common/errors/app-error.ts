import { HttpStatus } from '@nestjs/common';

/**
 * Base class for expected, user-facing failures raised by services.
 * Services throw these instead of Nest HTTP exceptions, which keeps business
 * logic independent of the transport layer; AllExceptionsFilter maps them to HTTP.
 */
export abstract class AppError extends Error {
  abstract readonly status: HttpStatus;
  abstract readonly code: string;

  constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  readonly status = HttpStatus.NOT_FOUND;
  readonly code = 'NOT_FOUND';
}

export class ForbiddenError extends AppError {
  readonly status = HttpStatus.FORBIDDEN;
  readonly code = 'FORBIDDEN';
}

export class UnauthorizedError extends AppError {
  readonly status = HttpStatus.UNAUTHORIZED;
  readonly code = 'UNAUTHORIZED';
}

export class ConflictError extends AppError {
  readonly status = HttpStatus.CONFLICT;
  readonly code = 'CONFLICT';
}

export class ValidationError extends AppError {
  readonly status = HttpStatus.BAD_REQUEST;
  readonly code = 'VALIDATION_FAILED';
}
