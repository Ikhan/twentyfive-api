import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { Params } from 'nestjs-pino';
import type { Options } from 'pino-http';
import type { AuthenticatedRequest } from '../auth-user.js';

export const REQUEST_ID_HEADER = 'x-request-id';

/** Ids we accept from upstream (load balancer, client): short, plain characters, nothing to inject into logs. */
const SAFE_ID = /^[A-Za-z0-9._-]{8,64}$/;

/** The incoming request id if it's sensible (so one id follows a request across services), else a new one. */
export function requestIdFor(incoming: unknown): string {
  return typeof incoming === 'string' && SAFE_ID.test(incoming) ? incoming : randomUUID();
}

/** Paths without their query: OAuth callbacks carry one-time codes there, and searches carry what people typed. */
const pathOf = (url: string | undefined): string => (url ?? '').split('?')[0]!;

/** The load balancer polls this every few seconds; logging it would drown everything else. */
const isHealthCheck = (req: IncomingMessage): boolean => /\/health\/?$/.test(pathOf(req.url));

export interface LoggerSettings {
  level: string;
  /** Human-readable lines for local development; JSON (one object per line) everywhere else. */
  pretty: boolean;
}

/**
 * pino-http settings: one JSON line per request (method, path, status, time, request id, signed-in user),
 * 5xx as errors and 4xx as warnings, with credentials blanked out. The request id is sent back in the
 * `x-request-id` header (and in error responses) so a user's problem can be found in the logs.
 */
export function httpLoggerOptions({ level, pretty }: LoggerSettings): Options {
  return {
    level,
    genReqId: (req: IncomingMessage, res: ServerResponse) => {
      const id = requestIdFor(req.headers[REQUEST_ID_HEADER]);
      res.setHeader(REQUEST_ID_HEADER, id);
      return id;
    },
    // Evaluated again when the response finishes, by which time authentication has run.
    customProps: (req: IncomingMessage) => {
      const userId = (req as IncomingMessage & AuthenticatedRequest).user?.id;
      return userId ? { userId } : {};
    },
    customLogLevel: (_req, res, error) =>
      error || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
    autoLogging: { ignore: isHealthCheck },
    serializers: {
      req: (req: { id: string; method: string; url: string }) => ({
        id: req.id,
        method: req.method,
        url: pathOf(req.url),
      }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
    // Belt and braces: the serializers above already leave headers out.
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-csrf-token"]',
        'res.headers["set-cookie"]',
      ],
      censor: '[redacted]',
    },
    ...(pretty && { transport: { target: 'pino-pretty', options: { singleLine: true, ignore: 'pid,hostname' } } }),
  };
}

/** nestjs-pino settings: our request logs, and Nest's own logs routed through the same pino logger. */
export function loggerModuleParams(settings: LoggerSettings): Params {
  return { pinoHttp: httpLoggerOptions(settings) };
}
