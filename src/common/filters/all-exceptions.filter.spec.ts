import { ArgumentsHost, BadRequestException, HttpStatus, Logger, NotFoundException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { ConflictError, NotFoundError } from '../errors/app-error.js';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

function run(exception: unknown) {
  const json = vi.fn();
  const status = vi.fn((_code: number) => ({ json }));
  const host = { switchToHttp: () => ({ getResponse: () => ({ status }) }) } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  return { status: status.mock.calls[0]?.[0], body: json.mock.calls[0]?.[0] };
}

describe('AllExceptionsFilter', () => {
  it('maps AppError subclasses to their status, code and message', () => {
    expect(run(new NotFoundError('Post not found'))).toEqual({
      status: HttpStatus.NOT_FOUND,
      body: { success: false, data: null, error: { code: 'NOT_FOUND', message: 'Post not found' } },
    });
  });

  it('keeps AppError details when present', () => {
    const { body } = run(new ConflictError('Username is taken', { field: 'username' }));
    expect(body.error).toEqual({ code: 'CONFLICT', message: 'Username is taken', details: { field: 'username' } });
  });

  it('turns ValidationPipe errors into VALIDATION_FAILED with field messages', () => {
    const { status, body } = run(new BadRequestException(['body must be shorter than or equal to 1000 characters']));
    expect(status).toBe(400);
    expect(body.error).toEqual({
      code: 'VALIDATION_FAILED',
      message: 'Some fields are invalid.',
      details: ['body must be shorter than or equal to 1000 characters'],
    });
  });

  it('maps Nest HTTP exceptions to stable codes', () => {
    expect(run(new NotFoundException('Cannot GET /nope')).body.error.code).toBe('NOT_FOUND');
    expect(run(new ThrottlerException()).body.error.code).toBe('RATE_LIMITED');
  });

  it('hides unexpected errors behind a generic 500 and logs them', () => {
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { status, body } = run(new Error('connection string postgres://secret'));
    expect(status).toBe(500);
    expect(body.error).toEqual({ code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' });
    expect(JSON.stringify(body)).not.toContain('secret');
    expect(log).toHaveBeenCalled();
  });
});
