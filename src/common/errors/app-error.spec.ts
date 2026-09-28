import { HttpStatus } from '@nestjs/common';
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from './app-error.js';

describe('AppError subclasses', () => {
  it.each([
    [NotFoundError, HttpStatus.NOT_FOUND, 'NOT_FOUND'],
    [ForbiddenError, HttpStatus.FORBIDDEN, 'FORBIDDEN'],
    [UnauthorizedError, HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED'],
    [ConflictError, HttpStatus.CONFLICT, 'CONFLICT'],
    [ValidationError, HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED'],
  ])('%o carries its status and code', (ErrorClass, status, code) => {
    const error = new ErrorClass('message', { field: 'x' });
    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(status);
    expect(error.code).toBe(code);
    expect(error.message).toBe('message');
    expect(error.details).toEqual({ field: 'x' });
    expect(error.name).toBe(ErrorClass.name);
  });
});
