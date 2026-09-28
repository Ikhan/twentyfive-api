import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import type { ApiError, ApiResponse } from '../api-response.js';
import { AppError } from '../errors/app-error.js';

const CODE_BY_STATUS: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
};

/**
 * Turns every thrown error into the standard { success: false, error } envelope.
 * Expected errors keep their message; anything unexpected is logged with its
 * stack server-side and returned as a generic 500 so internals never leak.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const { status, error } = this.toApiError(exception);
    const body: ApiResponse<null> = { success: false, data: null, error };
    response.status(status).json(body);
  }

  private toApiError(exception: unknown): { status: number; error: ApiError } {
    if (exception instanceof AppError) {
      return {
        status: exception.status,
        error: {
          code: exception.code,
          message: exception.message,
          ...(exception.details !== undefined && { details: exception.details }),
        },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      // ValidationPipe puts the list of field errors in `message`.
      const messages =
        typeof res === 'object' && res !== null && 'message' in res ? (res as { message: unknown }).message : undefined;
      if (status === HttpStatus.BAD_REQUEST && Array.isArray(messages)) {
        return { status, error: { code: 'VALIDATION_FAILED', message: 'Some fields are invalid.', details: messages } };
      }
      return { status, error: { code: CODE_BY_STATUS[status] ?? 'HTTP_ERROR', message: exception.message } };
    }

    this.logger.error('Unhandled error', exception instanceof Error ? exception.stack : String(exception));
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
    };
  }
}
